import OpenAI from 'openai'
import { db } from '@/db'
import { barbers as barbersTable } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { createBooking } from '@/lib/bookings/create'
import { canonicalizePhone } from '@/lib/phone'
import { BUSINESS_TIMEZONE } from '@/lib/time';
import { eurosToCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// Vision-based import — accepts 1-N screenshots (Booksy "Appointment List" or
// any visual agenda) and uses GPT-4o vision to extract structured bookings.
//
// Flow:
//   · POST with `{images: [dataURL, dataURL, ...], dryRun?: boolean}`.
//   · dryRun=true  → returns only the parsed bookings for preview/editing.
//   · dryRun=false → accepts `{items: [...parsed or edited]}` and bulk-inserts
//     through createBooking (same pipeline as the bot, dedupe, customer
//     upsert, auto-invoice if enabled).
//
// Tenant-safe: everything scoped via requireClientAccess. The LLM sees the
// caller's screenshots only — never other tenants' data.
// -----------------------------------------------------------------------------

function buildExtractionPrompt(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE }) // YYYY-MM-DD
  const weekday = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    timeZone: BUSINESS_TIMEZONE,
  })
  return `Eres un extractor de datos de una agenda de citas (Booksy, Treatwell, libreta, etc.). El usuario te pasa capturas de pantalla con reservas.

HOY ES ${today} (${weekday} en Europa/Madrid). ESTA es tu fecha de referencia para cualquier cálculo relativo. Ignora tu conocimiento de fechas — usa SIEMPRE la de arriba.

Devuelve SOLO un objeto JSON válido, sin markdown, con la forma:

{
  "bookings": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "customerName": "string o null",
      "customerPhone": "string o null (E.164 si lo intuyes, ej. +34600123456)",
      "service": "string",
      "barber": "string o null",
      "durationMinutes": 30,
      "priceEuros": null,
      "confidence": "high" | "medium" | "low",
      "notes": "texto libre si hay algo relevante"
    }
  ]
}

Reglas de fecha (CRÍTICO):
- Si la captura muestra fecha completa (día + mes + año) → usa esa.
- Si muestra solo día + mes (ej. "23 abr", "Lun 2 Oct") → usa el año actual (${today.slice(0, 4)}). Si el día+mes ya pasó este año, usa el año siguiente (la reserva es futura).
- Si muestra solo día de la semana (ej. "Lunes", "Mar") → calcula la próxima ocurrencia de ese día a partir de HOY.
- Si muestra fechas relativas ("hoy", "mañana", "ayer") → resuelve respecto a HOY.
- NUNCA devuelvas años anteriores a ${today.slice(0, 4)} salvo que la captura lo indique explícitamente. Marca confidence="low" si tienes que inferir el año.

Reglas generales:
- Si el precio no está visible, priceEuros = null.
- Si la duración no está visible, estima 30 min para corte normal, 45 para corte+barba, 60 para tratamientos largos. confidence="low" al estimar.
- customerPhone: solo si aparece literal en la captura. No inventes.
- Si un slot está bloqueado/descanso/vacaciones y NO es reserva, OMÍTELO.
- No inventes reservas no visibles.
- Si no lees nada útil, devuelve {"bookings": []}.`
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface ParsedBooking {
  date: string
  time: string
  customerName?: string | null
  customerPhone?: string | null
  service: string
  barber?: string | null
  durationMinutes?: number | null
  priceEuros?: number | null
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
}

interface RequestBody {
  images?: string[] // data URLs or plain https URLs
  items?: ParsedBooking[] // when user has edited the preview
  dryRun?: boolean
}

// Phone normalization now lives in the shared canonical util (see
// `@/lib/phone`). `normalisePhone` returns the canonical E.164 string for
// parseable input, or `null` when the OCR yielded no usable phone — the
// caller substitutes a pseudo-phone so the slot is still blocked. We treat
// "parsed but invalid" as null too: a placeholder is better than persisting
// OCR garbage that would never merge with the real customer.
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  const c = canonicalizePhone(raw)
  return c.valid ? c.value : null
}

async function extractWithVision(images: string[]): Promise<ParsedBooking[]> {
  const content = [
    { type: 'text' as const, text: buildExtractionPrompt() },
    ...images.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ]

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    max_tokens: 4000,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const raw = completion.choices[0]?.message?.content ?? '{"bookings": []}'
  const parsed = JSON.parse(raw) as { bookings?: ParsedBooking[] }
  return Array.isArray(parsed.bookings) ? parsed.bookings : []
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // ── Dry-run: extract + return preview ───────────────────────────────────
  if (!body.items) {
    const images = Array.isArray(body.images) ? body.images : []
    if (images.length === 0) {
      return Response.json({ error: 'Sube al menos una imagen.' }, { status: 400 })
    }
    if (images.length > 10) {
      return Response.json({ error: 'Máximo 10 imágenes por llamada.' }, { status: 400 })
    }
    try {
      const extracted = await extractWithVision(images)
      return Response.json({ bookings: extracted })
    } catch (err) {
      console.error('[import-vision] vision call failed:', err)
      return Response.json(
        { error: err instanceof Error ? err.message : 'Error extrayendo datos' },
        { status: 500 },
      )
    }
  }

  // ── Confirm: bulk-create via shared createBooking ───────────────────────
  const items = body.items.filter((it) => it && it.date && it.time && it.service)
  if (items.length === 0) {
    return Response.json({ error: 'Nada que importar.' }, { status: 400 })
  }

  // Preload active barbers to resolve names → ids.
  const activeBarbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, access.client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

  const report: Array<{
    index: number
    status: 'created' | 'skipped' | 'failed'
    message?: string
    bookingId?: string
  }> = []

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    try {
      // Resolve barber name → id; falls through to auto-assign if unmatched.
      let barberId: string | null = null
      if (it.barber && it.barber.trim()) {
        const match = activeBarbers.find(
          (b) => b.name.trim().toLowerCase() === it.barber!.trim().toLowerCase(),
        )
        if (match) barberId = match.id
      }

      const phone = normalisePhone(it.customerPhone) ?? `import-${Date.now()}-${i}`
      // For entries without a real phone, we still create the booking (so the
      // slot is blocked) but flag it with a pseudo-phone so it's easy to find
      // and fix later from /dashboard/agenda.

      const result = await createBooking({
        client: access.client,
        customerName: it.customerName ?? null,
        customerPhone: phone,
        service: it.service,
        barberId,
        date: it.date,
        time: it.time,
        duration: it.durationMinutes ?? undefined,
        priceCents: eurosToCents(it.priceEuros),
        source: 'import',
        // Importación masiva (capturas Vision) → silenciar push. Sin esto,
        // cada cliente con la PWA recibiría "Cita confirmada" por cada cita
        // reimportada, spam el día de la migración. Coherente con el import
        // iCal (imports/bookings/route.ts también pasa silent: true).
        silent: true,
      })

      if (result.success) {
        report.push({ index: i, status: 'created', bookingId: result.booking.id })
      } else {
        report.push({ index: i, status: 'failed', message: result.message })
      }
    } catch (err) {
      report.push({
        index: i,
        status: 'failed',
        message: err instanceof Error ? err.message : 'Error',
      })
    }
  }

  const created = report.filter((r) => r.status === 'created').length
  const failed = report.filter((r) => r.status === 'failed').length

  return Response.json({ ok: true, total: items.length, created, failed, report })
}
