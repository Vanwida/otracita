import {
  requireBarberAccess,
  barberAccessErrorResponse,
} from '@/lib/barber-auth/tenant'
import { loadOwnedBooking } from '@/lib/barber-auth/booking-scope'

// POST /api/r/me/bookings/[id]/start — el barbero marca "estoy atendiendo
// ahora" en la app móvil. Hoy es un no-op de estado (no movemos a un
// estado nuevo en bookings.status — solo confirmed→completed/cancelled/
// no_show). Lo dejamos como ACK de UX: el cliente puede pintar el
// countdown "Atendiendo ahora" sin tocar DB.
//
// Si en el futuro queremos un estado "in_progress" añadiremos una columna
// `bookings.startedAt` aditiva — por ahora, el front guarda la marca en
// localStorage por barbero y este endpoint solo valida acceso.
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

  return Response.json({ ok: true })
}
