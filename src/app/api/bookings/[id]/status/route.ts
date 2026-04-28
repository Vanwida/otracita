import { db } from '@/db'
import { bookings, cashMovements } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/bookings/[id]/status
//
// Endpoint lightweight para que la UI sondee el resultado de un cobro
// SumUp en curso. Devuelve:
//   · status del booking
//   · si hay cash_movement con sumup_transaction_id (= cobro completó)
//   · amount cobrado (real desde SumUp si llegó el callback, propinas
//     incluidas)
//
// El frontend hace fetch cada 2s mientras muestra "Acerca la tarjeta..."
// y para cuando ve status=completed o cuando timeout.
// -----------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { id } = await params

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      paymentMethod: bookings.paymentMethod,
    })
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.clientId, access.client.id)))

  if (!booking) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })

  // ¿Llegó ya el callback de SumUp? Lo vemos por la presencia de un
  // cash_movement con reference_id apuntando a este booking que tenga
  // sumup_transaction_id (= insertado por el callback /sumup/checkout/return,
  // no por flow manual).
  const [sumupMovement] = await db
    .select({
      amountCents: cashMovements.amountCents,
      sumupTransactionId: cashMovements.sumupTransactionId,
    })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.referenceType, 'booking'),
        eq(cashMovements.referenceId, id),
        eq(cashMovements.method, 'card'),
      ),
    )

  const sumupSettled = sumupMovement?.sumupTransactionId != null

  return Response.json({
    status: booking.status,
    paymentMethod: booking.paymentMethod,
    sumupSettled,
    amountCents: sumupSettled ? sumupMovement?.amountCents ?? null : null,
  })
}
