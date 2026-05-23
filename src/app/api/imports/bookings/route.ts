import { db } from '@/db'
import { barbers as barbersTable, bookings as bookingsTable } from '@/db/schema'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { createBooking } from '@/lib/bookings/create'
import { canonicalizePhone } from '@/lib/phone'
import {
  parseIcs,
  detectCollisions,
  type ParsedIcalEvent,
  type ExistingBookingSlot,
} from '@/lib/imports/ical-bookings'

// -----------------------------------------------------------------------------
// iCal (.ics) import — Booksy / Treatwell / Google Calendar.
//
// Flow:
//   · POST `{ ics: "<contents>", phase: "preview" }`
//       → parsea, calcula colisiones vs bookings existentes y UIDs ya
//         importados, devuelve los eventos editables al cliente.
//   · POST `{ items: ParsedIcalEvent[], assignments?: Record<uid, barberId>,
//             phase: "commit" }`
//       → crea cada cita vía `createBooking()` (pipeline canónica). Salta
//         eventos cuyo UID ya esté en DB (idempotencia). Ignora eventos
//         pasados. Devuelve report detallado.
//
// Multi-tenant: `requireClientAccess(req)` — clientId del session, NUNCA del
// body. Cada call ve solo sus citas y sus barberos.
//
// Idempotencia: `bookings.imported_ical_uid` con UNIQUE PARTIAL INDEX
// per (clientId, uid). Re-importar el mismo .ics no duplica. Ver migración
// 0052 y `src/lib/imports/ical-bookings.ts`.
//
// Notificaciones: createBooking se llama con `silent: true` → no se manda
// push al cliente final. Los clientes importados YA tienen la cita en su
// sistema viejo; spammearles con "Cita confirmada" sería confuso.
// -----------------------------------------------------------------------------

// Booksy reutiliza UIDs sin garantía de unicidad cross-tenant; nunca confiamos
// en lo que llega del body — la fuente de verdad de la tenancy es la sesión.

interface PreviewRequest {
  phase: 'preview'
  ics: string
}

interface BookingDraft {
  uid: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  durationMinutes: number | null
  customerName: string | null
  customerPhone: string | null
  service: string
  notes: string | null
}

interface CommitRequest {
  phase: 'commit'
  items: BookingDraft[]
  /** Mapping opcional uid → barberId. Si solo hay 1 barbero activo en el
   *  tenant, el caller puede omitirlo y resolvemos al único barbero. */
  assignments?: Record<string, string | null>
}

type RequestBody = PreviewRequest | CommitRequest

const MAX_ICS_BYTES = 2 * 1024 * 1024 // 2 MB — Booksy exports raras veces >200KB.
const MAX_ITEMS = 500 // Cap defensivo. Si alguien tiene >500 citas futuras, lo partimos.

function bodyIsCommit(body: unknown): body is CommitRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { phase?: unknown }).phase === 'commit' &&
    Array.isArray((body as { items?: unknown }).items)
  )
}

function bodyIsPreview(body: unknown): body is PreviewRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { phase?: unknown }).phase === 'preview' &&
    typeof (body as { ics?: unknown }).ics === 'string'
  )
}

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  const c = canonicalizePhone(raw)
  return c.valid ? c.value : null
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

  // ── PREVIEW ──────────────────────────────────────────────────────────────
  if (bodyIsPreview(body)) {
    const ics = body.ics
    if (!ics || ics.length === 0) {
      return Response.json({ error: 'Sube un archivo .ics no vacío.' }, { status: 400 })
    }
    if (ics.length > MAX_ICS_BYTES) {
      return Response.json(
        { error: `Archivo demasiado grande (máx ${MAX_ICS_BYTES / 1024} KB).` },
        { status: 400 },
      )
    }

    let events: ParsedIcalEvent[]
    try {
      events = parseIcs(ics)
    } catch (err) {
      console.error('[imports/bookings] parse failed:', err)
      return Response.json(
        { error: 'No pudimos leer el archivo .ics. ¿Es un export válido?' },
        { status: 400 },
      )
    }

    if (events.length === 0) {
      return Response.json({
        events: [],
        collisions: {},
        skippedPast: 0,
        message: 'No detectamos eventos en el archivo.',
      })
    }

    const futureEvents = events.filter((e) => !e.isPast)
    const skippedPast = events.length - futureEvents.length

    // Cap defensivo — si vienen muchísimos, cortamos.
    const trimmed = futureEvents.slice(0, MAX_ITEMS)

    // Cargar bookings del mismo tenant en el rango de fechas implicado para
    // calcular overlaps. Limitamos al MIN-MAX date de los eventos para evitar
    // un SELECT grande.
    const dates = trimmed.map((e) => e.date).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    const existingBookings = await db
      .select({
        id: bookingsTable.id,
        date: bookingsTable.date,
        time: bookingsTable.time,
        duration: bookingsTable.duration,
        barberId: bookingsTable.barberId,
        status: bookingsTable.status,
        importedIcalUid: bookingsTable.importedIcalUid,
      })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.clientId, access.client.id),
          // Comparación lexicográfica funciona porque YYYY-MM-DD ordena bien.
          // Si no hay eventos no llegamos aquí (early return).
        ),
      )

    // Filtrar en memoria por rango — más simple que un between dinámico.
    const inRange: ExistingBookingSlot[] = existingBookings.filter(
      (b) => b.date >= minDate && b.date <= maxDate,
    )

    // UIDs ya importados antes en este tenant.
    const previouslyImported = await db
      .select({ uid: bookingsTable.importedIcalUid })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.clientId, access.client.id),
          isNotNull(bookingsTable.importedIcalUid),
        ),
      )
    const existingUids = new Set(
      previouslyImported.map((r) => r.uid).filter((u): u is string => Boolean(u)),
    )

    const defaultDuration = 30
    const collisions = detectCollisions(trimmed, inRange, existingUids, defaultDuration)

    // Cargar barberos activos para que el cliente pueda elegir asignación.
    const activeBarbers = await db
      .select({ id: barbersTable.id, name: barbersTable.name })
      .from(barbersTable)
      .where(
        and(
          eq(barbersTable.clientId, access.client.id),
          eq(barbersTable.active, true),
        ),
      )
      .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

    // El cliente recibe los eventos editables + map de colisiones por uid.
    return Response.json({
      events: trimmed,
      collisions: Object.fromEntries(collisions),
      skippedPast,
      truncated: futureEvents.length > MAX_ITEMS,
      barbers: activeBarbers,
      defaultDuration,
    })
  }

  // ── COMMIT ───────────────────────────────────────────────────────────────
  if (bodyIsCommit(body)) {
    const items = body.items
      .filter((it) => it && it.uid && it.date && it.time && it.service)
      .slice(0, MAX_ITEMS)
    if (items.length === 0) {
      return Response.json({ error: 'Nada que importar.' }, { status: 400 })
    }

    const assignments = body.assignments ?? {}

    // Pre-cargar barberos activos. Si hay un único barbero, asignamos automático.
    const activeBarbers = await db
      .select()
      .from(barbersTable)
      .where(
        and(
          eq(barbersTable.clientId, access.client.id),
          eq(barbersTable.active, true),
        ),
      )
      .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

    if (activeBarbers.length === 0) {
      return Response.json(
        {
          error:
            'No hay profesionales activos. Crea al menos uno en /dashboard/equipo antes de importar.',
        },
        { status: 400 },
      )
    }

    const singleBarberFallback =
      activeBarbers.length === 1 ? activeBarbers[0].id : null

    // UIDs ya importados — skip dentro del loop (defensa en profundidad: el
    // UNIQUE PARTIAL INDEX también lo garantiza al nivel de DB).
    const previouslyImported = await db
      .select({ uid: bookingsTable.importedIcalUid })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.clientId, access.client.id),
          isNotNull(bookingsTable.importedIcalUid),
        ),
      )
    const existingUids = new Set(
      previouslyImported.map((r) => r.uid).filter((u): u is string => Boolean(u)),
    )

    const report: Array<{
      uid: string
      status: 'created' | 'skipped' | 'failed'
      bookingId?: string
      message?: string
    }> = []

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      try {
        if (existingUids.has(it.uid)) {
          report.push({
            uid: it.uid,
            status: 'skipped',
            message: 'Ya importado anteriormente.',
          })
          continue
        }

        // Resolver barbero: assignment explícito > único barbero activo > null
        // (createBooking auto-resuelve con pickBarberForCustomer).
        const explicitBarberId = assignments[it.uid] ?? null
        const barberId = explicitBarberId ?? singleBarberFallback

        // Teléfono: si no viene parseable, usamos un pseudo-phone para que el
        // booking se cree (bloquear el hueco) sin contaminar el customer real.
        // El barbero edita la cita y mete el teléfono real luego.
        const phone =
          normalisePhone(it.customerPhone) ?? `import-ical-${Date.now()}-${i}`

        const result = await createBooking({
          client: access.client,
          customerName: it.customerName ?? null,
          customerPhone: phone,
          service: it.service,
          barberId,
          date: it.date,
          time: it.time,
          duration: it.durationMinutes ?? undefined,
          price: null,
          source: 'import_ical',
          silent: true,
          importedIcalUid: it.uid,
        })

        if (result.success) {
          existingUids.add(it.uid)
          report.push({
            uid: it.uid,
            status: 'created',
            bookingId: result.booking.id,
          })
        } else {
          report.push({
            uid: it.uid,
            status: 'failed',
            message: result.message,
          })
        }
      } catch (err) {
        // El UNIQUE PARTIAL INDEX puede disparar un error de duplicado si
        // dos requests entran a la vez con el mismo UID. Lo tratamos como
        // "skipped" para que el report sea limpio.
        const msg = err instanceof Error ? err.message : 'Error'
        const isDup =
          msg.toLowerCase().includes('unique') ||
          msg.toLowerCase().includes('duplicate')
        report.push({
          uid: it.uid,
          status: isDup ? 'skipped' : 'failed',
          message: isDup ? 'Ya importado (conflicto detectado en DB).' : msg,
        })
      }
    }

    const created = report.filter((r) => r.status === 'created').length
    const skipped = report.filter((r) => r.status === 'skipped').length
    const failed = report.filter((r) => r.status === 'failed').length

    return Response.json({
      ok: true,
      total: items.length,
      created,
      skipped,
      failed,
      report,
    })
  }

  return Response.json({ error: 'Body inválido — se espera phase preview|commit.' }, { status: 400 })
}
