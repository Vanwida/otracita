import { db } from '@/db'
import { bookings, bookingServices } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import {
  computeBookingSnapshot,
  sanitizeExtraServices,
  hasBookingOverlap,
  hhmmToMinutes,
} from '@/lib/bookings/duration'

// -----------------------------------------------------------------------------
// PUT /api/bookings/[id]/services — A3: editar precio / servicio de una cita
// ANTES de completarla (sin documento fiscal todavía → edición libre).
//
// Reni: "poder ir atrás / editar precio o servicio, pero que quede
// registrado". Mientras la cita está `confirmed` no hay factura emitida, así
// que reescribir el servicio principal, el precio y los servicios extra es
// seguro y NO genera rectificativa. En cuanto la cita pasa a `completed` la
// factura ya está sellada en VeriFactu → este endpoint la rechaza y la UI
// manda al flujo de rectificativa (createRectificativa, nunca muta la
// original).
//
// FOOT-GUN: al cambiar duración o extras hay que recalcular el snapshot
// bookings.duration = principal + suma(extras) o el chequeo de solape del
// motor reservaría un hueco incorrecto. Reusa computeBookingSnapshot — la
// MISMA fuente que create.ts — para que no diverjan.
//
// SOLAPE: alargar una cita confirmada puede pisar la siguiente del mismo
// barbero. Tras recalcular la duración FINAL re-validamos solape (misma
// lógica que create.ts: match por barberId o nombre + buffer del cliente,
// excluyendo la propia cita). Si solapa → 409, no se escribe nada.
//
// Tenant-scoped vía requireClientAccess. NUNCA se acepta clientId del body.
// -----------------------------------------------------------------------------

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { id } = await params

  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.clientId, access.client.id)))
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })
  }

  // Solo se edita libremente mientras NO haya documento fiscal. completed →
  // factura emitida; cancelled → no tiene sentido. El cliente debe usar la
  // rectificativa para tocar una cita ya completada.
  if (booking.status !== 'confirmed' && booking.status !== 'no_show') {
    return Response.json(
      {
        error:
          'Esta cita ya está cerrada. Para cambiar el importe emite una rectificativa desde la factura.',
      },
      { status: 409 },
    )
  }

  let body: {
    service?: unknown
    price?: unknown
    duration?: unknown
    extraServices?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const service =
    typeof body.service === 'string' && body.service.trim()
      ? body.service.trim()
      : null
  if (!service) {
    return Response.json(
      { error: 'El servicio principal es obligatorio.' },
      { status: 400 },
    )
  }

  const primaryDuration =
    typeof body.duration === 'number' &&
    Number.isFinite(body.duration) &&
    body.duration > 0
      ? Math.trunc(body.duration)
      : null
  if (!primaryDuration) {
    return Response.json(
      { error: 'La duración del servicio principal debe ser mayor que 0.' },
      { status: 400 },
    )
  }

  // price puede ser null (servicio sin cobro registrado) — NO se fuerza a 0.
  let price: number | null = null
  if (body.price === null || body.price === undefined || body.price === '') {
    price = null
  } else if (
    typeof body.price === 'number' &&
    Number.isFinite(body.price) &&
    body.price >= 0
  ) {
    price = body.price
  } else {
    return Response.json(
      { error: 'El precio debe ser un número >= 0 o estar vacío.' },
      { status: 400 },
    )
  }

  const extras = sanitizeExtraServices(body.extraServices)
  // Snapshot duración = principal + suma(extras). MISMA lógica que create.ts.
  const { durationMin } = computeBookingSnapshot(
    primaryDuration,
    extras.length > 0 ? extras : null,
  )

  // ── Re-validación de solape ────────────────────────────────────────────
  // Alargar una cita (más duración / más extras) puede pisar la siguiente
  // del mismo barbero. La fecha/hora/barbero no cambian aquí, solo la
  // duración FINAL — pero eso basta para crear un solape nuevo. Reusa el
  // predicado puro compartido (mismo match barberId-o-nombre + buffer que
  // create.ts), excluyendo ESTA cita y las canceladas. Si solapa → 409 y NO
  // se escribe nada (el barbero acorta el servicio o mueve la otra cita).
  const sameDay = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, access.client.id),
        eq(bookings.date, booking.date),
        ne(bookings.status, 'cancelled'),
        ne(bookings.id, id),
      ),
    )
  const clash = hasBookingOverlap(
    {
      selfId: id,
      startMinutes: hhmmToMinutes(booking.time),
      durationMin,
      barberId: booking.barberId,
      barber: booking.barber,
    },
    sameDay,
    access.client.serviceBufferMinutes,
  )
  if (clash) {
    return Response.json(
      {
        error:
          'La nueva duración pisa otra cita del mismo barbero. Acorta el servicio o mueve la otra cita antes de guardar.',
      },
      { status: 409 },
    )
  }

  // Reescribe el snapshot del booking + reemplaza la lista de extras
  // (delete-all + re-insert: simple y correcto para una lista corta editada
  // de golpe; el FK ON DELETE cascade no aplica aquí porque el booking
  // permanece — borramos solo sus filas booking_services).
  await db
    .update(bookings)
    .set({
      service,
      price,
      duration: durationMin,
    })
    .where(eq(bookings.id, id))

  await db.delete(bookingServices).where(eq(bookingServices.bookingId, id))
  if (extras.length > 0) {
    await db.insert(bookingServices).values(
      extras.map((s, idx) => ({
        bookingId: id,
        name: s.name,
        durationMin: s.durationMin,
        priceEuros: s.priceEuros ?? null,
        displayOrder: idx,
      })),
    )
  }

  const [updated] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
  return Response.json({ booking: updated })
}

// -----------------------------------------------------------------------------
// GET /api/bookings/[id]/services — lista los servicios extra de una cita
// (para precargar el modal de edición). Tenant-scoped.
// -----------------------------------------------------------------------------
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { id } = await params

  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.clientId, access.client.id)))
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })
  }

  const extras = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.bookingId, id))
    .orderBy(bookingServices.displayOrder)

  return Response.json({
    extraServices: extras.map((e) => ({
      name: e.name,
      durationMin: e.durationMin,
      priceEuros: e.priceEuros,
    })),
  })
}
