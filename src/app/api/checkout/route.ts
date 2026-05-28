import Stripe from 'stripe';
import { TIER_PRICES, TRIAL_DAYS_BY_TIER, type Tier, type BillingInterval } from '@/lib/billing/tier';

// Checkout endpoint para subscriptions otracita (lo que el barbero paga
// a la plataforma). Soporta:
//   - tier=pro|estudio + billingInterval=monthly|annual (nuevo, post-tier
//     refresh 2026-04-30)
//   - plan=chatbot (legacy, compat con la landing v1; mapea a Pro mensual)
//
// Solo (gratis) NO pasa por Stripe — su signup es directo via /login.
// Estudio se vende high-touch via WhatsApp; el pricing card lleva al
// número del equipo. Si alguien fuerza tier=estudio aquí, lo aceptamos
// (mismo flow Stripe que Pro pero sin trial).

interface PlanDef {
  name: string;
  description: string;
  unitAmountCents: number;
  trialDays: number | null;
}

import { SITE_ORIGIN as SITE_URL } from '@/lib/site';

function buildPlan(tier: Tier, interval: BillingInterval): PlanDef | null {
  if (tier === 'solo') return null; // gratis, no checkout
  const monthly = TIER_PRICES[tier].monthly;
  const annual = TIER_PRICES[tier].annual;
  const tierLabel = tier === 'pro' ? 'Pro' : 'Estudio';
  const intervalLabel = interval === 'annual' ? 'anual' : 'mensual';
  return {
    name: `otracita ${tierLabel} (${intervalLabel})`,
    description:
      tier === 'pro'
        ? 'Agenda + bot WhatsApp + SumUp Tap to Pay + facturación VeriFactu + fidelidad. Sin permanencia.'
        : 'Todo Pro + recepcionista IA + subdominio propio + onboarding 1:1.',
    // Para anual cobramos 12x el precio anual/mes a la vez. Stripe maneja
    // el "anual" como un sólo cobro al inicio del periodo.
    unitAmountCents: interval === 'annual' ? annual * 12 : monthly,
    trialDays: TRIAL_DAYS_BY_TIER[tier],
  };
}

interface ParsedBody {
  tier: Tier | null;
  billingInterval: BillingInterval;
  email?: string;
  businessName?: string;
  phone?: string;
  demo: boolean;
}

function parseBody(body: Record<string, unknown>): ParsedBody {
  // Nuevo formato
  let tier: Tier | null = null;
  if (body.tier === 'pro' || body.tier === 'estudio' || body.tier === 'solo') {
    tier = body.tier;
  }
  // Compat con landing v1
  if (!tier && body.plan === 'chatbot') {
    tier = 'pro';
  }
  const billingInterval: BillingInterval =
    body.billingInterval === 'annual' ? 'annual' : 'monthly';
  return {
    tier,
    billingInterval,
    email: typeof body.email === 'string' ? body.email : undefined,
    businessName: typeof body.businessName === 'string' ? body.businessName.trim() : undefined,
    phone: typeof body.phone === 'string' ? body.phone.trim() : undefined,
    demo: body.demo === true,
  };
}

export async function POST(request: Request) {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return Response.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const raw = (await request.json()) as Record<string, unknown>;
    const parsed = parseBody(raw);

    if (!parsed.tier || parsed.tier === 'solo') {
      return Response.json(
        { error: 'Tier no válido. Solo es gratis y no pasa por checkout.' },
        { status: 400 },
      );
    }

    const plan = buildPlan(parsed.tier, parsed.billingInterval);
    if (!plan) {
      return Response.json({ error: 'Plan no disponible' }, { status: 400 });
    }

    // Demo mode — saltarse Stripe, ir directo a /gracias
    if (parsed.demo) {
      const params = new URLSearchParams({
        demo: 'true',
        tier: parsed.tier,
        interval: parsed.billingInterval,
      });
      return Response.json({ url: SITE_URL + '/gracias?' + params.toString() });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      allow_promotion_codes: true,
      ...(parsed.email ? { customer_email: parsed.email } : {}),
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.unitAmountCents,
            recurring: {
              interval: parsed.billingInterval === 'annual' ? 'year' : 'month',
            },
          },
          quantity: 1,
        },
      ],
      ...(plan.trialDays
        ? {
            subscription_data: {
              trial_period_days: plan.trialDays,
              // Cuando termina el trial sin método de pago añadido, Stripe
              // pausa la subscription. Mejor que cancelarla — el barbero
              // puede meter tarjeta luego sin re-onboarding.
              trial_settings: {
                end_behavior: { missing_payment_method: 'pause' },
              },
            },
            // Trial sin tarjeta hasta el último día. Stripe pedirá tarjeta
            // sólo si no la metió en checkout.
            payment_method_collection: 'if_required',
          }
        : {}),
      metadata: {
        // Nuevo formato
        tier: parsed.tier,
        billing_interval: parsed.billingInterval,
        // Legacy compat — webhook v1 lee esto
        plan: parsed.tier === 'pro' ? 'chatbot' : parsed.tier === 'estudio' ? 'full' : 'chatbot',
        businessName: parsed.businessName ?? '',
        phone: parsed.phone ?? '',
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
