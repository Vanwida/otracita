// -----------------------------------------------------------------------------
// Types para la feature de loyalty. Persistidos en `clients.loyaltyConfig`
// (jsonb). La shape varía según `clients.loyaltyMode`.
//
// Decisiones de diseño:
//   · 2 modos excluyentes (stamps | points) — el barbero elige uno, no los dos
//     a la vez. Simplifica UI y ledger.
//   · Recompensas por NOMBRE de servicio, no por ID. clients.chatbotServices
//     es un jsonb[] sin ID estable; la única referencia estable es el name.
//     Si el barbero renombra o borra el servicio, el canje siguiente muestra
//     error en vez de dar un servicio fantasma. `rewardSnapshot` en
//     loyaltyLedger preserva lo que se dio en canjes pasados.
//   · minPriceCents: evita farmeo con bookings triviales (ej. 1€ "fake").
//   · expirationMonths: null = nunca caduca. Cuando != null, el balance
//     descarta transacciones más viejas que N meses al leer (en v1 no
//     insertamos filas de expiración; v2 podría hacerlo con un cron).
// -----------------------------------------------------------------------------

export type LoyaltyMode = 'stamps' | 'points'

export type LoyaltyRewardType = 'service' | 'discount_amount' | 'discount_pct'

export interface LoyaltyReward {
  type: LoyaltyRewardType
  /** Nombre EXACTO de un servicio en clients.chatbotServices. Sólo si type='service'. */
  serviceName?: string
  /** Importe de descuento en céntimos. Sólo si type='discount_amount'. */
  cents?: number
  /** Porcentaje 1..100. Sólo si type='discount_pct'. */
  pct?: number
}

export interface LoyaltyStampsConfig {
  mode: 'stamps'
  /** Número de sellos para la recompensa. Rango validado: 2..50. */
  stampsNeeded: number
  /** Qué gana el cliente al llegar a `stampsNeeded`. */
  reward: LoyaltyReward
  /** null = todos los servicios suman. Array = sólo estos nombres. */
  eligibleServiceNames: string[] | null
  /** Precio mínimo (céntimos) del booking para ganar sello. 0 = sin mínimo. */
  minPriceCents: number
  /** Caducidad en meses desde el último movimiento, o null para nunca. */
  expirationMonths: number | null
}

export interface LoyaltyPointsConfig {
  mode: 'points'
  /** Puntos por cada 1€ facturado. Rango validado: 0.1..100 (se guarda *10). */
  euroToPoints: number
  /** Umbrales de canje, ordenados por coste ascendente. Al menos 1. */
  redeemTiers: Array<{
    pointsCost: number
    reward: LoyaltyReward
  }>
  eligibleServiceNames: string[] | null
  minPriceCents: number
  expirationMonths: number | null
}

export type LoyaltyConfig = LoyaltyStampsConfig | LoyaltyPointsConfig

// Defaults razonables para cuando un barbero activa por primera vez.
export const DEFAULT_STAMPS_CONFIG: LoyaltyStampsConfig = {
  mode: 'stamps',
  stampsNeeded: 10,
  reward: { type: 'discount_pct', pct: 100 }, // "el 10º corte gratis" — 100% dto se interpreta como gratis al tipo de servicio elegible
  eligibleServiceNames: null,
  minPriceCents: 1000,                         // 10 € para no farmear con bookings triviales
  expirationMonths: null,
}

export const DEFAULT_POINTS_CONFIG: LoyaltyPointsConfig = {
  mode: 'points',
  euroToPoints: 1,                             // 1 € = 1 punto
  redeemTiers: [
    { pointsCost: 100, reward: { type: 'discount_amount', cents: 500 } }, // 100 pts → 5 €
  ],
  eligibleServiceNames: null,
  minPriceCents: 1000,
  expirationMonths: null,
}

// Razones válidas en loyalty_ledger.reason.
export const LOYALTY_REASONS = [
  'booking_completed',
  'redeem',
  'adjustment_manual',
  'expired',
] as const

export type LoyaltyReason = (typeof LOYALTY_REASONS)[number]

// ─── Progress shapes (consumidas por UI cliente PWA) ────────────────────────
// Duplicadas aquí para evitar que el bundle cliente arrastre compute.ts
// (que a su vez importa `drizzle-orm/pg-core` via types). Mantener en sync
// con lo que devuelve computeProgress en compute.ts.

export interface StampsProgress {
  mode: 'stamps'
  earned: number
  needed: number
  /** 0..1 — cuánto de la cartilla actual está completada. */
  progress: number
  canRedeem: boolean
  reward: LoyaltyReward
}

export interface PointsProgress {
  mode: 'points'
  balance: number
  tiers: Array<{
    pointsCost: number
    reward: LoyaltyReward
    canRedeem: boolean
  }>
  nextTier: { pointsCost: number; reward: LoyaltyReward } | null
  /** 0..1 progreso hacia `nextTier`. 1 si nextTier es null. */
  progress: number
}

export type LoyaltyProgress = StampsProgress | PointsProgress
