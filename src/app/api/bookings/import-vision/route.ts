import OpenAI from 'openai'
import { db } from '@/db'
import { barbers as barbersTable } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { createBooking } from '@/lib/bookings/create'

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

const EXTRACTION_PROMPT = `Eres un extractor de datos de una agenda de citas (puede ser Booksy, Treatwell, una libreta, etc.). El usuario te pasa una o varias capturas de pantalla con una lista de reservas.

Devuelve SOLO un objeto JSON válido, sin markdown, sin comentarios, con la forma:

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

Reglas:
- Interpreta fechas relativas ("hoy", "mañana", "lunes") asumiendo que la fecha de referencia es la que aparece en la captura; si no aparece ninguna, usa hoy.
- Si el precio no está visible, priceEuros = null.
- Si la duración no está visible, estima 30 min para corte normal, 45 para corte+barba, 60 para tratamientos largos. Marca "confidence": "low" en ese caso.
- customerPhone: solo lo incluyas si aparece literal en la captura. No inventes.
- Si un slot está bloqueado/descanso/vacaciones y NO es una reserva, OMÍTELO del array.
- No inventes reservas que no estén visibles.
- Si no puedes leer nada útil, devuelve {"bookings": []}.`

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

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('+')) return cleaned
  if (/^\d{9}$/.test(cleaned)) return `+34${cleaned}`
  if (/^\d{11,15}$/.test(cleaned)) return `+${cleaned}`
  return cleaned
}

async function extractWithVision(images: string[]): Promise<ParsedBooking[]> {
  const content = [
    { type: 'text' as const, text: EXTRACTION_PROMPT },
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
        price: it.priceEuros ?? null,
        source: 'import',
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
