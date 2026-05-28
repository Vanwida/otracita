import { db } from '@/db'
import { bookings, bookingEvents } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
} from '@/lib/auth/require-tenant-actor'

// -----------------------------------------------------------------------------
// GET /api/bookings/[id]/events — timeline de actividad de UNA cita (task #107).
//
// Devuelve los eventos de `booking_events` de esta cita, orden cronológico
// DESCENDENTE (lo último arriba), para pintar el timeline "Actividad" en el
// panel de detalle.
//
// Multi-tenancy: el actor se resuelve de la sesión (requireTenantActor); el
// booking debe pertenecer a su tenant. Un barbero-operator sin
// `edit_others_bookings` solo ve la actividad de SUS citas (mismo ownership
// que el resto de /api/bookings/[id]/*).
// -----------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { id } = await params

  // El booking debe pertenecer al tenant autenticado.
  const [booking] = await db
    .select({ id: bookings.id, barberId: bookings.barberId })
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.clientId, access.client.id)))
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })
  }

  // Ownership: barber operator solo ve la actividad de sus propias citas.
  if (!access.isAdmin && access.barberId) {
    const canSeeOthers = actorHasManagerPermission(access, 'edit_others_bookings')
    if (!canSeeOthers && booking.barberId !== access.barberId) {
      return Response.json({ error: 'Esta cita no es tuya.' }, { status: 403 })
    }
  }

  const rows = await db
    .select({
      id: bookingEvents.id,
      type: bookingEvents.type,
      actor: bookingEvents.actor,
      actorLabel: bookingEvents.actorLabel,
      summary: bookingEvents.summary,
      metadata: bookingEvents.metadata,
      createdAt: bookingEvents.createdAt,
    })
    .from(bookingEvents)
    .where(
      and(
        eq(bookingEvents.clientId, access.client.id),
        eq(bookingEvents.bookingId, id),
      ),
    )
    .orderBy(desc(bookingEvents.createdAt))

  return Response.json({ events: rows })
}
