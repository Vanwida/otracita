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
      'Tu negocio abierto 24/7. Chatbot inteligente con sincronización a tu calendario (Booksy o Google Calendar).',
    features: [
      'Respuestas IA automáticas 24/7',
      'Sincronización de calendario total',
      'Configuración Google Calendar a Booksy gratis',
      'Número de WhatsApp dedicado',
      'Soporte técnico preferente',
    ],
    cta: 'Activar mi chatbot',
    highlight: false,
  },
  {
    id: 'ads' as const,
    name: 'Bot + Ads Local',
    price: 80,
    originalPrice: 149,
    offerTag: 'Oferta de lanzamiento',
    period: '/mes + inversión',
    description:
      'Gana clientes nuevos cada día y deja que nuestra IA los agende al instante.',
    features: [
      'Todo lo del plan técnico Bot',
      'Campaña Google Ads Hyper-Local',
      'Captación de clientes pasivos',
      'Informes mensuales de impacto',
      'Setup inicial 100% asistido',
    ],
    cta: 'Quiero dominar mi zona',
    highlight: true,
  },
  // {
  //   id: 'full' as const,
  //   name: 'Escala 360',
  //   price: 99,
  //   originalPrice: 299,
  //   offerTag: 'Edición Fundadores',
  //   period: '/mes',
  //   description:
  //     'Meta + Google + WhatsApp AI. La fórmula de los negocios que no dejan de crecer.',
  //   features: [
  //     'Chatbot IA sin límites',
  //     'Gestión de Google Ads',
  //     'Gestión de Meta Ads (Ig & Fb)',
  //     'Estrategia de crecimiento a medida',
  //     'Optimización de fichas locales',
  //   ],
  //   cta: 'Quiero escalar mi negocio',
  //   highlight: false,
  // },
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none" />
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`relative z-10 flex flex-col rounded-3xl border p-8 transition-all duration-300 backdrop-blur-xl w-full sm:w-[380px] shrink-0 ${
            plan.highlight
              ? 'border-emerald-500/30 bg-emerald-500/[0.03] shadow-[0_0_40px_rgba(16,185,129,0.1)] scale-105'
              : 'border-white/[0.05] bg-white/[0.02] hover:border-emerald-500/20 hover:bg-white/[0.04]'
          }`}
        >
          {plan.highlight && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500/30 bg-[#050505] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-400 backdrop-blur-md">
              <span className="relative flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Mejor valor
              </span>
            </div>
          )}

          {plan.offerTag && (
            <div className="absolute top-4 right-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              {plan.offerTag}
            </div>
          )}
          
          <h3 className="mt-4 text-xl font-bold tracking-tight text-white">{plan.name}</h3>
          
          <div className="mt-4 flex flex-col justify-end">
            {plan.originalPrice && (
              <span className="text-sm font-semibold text-gray-500 line-through decoration-red-500/50 mb-1">
                {plan.originalPrice}€
              </span>
            )}
            <div className="flex items-end gap-1">
              <span className="text-4xl font-extrabold text-white">{plan.price}€</span>
              <span className="text-sm font-medium text-gray-500 mb-1">{plan.period}</span>
            </div>
          </div>
          
          <p className="mt-5 text-sm leading-relaxed text-gray-400 h-16">
            {plan.description}
          </p>
          
          <ul className="mt-8 flex-1 space-y-4">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
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
                <span className="text-sm font-medium text-gray-300 leading-snug">{feature}</span>
              </li>
            ))}
          </ul>
          
          <button
            onClick={(e) => handleCheckout(plan.id, e)}
            disabled={loadingPlan !== null}
            className={`mt-10 block w-full rounded-full py-4 text-center text-sm font-bold transition-all disabled:opacity-60 ${
              plan.highlight
                ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02] hover:bg-emerald-400'
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm border border-white/5'
            }`}
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
