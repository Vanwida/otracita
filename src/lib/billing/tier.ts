// Tier (Solo/Pro/Estudio) + trial helpers. Single source of truth para
// resolver "¿este cliente puede usar esta feature?" sin duplicar lógica
// por cada route. Ver PRODUCT.md → Product Purpose para el mapping
// feature→tier vigente.
//
// USO TÍPICO en una route:
//   const access = await requireClientAccess(req);
//   if (!hasFeature(access.client, 'whatsappBot')) {
//     return upgradeRequiredResponse('whatsappBot', 'pro');
//   }
//
// PRINCIPIO: las features que añadimos arriba en el árbol (estudio incluye
// pro, pro incluye solo) se resuelven por orden, no por matriz duplicada.

import type { InferSelectModel } from 'drizzle-orm';
import type { clients } from '@/db/schema';

export type Tier = 'solo' | 'pro' | 'estudio';
export type BillingInterval = 'monthly' | 'annual';

/** Cliente Drizzle row tipo, suelto. */
type Client = Pick<
  InferSelectModel<typeof clients>,
  'tier' | 'trialEndsAt' | 'trialStartedAt' | 'plan' | 'status' | 'stripeSubscriptionId'
>;

/** Catálogo de features que se gatean por tier. Mantener sincronizado con
 *  PRODUCT.md → Product Purpose. Cada feature declara el tier MÍNIMO que
 *  la activa (incluyente: estudio incluye pro, pro incluye solo). */
export const FEATURE_MIN_TIER = {
  // Solo (gratis): todo lo que ya está incluido en el tier base.
  agenda: 'solo',
  caja: 'solo',
  pwaPublica: 'solo',
  veriFactu: 'solo',
  cobroOnlineQr: 'solo',
  fidelidadBase: 'solo',           // PRODUCT.md lista fidelidad como Pro,
                                    // pero los stamps básicos son baseline.

  // Pro (49€): bot, multi-barbero, SumUp, fidelidad/promos avanzadas.
  whatsappBot: 'pro',
  multiBarber: 'pro',
  sumupTapToPay: 'pro',
  loyaltyAdvanced: 'pro',
  promosContextuales: 'pro',
  walkInsAvanzados: 'pro',

  // Estudio (99€): IA voz + subdominio + onboarding 1:1.
  recepcionistaIA: 'estudio',
  subdominioPropio: 'estudio',
  onboarding1a1: 'estudio',
  soportePrioritario: 'estudio',

  // Pro+: control financiero (gastos, costes fijos, retiros, resumen P&L).
  controlFinanciero: 'pro',
} as const satisfies Record<string, Tier>;

export type Feature = keyof typeof FEATURE_MIN_TIER;

/** Orden canónico de tiers. El índice = "nivel". Más alto = incluye los
 *  inferiores. */
const TIER_RANK: Record<Tier, number> = {
  solo: 0,
  pro: 1,
  estudio: 2,
};

/** Devuelve el tier vigente del cliente. Mapea legacy `plan` si por alguna
 *  razón `tier` aún no está poblado en esta row (defensivo, debería pasar
 *  solo durante la ventana de migración). */
export function getTier(client: Client): Tier {
  if (client.tier === 'pro' || client.tier === 'estudio' || client.tier === 'solo') {
    return client.tier;
  }
  // Fallback desde legacy plan.
  if (client.plan === 'chatbot') return 'pro';
  if (client.plan === 'full') return 'estudio';
  return 'solo';
}

/** True si el cliente está en ventana de trial activo. */
export function isInTrial(client: Client, now: Date = new Date()): boolean {
  if (!client.trialEndsAt) return false;
  return client.trialEndsAt.getTime() > now.getTime();
}

/** Días restantes de trial (entero, redondeado hacia arriba). 0 si no hay
 *  trial activo. Útil para banners "Te quedan 7 días". */
export function trialDaysLeft(client: Client, now: Date = new Date()): number {
  if (!client.trialEndsAt) return 0;
  const ms = client.trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** ¿Tiene este cliente acceso a esta feature? Considera el tier efectivo
 *  + el estado de trial (durante trial, el cliente actúa como Pro aunque
 *  el tier sea 'solo' a efectos de billing). */
export function hasFeature(client: Client, feature: Feature, now?: Date): boolean {
  // Cliente cancelled o paused pierde features sobre el tier base.
  if (client.status === 'cancelled') {
    return FEATURE_MIN_TIER[feature] === 'solo';
  }

  const effectiveTier: Tier = isInTrial(client, now) ? 'pro' : getTier(client);
  const requiredRank = TIER_RANK[FEATURE_MIN_TIER[feature]];
  return TIER_RANK[effectiveTier] >= requiredRank;
}

/** Devuelve el tier mínimo que desbloquea una feature. Útil para mensajes
 *  de upgrade ("Necesitas Pro para esto"). */
export function minTierFor(feature: Feature): Tier {
  return FEATURE_MIN_TIER[feature];
}

/** Mensaje user-facing en castellano para CTA de upgrade. */
export function upgradeMessage(feature: Feature): {
  title: string;
  body: string;
  ctaTier: Tier;
} {
  const required = minTierFor(feature);
  const featureLabel: Record<Feature, string> = {
    agenda: 'la agenda',
    caja: 'la caja',
    pwaPublica: 'la página pública',
    veriFactu: 'VeriFactu',
    cobroOnlineQr: 'el cobro online',
    fidelidadBase: 'la fidelidad básica',
    whatsappBot: 'el bot de WhatsApp',
    multiBarber: 'añadir más barberos',
    sumupTapToPay: 'cobrar con Tap to Pay',
    loyaltyAdvanced: 'la fidelidad avanzada',
    promosContextuales: 'las promos contextuales',
    walkInsAvanzados: 'los walk-ins avanzados',
    recepcionistaIA: 'la recepcionista de IA',
    subdominioPropio: 'tu subdominio propio',
    onboarding1a1: 'el onboarding 1:1',
    soportePrioritario: 'el soporte prioritario',
    controlFinanciero: 'el control financiero',
  };
  const tierLabel: Record<Tier, string> = {
    solo: 'Solo',
    pro: 'Pro',
    estudio: 'Estudio',
  };
  return {
    title: `Necesitas el plan ${tierLabel[required]}`,
    body: `Para usar ${featureLabel[feature]} necesitas el plan ${tierLabel[required]}. Puedes activarlo en Mi plan.`,
    ctaTier: required,
  };
}

/** Estructura de respuesta JSON 403 estándar para routes que se gatean
 *  por feature. */
export function upgradeRequiredResponse(feature: Feature): Response {
  const msg = upgradeMessage(feature);
  return Response.json(
    {
      error: 'upgrade_required',
      feature,
      ...msg,
    },
    { status: 403 },
  );
}

/** Para usar en una route Next.js que ya tiene `client` en scope. Lanza
 *  un Response 403 si la feature no está disponible. */
export function requireFeature(client: Client, feature: Feature, now?: Date): Response | null {
  if (hasFeature(client, feature, now)) return null;
  return upgradeRequiredResponse(feature);
}

/** ¿Es éste un upgrade real (no un downgrade ni el mismo tier)? */
export function isUpgrade(from: Tier, to: Tier): boolean {
  return TIER_RANK[to] > TIER_RANK[from];
}

/** Precios de referencia. Mantener sincronizado con PRODUCT.md y con los
 *  precios reales en Stripe. Anual ofrece descuento agresivo para empujar
 *  cashflow upfront (importante en arranque sin marca consolidada).
 *
 *  Pro: 20% off anual (49 → 39).
 *  Estudio: ~30% off anual (169 → 119) — descuento amplio porque el
 *  cashflow upfront de €1.428/cliente vale más al inicio que el margen
 *  mensual extra. Decision Alex 2026-04-30. */
export const TIER_PRICES = {
  solo: { monthly: 0, annual: 0 },
  pro: { monthly: 4900, annual: 3900 }, // cents/mes facturados
  estudio: { monthly: 16900, annual: 11900 },
} as const satisfies Record<Tier, Record<BillingInterval, number>>;

/** Llamadas incluidas/mes en el cupo de la recepcionista IA (Estudio).
 *  Después: cobramos por llamada extra. Margen 4x sobre coste real
 *  (€0.075/llamada → €0.30 cobrado). Cap por LLAMADAS, no minutos: más
 *  fácil de entender para el barbero que el modelo de la competencia. */
export const ESTUDIO_INCLUDED_CALLS_PER_MONTH = 200;
export const ESTUDIO_OVERAGE_CENTS_PER_CALL = 30;

/** Trial dura 14 días en Pro. Solo es gratis para siempre, no necesita.
 *  Estudio tiene onboarding 1:1, no self-serve trial. */
export const TRIAL_DAYS_BY_TIER: Record<Tier, number | null> = {
  solo: null,
  pro: 14,
  estudio: null,
};
