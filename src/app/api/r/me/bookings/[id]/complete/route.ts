import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { bookings, payments, cashMovements, cashSessions } from '@/db/schema'
import {
  requireBarberAccess,
  barberAccessErrorResponse,
} from '@/lib/barber-auth/tenant'
import { loadOwnedBooking } from '@/lib/barber-auth/booking-scope'
import { bookingTotalCents } from '@/lib/bookings/total'
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup'
import { recordTipSequential } from '@/lib/payments/record-tip'

// -----------------------------------------------------------------------------
// POST /api/r/me/bookings/[id]/complete (barber session) — el barbero cierra
// SU cita en la app móvil. Acepta el método de cobro (cash | card) y,
// opcionalmente, una propina cash al barbero (presets 1/2/3/5 €).
//
// SCOPE-LIMITED:
//   · requireBarberAccess (cookie firmada → barberId, no admin)
//   · loadOwnedBooking valida que la cita pertenezca a ESE barbero
//   · No acepta tramos online (Stripe Checkout) — la app del barbero es
//     para cierres físicos (cash/card datáfono). Para Stripe el cliente
//     paga desde su PWA.
//
// Body:
//   {
//     paymentMethod: 'cash' | 'card',
//     tipCents?: number    // entero ≥ 0, propina del barbero (si > 0)
//     tipMethod?: 'cash' | 'card'   // default 'cash' (presets físicos)
//   }
// -----------------------------------------------------------------------------

interface Body {
  paymentMethod?: unknown
  tipCents?: unknown
  tipMethod?: unknown
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBarberAccess(req)
  if (!access.ok) return barberAccessErrorResponse(access)
  const { barber, client } = access
  const { id: bookingId } = await params

  const booking = await loadOwnedBooking(barber, client, bookingId)
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })
  }
  if (booking.status !== 'confirmed') {
    return Response.json(
      { error: 'Solo se cobran reservas confirmadas.' },
      { status: 400 },
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'card') {
    return Response.json(
      { error: "paymentMethod debe ser 'cash' o 'card'." },
      { status: 400 },
    )
  }
  const method = body.paymentMethod as 'cash' | 'card'

  const tipCentsRaw = typeof body.tipCents === 'number' ? body.tipCents : 0
  if (!Number.isFinite(tipCentsRaw) || tipCentsRaw < 0 || !Number.isInteger(tipCentsRaw)) {
    return Response.json(
      { error: 'tipCents debe ser entero ≥ 0.' },
      { status: 400 },
    )
  }
  const tipCents = tipCentsRaw
  const tipMethod =
    body.tipMethod === 'card' ? 'card' : ('cash' as 'cash' | 'card')

  const totalCents = await bookingTotalCents(bookingId)
  const now = new Date()

  // 1. Payment offline.
  await db.insert(payments).values({
    clientId: client.id,
    bookingId,
    amountCents: totalCents,
    applicationFeeCents: 0,
    currency: 'eur',
    type: 'full',
    status: 'succeeded',
    method,
    paidAt: now,
    recordedByEmail: null,
    description: booking.service ?? null,
  })

  // 2. Cerrar booking.
  await db
    .update(bookings)
    .set({ status: 'completed', paymentMethod: method })
    .where(eq(bookings.id, bookingId))

  // 3. Tip si corresponde.
  let tipRecorded = false
  if (tipCents > 0) {
    await recordTipSequential(db, {
      clientId: client.id,
      bookingId,
      customerPhone: booking.customerPhone ?? '—',
      amountCents: tipCents,
      method: tipMethod,
      barberId: barber.id,
      barberName: barber.name,
      cashRegisterEnabled: Boolean(client.cashRegisterEnabled),
      createdByEmail: null,
    })
    tipRecorded = true
  }

  // 4. Cash movement enlazado al booking (fire-and-forget, mismo patrón
  // que /api/bookings/[id]/charge). Solo si caja activa.
  if (client.cashRegisterEnabled && totalCents > 0) {
    void (async () => {
      try {
        const [session] = await db
          .select({ id: cashSessions.id })
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.clientId, client.id),
              isNull(cashSessions.closedAt),
            ),
          )
        if (!session) return
        await db.insert(cashMovements).values({
          clientId: client.id,
          sessionId: session.id,
          kind: 'booking',
          method,
          amountCents: totalCents,
          referenceType: 'booking',
          referenceId: bookingId,
          createdByEmail: null,
        })
      } catch (err) {
        console.error('[barber-app/complete] cash movement failed', err)
      }
    })()
  }

  // 5. Followup (rating + tip request al cliente, según config del tenant).
  tryRatingFollowupForCompletedBooking(bookingId)

  return Response.json({
    ok: true,
    bookingId,
    totalCents,
    tipRecorded,
  })
}
