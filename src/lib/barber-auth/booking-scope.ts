import { db } from '@/db'
import { bookings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import type { BarberRow, ClientRow } from './tenant'

// -----------------------------------------------------------------------------
// Authorization helper: una cita pertenece al barbero current si:
//   · clientId coincide con el tenant del barbero
//   · barberId coincide con el barbero (no aceptamos "cualquiera"/null
//     porque entonces no es SUYA, es de la cola)
//
// Foot-gun histórico: bookings.barberId puede ser NULL en filas legacy
// (asignación "cualquiera"). Esas NO son del barbero — el motor de
// disponibilidad las asigna al confirmar.
// -----------------------------------------------------------------------------

export async function loadOwnedBooking(
  barber: BarberRow,
  client: ClientRow,
  bookingId: string,
) {
  const [row] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.clientId, client.id),
        eq(bookings.barberId, barber.id),
      ),
    )
  return row ?? null
}
