import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { tips, type clients } from '@/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import { PAYMENT_CURRENCY, SITE_URL } from '@/lib/payments';

type Client = InferSelectModel<typeof clients>;

// -----------------------------------------------------------------------------
// Tips helpers — called from the WhatsApp bot flow (and potentially the
// dashboard later). Not exposed as a public API route: tips are always
// triggered in response to an incoming WhatsApp interaction, so the caller
// is always server code inside a tenant-authenticated handler.
//
// Design rules:
//   · Application fee on tips is 0 by default (all to the barbershop). If the
//     env flag `OTRACITA_TIP_FEE_PERCENT` is set we apply it — same knob as
//     regular payments but separate so we can keep 0% here forever while
//     raising the service-payment fee.
//   · Amounts in cents; `amountCents === 0` is NOT valid for a paid tip
//     session — callers that want to record a rating without a tip should
//     call `recordRatingOnly` instead.
//   · We never generate an invoice for a tip (fiscally liberalidad, not
//     contraprestación). Exports treat tips as a separate section.
// -----------------------------------------------------------------------------

const TIP_SUCCESS_URL = `${SITE_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`;
const TIP_CANCELLED_URL = `${SITE_URL}/pay/cancelled`;

/** Minimum chargeable amount — Stripe's own floor is ~50¢. */
export const MIN_TIP_CENTS = 100; // 1€ — below this the 0,25€ fixed fee eats it all
/** Upper cap — tip shouldn't exceed 100€, anything above is almost certainly an error. */
export const MAX_TIP_CENTS = 10_000;

export function validateTipAmount(amountCents: unknown): string | null {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return 'Importe de propina inválido.';
  }
  if (amountCents < MIN_TIP_CENTS) {
    return `Mínimo ${MIN_TIP_CENTS / 100} €.`;
  }
  if (amountCents > MAX_TIP_CENTS) {
    return `Máximo ${MAX_TIP_CENTS / 100} €.`;
  }
  return null;
}

/** Percentage kept by otracita on tips. Defaults to 0 — tips are 100% barber. */
function getTipFeePercent(): number {
  const raw = process.env.OTRACITA_TIP_FEE_PERCENT;
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return 0;
  return parsed;
}

function calcTipApplicationFeeCents(amountCents: number): number {
  const percent = getTipFeePercent();
  if (percent <= 0) return 0;
  return Math.round(amountCents * (percent / 100));
}

interface CreateTipSessionArgs {
  client: Client;
  bookingId?: string | null;
  customerPhone: string;
  barberName?: string | null;
  amountCents: number;
  /** Rating (1-5) the customer already gave before the tip, if any. */
  rating?: number | null;
}

interface CreateTipSessionResult {
  tipId: string;
  url: string;
}

/**
 * Create a Stripe Checkout session for a tip and persist a `tips` row in
 * status `pending`. Webhook `checkout.session.completed` will flip it to
 * `paid` when the customer finishes. Caller must pre-check that the client
 * has `stripeConnectAccountId` set and `tipsEnabled` is true.
 */
export async function createTipSession(
  args: CreateTipSessionArgs,
): Promise<CreateTipSessionResult> {
  const { client, bookingId, customerPhone, barberName, amountCents, rating } = args;

  if (!client.stripeConnectAccountId) {
    throw new Error('Client has no Stripe Connect account — cannot charge tips.');
  }
  if (!client.tipsEnabled) {
    throw new Error('Tips are disabled for this client.');
  }
  const invalid = validateTipAmount(amountCents);
  if (invalid) throw new Error(invalid);

  const applicationFeeCents = calcTipApplicationFeeCents(amountCents);
  const barberLabel = barberName ? ` a ${barberName}` : '';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: PAYMENT_CURRENCY,
          unit_amount: amountCents,
          product_data: { name: `Propina${barberLabel}` },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: client.stripeConnectAccountId },
      metadata: {
        otracita_tip: 'true',
        otracita_client_id: client.id,
        ...(bookingId ? { otracita_booking_id: bookingId } : {}),
      },
    },
    metadata: {
      otracita_tip: 'true',
      otracita_client_id: client.id,
      ...(bookingId ? { otracita_booking_id: bookingId } : {}),
    },
    success_url: TIP_SUCCESS_URL,
    cancel_url: TIP_CANCELLED_URL,
    locale: 'es',
  });

  if (!session.url) {
    throw new Error('Stripe did not return a tip checkout URL.');
  }

  const [row] = await db
    .insert(tips)
    .values({
      clientId: client.id,
      bookingId: bookingId ?? null,
      stripeCheckoutSessionId: session.id,
      amountCents,
      status: 'pending',
      customerPhone,
      barberName: barberName ?? null,
      rating: rating ?? null,
      paymentLinkUrl: session.url,
    })
    .returning({ id: tips.id });

  return { tipId: row.id, url: session.url };
}

interface RecordRatingOnlyArgs {
  clientId: string;
  bookingId?: string | null;
  customerPhone: string;
  barberName?: string | null;
  rating: number;
  ratingComment?: string | null;
}

/**
 * Persist a rating WITHOUT an associated tip payment. Used when the customer
 * taps a star rating in WhatsApp but skips the tip step. Row goes in with
 * status `rating_only` and `amount_cents = 0` so aggregated stats can still
 * include it.
 */
export async function recordRatingOnly(args: RecordRatingOnlyArgs): Promise<string> {
  const { clientId, bookingId, customerPhone, barberName, rating, ratingComment } = args;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be integer 1-5.');
  }

  const [row] = await db
    .insert(tips)
    .values({
      clientId,
      bookingId: bookingId ?? null,
      amountCents: 0,
      status: 'rating_only',
      customerPhone,
      barberName: barberName ?? null,
      rating,
      ratingComment: ratingComment ?? null,
    })
    .returning({ id: tips.id });

  return row.id;
}
