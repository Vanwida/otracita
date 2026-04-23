import { db } from '@/db'
import { bookings, barbers } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// /api/bookings/[id] — PATCH para acciones del dashboard sobre una reserva.
//
// Campos aceptados:
//   · barberId (string | null) → reasignar a otro barbero (o "cualquiera")
//   · status ('cancelled')     → cancelar
//
// Tenant-scoped: la reserva debe pertenecer al cliente autenticado.
// Si se reasigna, comprueba que el nuevo barbero (si no es null) no tenga
// otra reserva solapando en ese mismo horario. "Cualquiera" (null) no
// bloquea: el resolver de disponibilidad elegirá barbero al vuelo.
// -----------------------------------------------------------------------------

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export async function PATCH(
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
  if (!booking) return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })

  let body: { barberId?: unknown; status?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }

  // ── Cancel ───────────────────────────────────────────────────────────
  if ('status' in body) {
    if (body.status !== 'cancelled') {
      return Response.json({ error: "Solo se acepta status='cancelled'." }, { status: 400 })
    }
    patch.status = 'cancelled'
  }

  // ── Reassign barber ──────────────────────────────────────────────────
  if ('barberId' in body) {
    const nextBarberId = body.barberId
    let barberName: string | null = null
    if (nextBarberId === null || nextBarberId === '') {
      patch.barberId = null
      patch.barber = null
    } else if (typeof nextBarberId === 'string') {
      // Verificar que pertenece al mismo cliente y está activo.
      const [newBarber] = await db
        .select()
        .from(barbers)
        .where(
          and(
            eq(barbers.id, nextBarberId),
            eq(barbers.clientId, access.client.id),
            eq(barbers.active, true),
          ),
        )
      if (!newBarber) {
        return Response.json({ error: 'Barbero destino no válido.' }, { status: 400 })
      }
      barberName = newBarber.name

      // Si NO se cancela también en este PATCH, comprobar solape en el
      // horario del destino. Si se cancela, da igual (no hay conflicto).
      if (patch.status !== 'cancelled') {
        const start = parseMinutes(booking.time)
        const end = start + booking.duration
        const sameDay = await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.clientId, access.client.id),
              eq(bookings.barberId, nextBarberId),
              eq(bookings.date, booking.date),
              ne(bookings.status, 'cancelled'),
              ne(bookings.id, id),
            ),
          )
        const clash = sameDay.some((b) => {
          const bs = parseMinutes(b.time)
          const be = bs + b.duration
          return start < be && end > bs
        })
        if (clash) {
          return Response.json(
            { error: `${newBarber.name} ya tiene otra reserva a esa hora.` },
            { status: 409 },
          )
        }
      }

      patch.barberId = nextBarberId
      patch.barber = barberName
    } else {
      return Response.json({ error: 'barberId debe ser string o null.' }, { status: 400 })
    }
  }

  if (Object.keys(patch).length === 1) {
    // Solo updatedAt — nada que cambiar.
    return Response.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  await db.update(bookings).set(patch).where(eq(bookings.id, id))
  const [updated] = await db.select().from(bookings).where(eq(bookings.id, id))
  return Response.json({ booking: updated })
}
