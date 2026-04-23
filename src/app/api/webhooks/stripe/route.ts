import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import {
  clients,
  subscriptions,
  processedStripeEvents,
  payments,
  invoices,
  bookings,
  tips,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notifyAlex } from '@/lib/notify-alex';
import type Stripe from 'stripe';
import type { ConnectStatus } from '@/lib/payments';

const ADMIN_URL = 'https://otracita.es/admin';

// Stripe retries webhooks aggressively (up to 3 days) whenever we return a
// non-2xx. We must:
//   1. Drop duplicates at the event level via `processed_stripe_events`.
//   2. Use UPSERT-style inserts for every tenant row we touch so retries are
//      safe even if #1 fails (belt-and-braces).
//   3. ALWAYS return 200 once the signature has verified. Only signature
//      failures (bad secret / replay) should 4xx — conn/DB errors get 200
//      after logging because retries won't help and block later events.
//
// This endpoint accepts events from BOTH streams:
//   - Platform (subscriptions, Checkout subscription signups) — signed with
//     STRIPE_WEBHOOK_SECRET.
//   - Connect (destination charges, account.updated) — signed with
//     STRIPE_CONNECT_WEBHOOK_SECRET. Stripe Connect events carry an
//     `account` top-level field, so we can fall back to the Connect secret
//     if the platform secret rejects the signature.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 400 });
  }

  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  let event: Stripe.Event | null = null;
  const verificationErrors: string[] = [];

  if (platformSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, platformSecret);
    } catch (err) {
      verificationErrors.push(`platform: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!event && connectSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, connectSecret);
    } catch (err) {
      verificationErrors.push(`connect: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!event) {
    console.error('[stripe-webhook] signature verification failed:', verificationErrors.join(' | '));
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Event-level idempotency. If the INSERT returns nothing, Stripe is
  // retrying an event we already handled — ack and exit.
  // -------------------------------------------------------------------------
  try {
    const claimed = await db
      .insert(processedStripeEvents)
      .values({ eventId: event.id })
      .onConflictDoNothing({ target: processedStripeEvents.eventId })
      .returning({ eventId: processedStripeEvents.eventId });

    if (claimed.length === 0) {
      console.log(`[stripe-webhook] duplicate event skipped: ${event.id} (${event.type})`);
      return Response.json({ received: true, duplicate: true });
    }
  } catch (err) {
    // Idempotency-ledger failure is non-fatal — log and proceed with
    // row-level UPSERTs which are the second line of defence.
    console.error('[stripe-webhook] idempotency ledger failed:', err);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      }

      case 'checkout.session.expired': {
        await handleCheckoutSessionExpired(event.data.object);
        break;
      }

      case 'charge.refunded': {
        await handleChargeRefunded(event.data.object);
        break;
      }

      case 'account.updated': {
        await handleAccountUpdated(event.data.object);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await db
          .update(subscriptions)
          .set({ status: subscription.status })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await db
          .update(subscriptions)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

        // Mirror the cancellation onto the owning client row.
        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
        if (sub) {
          await db
            .update(clients)
            .set({ status: 'cancelled' })
            .where(eq(clients.id, sub.clientId));
        }
        break;
      }
    }
  } catch (err) {
    // We swallow handler errors (after logging) so Stripe stops retrying a
    // DB-corruption-level failure forever. A healthy monitor picks this up.
    console.error(
      `[stripe-webhook] handler failed for event ${event.id} (${event.type}):`,
      err,
    );
  }

  return Response.json({ received: true });
}

// -----------------------------------------------------------------------------
// checkout.session.completed
//
// Routes to one of two paths based on session.mode:
//   - 'subscription' => platform subscription sign-up (barber pays otracita)
//   - 'payment'      => destination charge on Connect (customer pays barber)
// -----------------------------------------------------------------------------
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode === 'payment') {
    // Tips are also mode=payment destination charges, but tracked in a
    // separate table and never touch invoices. Distinguish by metadata.
    if (session.metadata?.otracita_tip === 'true') {
      await handleTipPaymentCompleted(session);
      return;
    }
    await handleConnectPaymentCompleted(session);
    return;
  }

  // Fall through = subscription sign-up (default existing flow).
  const { plan, businessName, phone } = (session.metadata ?? {}) as {
    plan?: string;
    businessName?: string;
    phone?: string;
  };

  const email = session.customer_email || session.customer_details?.email || '';

  if (!email) {
    console.error(
      `[stripe-webhook] checkout.session.completed ${session.id} missing email — cannot create client row`,
    );
    return;
  }

  // --- Client row: insert-or-fetch on UNIQUE(email) -------------------------
  const inserted = await db
    .insert(clients)
    .values({
      businessName: businessName || 'Sin nombre',
      ownerName: '',
      email,
      phone: phone || '',
      plan: plan || 'chatbot',
      status: 'pending',
      stripeCustomerId: (session.customer as string) || null,
      stripeSubscriptionId: (session.subscription as string) || null,
    })
    .onConflictDoNothing({ target: clients.email })
    .returning();

  const isNewClient = inserted.length > 0;

  const client =
    inserted[0] ||
    (await db.select().from(clients).where(eq(clients.email, email)))[0];

  if (!client) {
    console.error(
      `[stripe-webhook] failed to resolve client after insert for ${email}`,
    );
    return;
  }

  // Auto-generate the public booking page slug on first signup. We only do
  // it when the client was newly created AND the slug is still null (legacy
  // clients without a slug get picked up on edit via the dashboard).
  if (isNewClient && !client.publicSlug) {
    try {
      const { generateInitialSlug, ensureUniqueSlug } = await import('@/lib/slug');
      const seed = client.id;
      const candidate = generateInitialSlug(client.businessName, seed);
      const finalSlug = await ensureUniqueSlug(candidate, client.id);
      await db
        .update(clients)
        .set({ publicSlug: finalSlug })
        .where(eq(clients.id, client.id));
    } catch (err) {
      console.error('[stripe-webhook] slug generation failed:', err);
    }
  }

  // --- Subscription row: check-then-update-or-insert -----------------------
  const subscriptionId = (session.subscription as string) || null;
  if (subscriptionId) {
    const [existingSub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

    if (existingSub) {
      await db
        .update(subscriptions)
        .set({
          clientId: client.id,
          plan: plan || existingSub.plan,
          amount: session.amount_total ?? existingSub.amount,
          status: 'active',
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
    } else {
      await db.insert(subscriptions).values({
        clientId: client.id,
        stripeSubscriptionId: subscriptionId,
        plan: plan || 'chatbot',
        amount: session.amount_total || 0,
        status: 'active',
      });
    }
  }

  console.log(
    `[stripe-webhook] checkout.session.completed ${session.id} — client ${isNewClient ? 'created' : 'existed'} (${email}, ${plan})`,
  );

  // --- Ops notification: only on TRUE new signups --------------------------
  // Fire-and-forget. We must never await on the critical path — a WhatsApp
  // outage must not ripple into a Stripe retry storm.
  if (isNewClient) {
    const notifyMessage = [
      '🎉 Nuevo cliente otracita:',
      '',
      businessName || 'Sin nombre',
      email,
      phone || '(sin teléfono)',
      `Plan: ${plan || 'chatbot'}`,
      '',
      `Activar en: ${ADMIN_URL}`,
    ].join('\n');

    void notifyAlex(notifyMessage).catch((err) => {
      console.error('[stripe-webhook] notifyAlex failed:', err);
    });
  }
}

// -----------------------------------------------------------------------------
// checkout.session.completed (mode=payment) — a customer paid a barber.
// Routes money via Connect destination charges. We:
//   1. Look up the `payments` row by session.id (our FK to Stripe).
//   2. Skip if already 'succeeded' (idempotent retry).
//   3. Flip to 'succeeded', record PI/charge ids.
//   4. Stamp the related invoice (if any) with `paidOnlineAt` — without
//      changing its fiscal `status` (issued/voided/rectified is separate).
//   5. Fire-and-forget ping to Alex with the transaction summary.
// -----------------------------------------------------------------------------
async function handleConnectPaymentCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripeCheckoutSessionId, session.id));

  if (!payment) {
    // Could happen if the session was created outside our flow (manual
    // Stripe Dashboard, another app on same account). Log and ignore.
    console.warn(
      `[stripe-webhook] checkout.session.completed ${session.id} — no matching payments row`,
    );
    return;
  }

  if (payment.status === 'succeeded') {
    console.log(`[stripe-webhook] payment ${payment.id} already succeeded — skip`);
    return;
  }

  // Resolve payment_intent + latest_charge from Stripe (payment_intent on a
  // Checkout Session can be string or expanded object; both are fine).
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  let chargeId: string | null = null;
  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null;
    } catch (err) {
      console.error('[stripe-webhook] could not fetch paymentIntent:', err);
    }
  }

  const now = new Date();
  await db
    .update(payments)
    .set({
      status: 'succeeded',
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id));

  // Stamp the related invoice if this booking already generated one. We do
  // NOT change invoice.status — fiscal lifecycle stays separate from how the
  // customer decided to settle.
  if (payment.bookingId) {
    try {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.bookingId, payment.bookingId));
      if (inv && !inv.paidOnlineAt) {
        await db
          .update(invoices)
          .set({ paidOnlineAt: now })
          .where(eq(invoices.id, inv.id));
      }
    } catch (err) {
      console.error('[stripe-webhook] stamp invoice paidOnlineAt failed:', err);
    }
  }

  // Ops notification — fire-and-forget.
  void (async () => {
    try {
      const [bookingRow] = payment.bookingId
        ? await db.select().from(bookings).where(eq(bookings.id, payment.bookingId))
        : [];
      const amountEuros = (payment.amountCents / 100).toFixed(2);
      const lines = [
        `💶 Pago online recibido (${amountEuros} € ${payment.currency.toUpperCase()})`,
        bookingRow
          ? `Reserva: ${bookingRow.service} — ${bookingRow.customerName ?? bookingRow.customerPhone}`
          : 'Reserva: (no asociada)',
        `Client: ${payment.clientId}`,
      ].filter(Boolean);
      await notifyAlex(lines.join('\n'));
    } catch (err) {
      console.error('[stripe-webhook] notifyAlex (payment) failed:', err);
    }
  })();
}

// -----------------------------------------------------------------------------
// Tips — customer paid a post-service tip. Mirrors the payment handler but
// against the `tips` table, and NEVER stamps an invoice (tips are liberalidad,
// not contraprestación, so no factura applies).
// -----------------------------------------------------------------------------
async function handleTipPaymentCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const [tip] = await db
    .select()
    .from(tips)
    .where(eq(tips.stripeCheckoutSessionId, session.id));

  if (!tip) {
    console.warn(
      `[stripe-webhook] tip session ${session.id} — no matching tips row`,
    );
    return;
  }
  if (tip.status === 'paid') {
    console.log(`[stripe-webhook] tip ${tip.id} already paid — skip`);
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  let chargeId: string | null = null;
  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      chargeId =
        typeof pi.latest_charge === 'string'
          ? pi.latest_charge
          : pi.latest_charge?.id ?? null;
    } catch (err) {
      console.error('[stripe-webhook] tip: could not fetch paymentIntent:', err);
    }
  }

  const now = new Date();
  await db
    .update(tips)
    .set({
      status: 'paid',
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(tips.id, tip.id));
}

// -----------------------------------------------------------------------------
// checkout.session.expired — customer never completed the Checkout page.
// We only flip 'pending' => 'cancelled'; a 'succeeded' row is untouched (can
// happen on a delayed event or concurrent completion).
// -----------------------------------------------------------------------------
async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
): Promise<void> {
  // Tip path — expire if this session was a tip
  if (session.metadata?.otracita_tip === 'true') {
    const [tip] = await db
      .select()
      .from(tips)
      .where(eq(tips.stripeCheckoutSessionId, session.id));
    if (tip && tip.status === 'pending') {
      await db
        .update(tips)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(tips.id, tip.id));
    }
    return;
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripeCheckoutSessionId, session.id));

  if (!payment) return;
  if (payment.status !== 'pending') return;

  await db
    .update(payments)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(payments.id, payment.id));
}

// -----------------------------------------------------------------------------
// charge.refunded — full or partial refund issued by the barber (or by us
// via Stripe Support). Mark the payment refunded so the UI shows the right
// state. Match by charge id, which we recorded on completion.
// -----------------------------------------------------------------------------
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  // The charge could belong to either a regular payment or a tip — try tips
  // first (smaller table, usually cheaper) then fall through.
  const [tip] = await db
    .select()
    .from(tips)
    .where(eq(tips.stripeChargeId, charge.id));
  if (tip) {
    await db
      .update(tips)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(tips.id, tip.id));
    return;
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripeChargeId, charge.id));

  if (!payment) return;

  await db
    .update(payments)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(eq(payments.id, payment.id));
}

// -----------------------------------------------------------------------------
// account.updated — Stripe tells us the Connect account changed. We re-read
// our own resolution rules (same as /api/stripe/connect/status) and persist.
// -----------------------------------------------------------------------------
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.stripeConnectAccountId, account.id));
  if (!client) return;

  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  const disabledReason = account.requirements?.disabled_reason ?? null;

  let status: ConnectStatus;
  if (chargesEnabled && payoutsEnabled && detailsSubmitted) {
    status = 'active';
  } else if (disabledReason) {
    status = 'restricted';
  } else {
    status = 'pending';
  }

  const now = new Date();
  const nextActivatedAt =
    status === 'active' && !client.stripeConnectActivatedAt ? now : client.stripeConnectActivatedAt;

  if (
    client.stripeConnectStatus === status &&
    nextActivatedAt === client.stripeConnectActivatedAt
  ) {
    return;
  }

  await db
    .update(clients)
    .set({
      stripeConnectStatus: status,
      stripeConnectActivatedAt: nextActivatedAt,
      updatedAt: now,
    })
    .where(eq(clients.id, client.id));

  // Notify Alex on first activation — worth the WhatsApp ping.
  if (status === 'active' && !client.stripeConnectActivatedAt) {
    void notifyAlex(
      `✅ Connect activado: ${client.businessName} (${client.email})`,
    ).catch((err) => {
      console.error('[stripe-webhook] notifyAlex (connect active) failed:', err);
    });
  }
}
