// -----------------------------------------------------------------------------
// Stripe Checkout helper — destination charges on Connect.
//
// Encapsula la creación de una Checkout Session para que un cliente final pague
// un booking, vía Stripe Connect destination charge (los fondos van al
// `stripe_connect_account_id` del barbero; el platform fee se configura por
// env). Persiste la fila `payments` (status='pending') y devuelve la URL +
// QR PNG dataUrl para que el barbero la enseñe al cliente.
//
// Llamadores:
//   · /api/payments/create-link  (flow legacy, 100% del importe vía Stripe).
//   · /api/bookings/[id]/charge  (flow nuevo unificado — un tramo `card_online`
//     dentro de un split de N tramos).
//
// El helper también soporta idempotencia: si ya existe una fila `payments` en
// estado 'pending' para el mismo bookingId con la misma `amountCents`, la
// reusa en vez de crear una nueva Stripe Session (evita doble cargo si el
// barbero pulsa "Cobrar" dos veces seguidas o la red reintenta).
// -----------------------------------------------------------------------------

import QRCode from 'qrcode';
import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, clients, payments } from '@/db/schema';
import { stripe } from '@/lib/stripe';
import {
  calcApplicationFeeCents,
  PAYMENT_CURRENCY,
  PAYMENT_SUCCESS_URL,
  PAYMENT_CANCELLED_URL,
} from '@/lib/payments';

export type ClientRow = typeof clients.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;

export interface CreateStripeCheckoutArgs {
  client: ClientRow;
  booking: BookingRow;
  amountCents: number;
  description: string;
  /** Si se omite, se calcula con `calcApplicationFeeCents(amountCents)`. */
  applicationFeeCents?: number;
  /** Email del usuario del dashboard que dispara el cobro (audit). */
  recordedByEmail?: string | null;
}

export interface CreateStripeCheckoutResult {
  paymentId: string;
  paymentUrl: string;
  checkoutSessionId: string;
  qrCodeDataUrl: string;
  /** true si se reusó una sesión pending preexistente para el booking. */
  reused: boolean;
  amountCents: number;
}

export class StripeCheckoutError extends Error {
  status: number;
  code: 'already_paid' | 'connect_inactive' | 'stripe_no_url' | 'stripe_error';
  constructor(
    code: StripeCheckoutError['code'],
    message: string,
    status = 500,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Crea (o reusa) una Stripe Checkout Session destination-charge para un
 * booking. Inserta también la fila `payments` correspondiente en estado
 * 'pending'. Devuelve URL + QR para que el front pinte la pantalla de espera.
 *
 * NO modifica el booking — el cierre se hace cuando llega el webhook
 * `checkout.session.completed` (ver src/app/api/webhooks/stripe/route.ts).
 */
export async function createStripeCheckoutForBooking(
  args: CreateStripeCheckoutArgs,
): Promise<CreateStripeCheckoutResult> {
  const { client, booking, amountCents, description } = args;

  if (client.stripeConnectStatus !== 'active' || !client.stripeConnectAccountId) {
    throw new StripeCheckoutError(
      'connect_inactive',
      'Activa cobros online antes de generar un link de pago.',
      400,
    );
  }

  // Reuso de pending: si el booking ya tiene una fila succeeded → 409.
  // Si tiene una pending para el mismo importe → reusamos.
  const existing = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, booking.id),
        or(eq(payments.status, 'pending'), eq(payments.status, 'succeeded')),
      ),
    );

  const succeeded = existing.find((p) => p.status === 'succeeded');
  if (succeeded) {
    throw new StripeCheckoutError(
      'already_paid',
      'Esta reserva ya está pagada online.',
      409,
    );
  }

  const pending = existing.find(
    (p) =>
      p.status === 'pending' &&
      p.paymentLinkUrl &&
      p.stripeCheckoutSessionId &&
      p.amountCents === amountCents,
  );
  if (pending && pending.paymentLinkUrl && pending.stripeCheckoutSessionId) {
    const qr = await QRCode.toDataURL(pending.paymentLinkUrl, {
      width: 480,
      margin: 1,
    });
    return {
      paymentId: pending.id,
      paymentUrl: pending.paymentLinkUrl,
      checkoutSessionId: pending.stripeCheckoutSessionId,
      qrCodeDataUrl: qr,
      reused: true,
      amountCents: pending.amountCents,
    };
  }

  const applicationFeeCents =
    args.applicationFeeCents ?? calcApplicationFeeCents(amountCents);

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
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
          otracita_booking_id: booking.id,
          otracita_client_id: client.id,
        },
      },
      metadata: {
        otracita_booking_id: booking.id,
        otracita_client_id: client.id,
      },
      success_url: PAYMENT_SUCCESS_URL,
      cancel_url: PAYMENT_CANCELLED_URL,
      locale: 'es',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    throw new StripeCheckoutError('stripe_error', message, 500);
  }

  if (!session.url) {
    throw new StripeCheckoutError(
      'stripe_no_url',
      'Stripe no devolvió URL de pago. Reintenta.',
      502,
    );
  }

  const [inserted] = await db
    .insert(payments)
    .values({
      clientId: client.id,
      bookingId: booking.id,
      stripeCheckoutSessionId: session.id,
      amountCents,
      applicationFeeCents,
      currency: PAYMENT_CURRENCY,
      type: 'full',
      status: 'pending',
      method: 'card_online',
      description,
      paymentLinkUrl: session.url,
      recordedByEmail: args.recordedByEmail ?? null,
    })
    .returning();

  const qr = await QRCode.toDataURL(session.url, { width: 480, margin: 1 });

  return {
    paymentId: inserted.id,
    paymentUrl: session.url,
    checkoutSessionId: session.id,
    qrCodeDataUrl: qr,
    reused: false,
    amountCents,
  };
}
