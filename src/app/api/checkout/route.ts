import Stripe from 'stripe';

// Public pricing currently offers a single plan. Ads / full were removed from
// the UI — if they come back we'll ship them behind a Vanwida sub-brand. Any
// other plan key posted to /api/checkout is a bug or scrape attempt.
const PLANS: Record<string, { name: string; price: number; currency: string; description: string }> = {
  chatbot: {
    name: 'WhatsApp Bot',
    price: 2900,
    currency: 'eur',
    description: 'Chatbot inteligente para WhatsApp + sincronizacion con Booksy',
  },
};

const SITE_URL = 'https://otracita.es';

export async function POST(request: Request) {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return Response.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const body = await request.json();
    const plan = body.plan as string;
    const demo = body.demo === true;

    // Validate plan first — applies to demo mode too so we don't emit
    // shareable links for plans we don't actually sell.
    if (!plan || !PLANS[plan]) {
      return Response.json({ error: 'Plan no disponible' }, { status: 400 });
    }

    // Demo mode — skip Stripe, go straight to success page
    if (demo) {
      return Response.json({ url: SITE_URL + '/gracias?demo=true&plan=' + plan });
    }

    const selectedPlan = PLANS[plan];

    const email = body.email as string | undefined;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      allow_promotion_codes: false,
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          price_data: {
            currency: selectedPlan.currency,
            product_data: {
              name: selectedPlan.name,
              description: selectedPlan.description,
            },
            unit_amount: selectedPlan.price,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      metadata: {
        plan,
      },
      success_url: SITE_URL + '/gracias?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: SITE_URL + '/#precios',
      locale: 'es',
    });

    return Response.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Checkout error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
