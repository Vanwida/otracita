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
import { MS_IN_DAY } from '../time.ts';

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
  // Pro+: auto-respuesta IA a reseñas de Google Business Profile.
  googleReviews: 'pro',

  // Estudio (169€/mes, 119€/mes anual): IA voz + subdominio + onboarding 1:1.
  // La IA de voz es hoy prueba de micrófono en el navegador: no hay puente
  // telefónico todavía (ver src/app/dashboard/voice-test/VoiceTest.tsx).
  recepcionistaIA: 'estudio',
  subdominioPropio: 'estudio',
  onboarding1a1: 'estudio',
  soportePrioritario: 'estudio',

  // Pro+: control financiero (gastos, costes fijos, retiros, resumen P&L).
  controlFinanciero: 'pro',
  // Pro+: Google Tag Manager — el barbero pega su container ID y mide
  // conversiones con sus pixels (Meta, GA4, Google Ads, TikTok). Solo
  // tiene sentido para barberos que invierten en ads.
  gtmContainer: 'pro',
  // Pro+: bonos por barbero. Cada dueño configura los bonos de su equipo
  // (reseñas, productos, asistencia, etc.); en caja se incrementan los
  // contadores y a fin de mes se ve quién cobra. Manual-only v1.
  teamBonuses: 'pro',
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
  return Math.ceil(ms / MS_IN_DAY);
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
    googleReviews: 'la auto-respuesta a reseñas de Google',
    recepcionistaIA: 'la prueba de la recepcionista de IA',
    subdominioPropio: 'tu subdominio propio',
    onboarding1a1: 'el onboarding 1:1',
    soportePrioritario: 'el soporte prioritario',
    controlFinanciero: 'el control financiero',
    gtmContainer: 'Google Tag Manager',
    teamBonuses: 'los bonos del equipo',
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

// -----------------------------------------------------------------------------
// Sincronización webhook Stripe → fila `clients`.
//
// Lógica PURA (sin db, sin Stripe SDK) que decide qué campos de `clients`
// actualizar cuando llega un `customer.subscription.{created,updated}`. La
// usa `handleSubscriptionChange` en el webhook; vivir aquí la hace testeable
// sin mockear Stripe/Neon y la mantiene como single source of truth de la
// regla tier↔estado.
// -----------------------------------------------------------------------------

/** Estados de subscription Stripe que provocan downgrade inmediato a Solo.
 *  `past_due` NO está aquí: es periodo de gracia, Stripe sigue reintentando. */
const DOWNGRADE_SUB_STATUSES = new Set<string>([
  'paused',
  'unpaid',
  'incomplete_expired',
  'canceled',
]);

/** Estados activos: el cliente disfruta del tier de la subscription. */
const ACTIVE_SUB_STATUSES = new Set<string>(['trialing', 'active']);

/** Update derivado a aplicar sobre la fila `clients`. Solo incluye las claves
 *  que cambian; campos ausentes = no se tocan. */
export interface ClientSubscriptionSync {
  trialEndsAt: Date | null;
  status?: 'active' | 'cancelled';
  tier?: Tier;
  billingInterval?: null;
}

/**
 * Decide cómo sincronizar la fila `clients` ante un cambio de subscription.
 *
 * @param subStatus    `subscription.status` que mandó Stripe.
 * @param subTier      `subscriptions.tier` ya persistido (lo escribe checkout
 *                     desde metadata). Es la fuente canónica del tier.
 * @param clientStatus estado ACTUAL del cliente (para re-activar si venía de
 *                     cancelled).
 * @param trialEndsAt  fin de trial derivado de `subscription.trial_end`.
 */
export function resolveSubscriptionSync(
  subStatus: string,
  subTier: string | null,
  clientStatus: string | null,
  trialEndsAt: Date | null,
): ClientSubscriptionSync {
  // Downgrade: pierde tier Pro/Estudio, vuelve a Solo y queda cancelled.
  if (DOWNGRADE_SUB_STATUSES.has(subStatus)) {
    return {
      status: 'cancelled',
      tier: 'solo',
      billingInterval: null,
      trialEndsAt: null,
    };
  }

  // Activo (trialing/active): persistimos SIEMPRE el tier de la subscription
  // en clients.tier — esto cierra el bug G4 (cliente creado antes del
  // checkout cuyo INSERT idempotente no tocó clients.tier). Si veníamos de
  // cancelled, además re-activamos.
  if (ACTIVE_SUB_STATUSES.has(subStatus)) {
    const sync: ClientSubscriptionSync = { trialEndsAt };
    if (subTier === 'pro' || subTier === 'estudio' || subTier === 'solo') {
      sync.tier = subTier;
    }
    if (clientStatus === 'cancelled') {
      sync.status = 'active';
    }
    return sync;
  }

  // past_due / incomplete / cualquier otro: periodo de gracia. Mantenemos
  // tier y status; solo sincronizamos trialEndsAt.
  return { trialEndsAt };
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
