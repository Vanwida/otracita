import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bookings, customers, clients } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { tryVoidInvoicesInBackground } from '@/lib/invoicing'
import { chargeNoShowFee, type NoShowFeeOutcome } from '@/lib/stripe/no-show-fee'

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, isAdmin } = access

  const { bookingId } = await req.json()
  if (!bookingId) {
    return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
  }

  // Get booking and verify it belongs to this client (admins can act on any).
  const bookingRows = await db.select().from(bookings).where(eq(bookings.id, bookingId))
  const booking = bookingRows[0]
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Mark booking as no_show
  await db.update(bookings)
    .set({ status: 'no_show' })
    .where(eq(bookings.id, bookingId))

  // Void any issued invoice linked to this booking — a no-show means the
  // customer never paid, so the document must be annulled (legally this
  // should be a factura rectificativa; MVP does a simple void + alert Alex
  // to emit rectificativa manually if the customer had already paid).
  tryVoidInvoicesInBackground(bookingId)

  // Update customer reputation
  const customerRows = await db.select().from(customers).where(
    and(
      eq(customers.clientId, booking.clientId),
      eq(customers.phone, booking.customerPhone)
    )
  )

  if (customerRows[0]) {
    const customer = customerRows[0]
    const newNoShows = (customer.noShows ?? 0) + 1
    const reputation = newNoShows >= 3 ? 'blocked' : newNoShows >= 2 ? 'warning' : 'good'

    await db.update(customers)
      .set({ noShows: newNoShows, reputation })
      .where(eq(customers.id, customer.id))
  }

  // -------------------------------------------------------------------------
  // Tarifa por no-show — INTENTO de cobro. NUNCA bloquea ni revierte el
  // marcado de no_show (ya hecho arriba). HOY siempre devuelve
  // skipped:'no_card_on_file' en prod porque no se captura tarjeta en la
  // reserva (ver propuesta de diseño). El mecanismo de cobro + caja queda
  // listo y aditivo para cuando exista la tarjeta consentida.
  //
  // `stripeCustomerId` / `savedPaymentMethodId` se pasan null a propósito:
  // ese dato NO existe en el modelo todavía (depende de la decisión de
  // captura en la reserva, que toca create.ts — fuera de mi ownership).
  // -------------------------------------------------------------------------
  let noShowFee: NoShowFeeOutcome = {
    status: 'skipped',
    reason: 'fee_not_configured',
  }
  try {
    const [clientRow] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, booking.clientId))
    if (clientRow && (clientRow.noShowFeeCents ?? 0) > 0) {
      noShowFee = await chargeNoShowFee({
        clientId: booking.clientId,
        bookingId: booking.id,
        feeCents: clientRow.noShowFeeCents,
        connectAccountId: clientRow.stripeConnectAccountId,
        connectActive: clientRow.stripeConnectStatus === 'active',
        // Bloqueado por la decisión de captura de tarjeta en la reserva.
        stripeCustomerId: null,
        savedPaymentMethodId: null,
        description: `Tarifa por no presentarse · ${booking.service}`,
      })
    }
  } catch (err) {
    console.error('[bookings/no-show] no-show fee attempt failed:', err)
    noShowFee = { status: 'failed', error: 'internal' }
  }

  return NextResponse.json({ success: true, noShowFee })
}
