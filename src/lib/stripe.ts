import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const PLANS = {
  chatbot: {
    name: 'Chatbot WhatsApp',
    price: 2900, // cents
    currency: 'eur',
    description:
      'Chatbot inteligente para WhatsApp + sincronizacion con Booksy',
  },
  ads: {
    name: 'Google Ads',
    price: 8000,
    currency: 'eur',
    description: 'Gestion de campanas de Google Ads para tu barberia',
  },
  full: {
    name: 'Pack Completo',
    price: 9900,
    currency: 'eur',
    description: 'Chatbot WhatsApp + Google Ads + Meta Ads',
  },
} as const;

export type PlanId = keyof typeof PLANS;
