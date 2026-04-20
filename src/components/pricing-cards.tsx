'use client';

import { useState } from 'react';

const PLANS = [
  {
    id: 'chatbot' as const,
    name: 'WhatsApp AI Bot',
    price: 29,
    originalPrice: 39,
    offerTag: 'Oferta de lanzamiento',
    period: '/mes',
    description:
      'Tu recepcionista de IA 24/7. Contesta, reserva y sincroniza con tu Booksy. Sin permanencia.',
    features: [
      'Respuestas IA automáticas 24/7',
      'Sincronización con tu Booksy',
      'Setup inicial asistido, gratis',
      'Bilingüe ES / EN',
      'Cancelación en 1 click',
      'Soporte por WhatsApp',
    ],
    cta: 'Empezar ahora',
    highlight: true,
  },
];

export default function PricingCards() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleCheckout(planId: string, e?: React.MouseEvent) {
    const demo = e?.shiftKey || window.location?.search.includes('demo');
    setLoadingPlan(planId);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, demo }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Checkout error:', data.error);
        setLoadingPlan(null);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setLoadingPlan(null);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row justify-center gap-8 z-10 relative">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className="relative z-10 flex flex-col rounded-3xl border border-[var(--color-brand)]/30 bg-[var(--color-surface)] p-8 shadow-[0_20px_60px_rgba(201,101,60,0.08)] w-full sm:w-[420px] shrink-0"
        >
          {plan.offerTag && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-brand)] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white">
              {plan.offerTag}
            </div>
          )}

          <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{plan.name}</h3>

          <div className="mt-4 flex flex-col">
            {plan.originalPrice && (
              <span className="text-sm font-semibold text-[var(--color-ink-3)] line-through mb-1">
                {plan.originalPrice}€
              </span>
            )}
            <div className="flex items-end gap-1">
              <span className="font-display text-5xl font-semibold text-[var(--color-ink)]">{plan.price}€</span>
              <span className="text-sm font-medium text-[var(--color-ink-2)] mb-2">{plan.period}</span>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-[var(--color-ink-2)]">
            {plan.description}
          </p>

          <ul className="mt-8 flex-1 space-y-4">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-brand)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-medium text-[var(--color-ink)] leading-snug">{feature}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={(e) => handleCheckout(plan.id, e)}
            disabled={loadingPlan !== null}
            className="mt-10 block w-full rounded-full bg-[var(--color-brand)] py-4 text-center text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-[var(--color-brand-strong)] disabled:opacity-60"
          >
            {loadingPlan === plan.id ? (
              <span className="inline-flex items-center justify-center gap-2 w-full">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Procesando...
              </span>
            ) : (
              plan.cta
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
