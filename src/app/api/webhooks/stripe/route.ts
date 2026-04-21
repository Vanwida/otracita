import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { clients, subscriptions, processedStripeEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notifyAlex } from '@/lib/notify-alex';
import type Stripe from 'stripe';

const ADMIN_URL = 'https://otracita.es/admin';

// Stripe retries webhooks aggressively (up to 3 days) whenever we return a
// non-2xx. We must:
//   1. Drop duplicates at the event level via `processed_stripe_events`.
//   2. Use UPSERT-style inserts for every tenant row we touch so retries are
//      safe even if #1 fails (belt-and-braces).
//   3. ALWAYS return 200 once the signature has verified. Only signature
//      failures (bad secret / replay) should 4xx — conn/DB errors get 200
//      after logging because retries won't help and block later events.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
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
// The money-path. Creates the tenant client row and the subscription row,
// then pings Alex. Every write is idempotent so Stripe retries can't
// duplicate clients (the `clients.email` UNIQUE constraint used to fatal).
// -----------------------------------------------------------------------------
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
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
