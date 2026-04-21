import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { bookings, payments } from '@/db/schema';
import { and, eq, or } from 'drizzle-orm';
import QRCode from 'qrcode';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import {
  calcApplicationFeeCents,
  validateAmountCents,
  PAYMENT_CURRENCY,
  PAYMENT_SUCCESS_URL,
  PAYMENT_CANCELLED_URL,
} from '@/lib/payments';

// -----------------------------------------------------------------------------
// POST /api/payments/create-link
//
// Generates a Stripe Checkout Session (hosted payment page) for a specific
// booking and returns { paymentUrl, qrCodeDataUrl, paymentId }. The flow is
// a Stripe Connect DESTINATION CHARGE: we (platform) create the charge, the
// funds are routed to the barber's Connect account, and we optionally take
// an application fee (0% during the pilot).
//
// Race-condition mitigation: if a 'pending' payment already exists for this
// booking we return it instead of creating a second Stripe session. The
// barber can still "regenerate" a new link by first cancelling the pending
// one (future UI affordance). Prevents accidental double-charges when a
// button is clicked twice.
// -----------------------------------------------------------------------------
interface CreateLinkBody {
  bookingId?: unknown;
  amountCents?: unknown;
  description?: unknown;
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client, isAdmin } = access;

  // --- Input parsing + validation ---------------------------------------
  let body: CreateLinkBody;
  try {
    body = (await request.json()) as CreateLinkBody;
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  if (!bookingId) {
    return Response.json({ error: 'Falta bookingId' }, { status: 400 });
  }

  const amountError = validateAmountCents(body.amountCents);
  if (amountError) {
    return Response.json({ error: amountError }, { status: 400 });
  }
  const amountCents = body.amountCents as number;

  const description =
    typeof body.description === 'string' && body.description.trim().length > 0
      ? body.description.trim().slice(0, 200)
      : `Servicio en ${client.businessName || 'la barbería'}`;

  // --- Precondition: Connect account must be active ---------------------
  if (client.stripeConnectStatus !== 'active' || !client.stripeConnectAccountId) {
    return Response.json(
      { error: 'Activa cobros online antes de generar un link de pago.' },
      { status: 400 },
    );
  }

  // --- Multi-tenancy: the booking must belong to this client ------------
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Idempotency: if there's already a pending payment, re-use it -----
  // (Covers the "barber clicked the button twice" case and any generic
  //  retry during a flaky network without creating duplicate sessions.)
  const existingPending = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        or(eq(payments.status, 'pending'), eq(payments.status, 'succeeded')),
      ),
    );

  const succeeded = existingPending.find((p) => p.status === 'succeeded');
  if (succeeded) {
    return Response.json(
      { error: 'Esta reserva ya está pagada online.' },
      { status: 409 },
    );
  }

  const pending = existingPending.find(
    (p) => p.status === 'pending' && p.paymentLinkUrl && p.stripeCheckoutSessionId,
  );
  if (pending && pending.paymentLinkUrl) {
    const qr = await QRCode.toDataURL(pending.paymentLinkUrl, { width: 480, margin: 1 });
    return Response.json({
      paymentUrl: pending.paymentLinkUrl,
      qrCodeDataUrl: qr,
      paymentId: pending.id,
      reused: true,
      amountCents: pending.amountCents,
    });
  }

  // --- Create the Stripe Checkout Session -------------------------------
  const applicationFeeCents = calcApplicationFeeCents(amountCents);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // MVP: card only. Bizum support in Stripe España rolls out through
      // 2026 — flip this on when Stripe marks it GA in our account.
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: PAYMENT_CURRENCY,
            unit_amount: amountCents,
            product_data: {
              name: description,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: {
          destination: client.stripeConnectAccountId,
        },
        metadata: {
          otracita_booking_id: bookingId,
          otracita_client_id: client.id,
        },
      },
      metadata: {
        otracita_booking_id: bookingId,
        otracita_client_id: client.id,
      },
      success_url: PAYMENT_SUCCESS_URL,
      cancel_url: PAYMENT_CANCELLED_URL,
      locale: 'es',
    });

    if (!session.url) {
      // Theoretical — Stripe returns a URL for mode=payment sessions. If
      // somehow missing, fail hard rather than persisting a row we can't use.
      return Response.json(
        { error: 'Stripe no devolvió URL de pago. Reintenta.' },
        { status: 502 },
      );
    }

    // Persist the payment row BEFORE returning. The session id is UNIQUE in
    // the DB so the webhook can't double-process this on retry.
    const [inserted] = await db
      .insert(payments)
      .values({
        clientId: client.id,
        bookingId,
        stripeCheckoutSessionId: session.id,
        amountCents,
        applicationFeeCents,
        currency: PAYMENT_CURRENCY,
        type: 'full',
        status: 'pending',
        description,
        paymentLinkUrl: session.url,
      })
      .returning();

    const qr = await QRCode.toDataURL(session.url, { width: 480, margin: 1 });

    return Response.json({
      paymentUrl: session.url,
      qrCodeDataUrl: qr,
      paymentId: inserted.id,
      reused: false,
      amountCents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe error';
    console.error('[payments/create-link] failed:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
