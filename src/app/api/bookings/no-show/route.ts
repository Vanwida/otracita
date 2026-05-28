import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bookings, customers, clients } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
} from '@/lib/auth/require-tenant-actor'
import { tryVoidInvoicesInBackground } from '@/lib/invoicing'
import { chargeNoShowFee, type NoShowFeeOutcome } from '@/lib/stripe/no-show-fee'
import { logBookingEvent, type BookingEventActor } from '@/lib/bookings/events'

export async function POST(req: NextRequest) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
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
  // Ownership: barbero solo sobre sus citas, salvo `edit_others_bookings`.
  if (!isAdmin && access.barberId) {
    const canEditOthers = actorHasManagerPermission(access, 'edit_others_bookings')
    if (!canEditOthers && booking.barberId !== access.barberId) {
      return NextResponse.json({ error: 'Esta cita no es tuya.' }, { status: 403 })
    }
  }

  // Mark booking as no_show
  await db.update(bookings)
    .set({ status: 'no_show' })
    .where(eq(bookings.id, bookingId))

  // Log de evento (task #107). Best-effort.
  {
    const eventActor: BookingEventActor = isAdmin ? 'admin' : 'barber'
    await logBookingEvent({
      clientId: booking.clientId,
      bookingId: booking.id,
      type: 'no_show',
      actor: eventActor,
      actorLabel: access.user.email,
      summary: 'Marcada como no presentado',
      metadata: { date: booking.date, time: booking.time },
    })
  }

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
  // marcado de no_show (ya hecho arriba).
  //
  // La tarjeta + consentimiento se capturan al reservar por web/PWA cuando
  // el negocio tiene `noShowFeeCents > 0` (ver create.ts + setup-intent).
  // Se persisten en `customers.stripe_customer_id` /
  // `default_payment_method_id` / `card_consent_at`. Aquí los leemos y se
  // los pasamos a `chargeNoShowFee` (off-session destination charge).
  //
  // Si NO hay tarjeta consentida (reserva por bot WhatsApp — exento — o
  // cliente que reservó antes de activar la feature) → chargeNoShowFee
  // devuelve skipped:'no_card_on_file' y el no_show queda igualmente
  // marcado. Exigimos card_consent_at: tener PM sin consentimiento
  // registrado NO autoriza el cargo (SCA/MIT).
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
      const cust = customerRows[0]
      const hasConsentedCard =
        !!cust?.stripeCustomerId &&
        !!cust?.defaultPaymentMethodId &&
        !!cust?.cardConsentAt
      noShowFee = await chargeNoShowFee({
        clientId: booking.clientId,
        bookingId: booking.id,
        feeCents: clientRow.noShowFeeCents,
        connectAccountId: clientRow.stripeConnectAccountId,
        connectActive: clientRow.stripeConnectStatus === 'active',
        stripeCustomerId: hasConsentedCard ? cust!.stripeCustomerId : null,
        savedPaymentMethodId: hasConsentedCard
          ? cust!.defaultPaymentMethodId
          : null,
        description: `Tarifa por no presentarse · ${booking.service}`,
      })
    }
  } catch (err) {
    console.error('[bookings/no-show] no-show fee attempt failed:', err)
    noShowFee = { status: 'failed', error: 'internal' }
  }

  return NextResponse.json({ success: true, noShowFee })
}
