import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { clients, subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { plan, businessName, phone } = session.metadata || {};

      const email = session.customer_email || session.customer_details?.email || '';

      // Create client record
      const [client] = await db
        .insert(clients)
        .values({
          businessName: businessName || 'Sin nombre',
          ownerName: '',
          email,
          phone: phone || '',
          plan: plan || 'chatbot',
          status: 'pending',
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        })
        .returning();

      // Create subscription record
      await db.insert(subscriptions).values({
        clientId: client.id,
        stripeSubscriptionId: session.subscription as string,
        plan: plan || 'chatbot',
        amount: session.amount_total || 0,
        status: 'active',
      });

      // TODO: Send notification to Alex (WhatsApp/email)
      console.log(`New client signed up: ${businessName} (${plan})`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      await db
        .update(subscriptions)
        .set({
          status: subscription.status,
        })
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

      // Update client status
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

  return Response.json({ received: true });
}
