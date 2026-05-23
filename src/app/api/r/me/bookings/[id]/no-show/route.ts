import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { bookings } from '@/db/schema'
import {
  requireBarberAccess,
  barberAccessErrorResponse,
} from '@/lib/barber-auth/tenant'
import { loadOwnedBooking } from '@/lib/barber-auth/booking-scope'

// POST /api/r/me/bookings/[id]/no-show — marca SU cita como no_show.
// Scope-limited: solo el barbero asignado puede marcarla.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBarberAccess(req)
  if (!access.ok) return barberAccessErrorResponse(access)
  const { barber, client } = access
  const { id } = await params

  const booking = await loadOwnedBooking(barber, client, id)
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })
  }
  if (booking.status !== 'confirmed') {
    return Response.json(
      { error: 'Solo se puede marcar no-show una cita confirmada.' },
      { status: 400 },
    )
  }

  await db
    .update(bookings)
    .set({ status: 'no_show' })
    .where(eq(bookings.id, id))

  return Response.json({ ok: true })
}
