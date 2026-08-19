import type {
  LoyaltyConfig,
  LoyaltyPointsConfig,
  LoyaltyReward,
  LoyaltyStampsConfig,
} from './types'

// -----------------------------------------------------------------------------
// Lógica de cómputo de loyalty. Puro — sin DB, sin I/O. Testeado en compute.test.ts.
//
// Unidades de delta según modo:
//   · stamps  → 1 unidad = 1 sello
//   · points  → 1 unidad = 1 punto
// Así un mismo schema de ledger sirve para los dos modos sin ambigüedad.
//
// Precios: desde L-05 `bookings.price_cents` está en CÉNTIMOS enteros, igual
// que invoices/payments/tips. `computeBookingDelta` recibe céntimos y no
// convierte nada — `minPriceCents` se compara directo.
// -----------------------------------------------------------------------------

interface BookingLike {
  /** Precio del booking en CÉNTIMOS (como está en bookings.price_cents). Puede ser null. */
  priceCents: number | null
  /** Nombre del servicio (coincide con clients.chatbotServices[i].name). */
  serviceName: string
}

/**
 * Cuántas unidades (sellos o puntos) gana este booking según el config.
 * Devuelve 0 si no es elegible o si el precio es insuficiente.
 */
export function computeBookingDelta(
  booking: BookingLike,
  config: LoyaltyConfig,
): number {
  // Sin precio registrado no awardamos (no podemos aplicar minPrice ni convertir a pts).
  if (booking.priceCents == null || booking.priceCents <= 0) return 0

  if (booking.priceCents < config.minPriceCents) return 0

  // Filtro por servicios elegibles (null/[] = todos).
  if (
    config.eligibleServiceNames &&
    config.eligibleServiceNames.length > 0 &&
    !config.eligibleServiceNames.includes(booking.serviceName)
  ) {
    return 0
  }

  if (config.mode === 'stamps') return 1

  // mode === 'points'
  // Redondeamos al entero más cercano para evitar mostrar decimales al cliente.
  const pts = (booking.priceCents / 100) * config.euroToPoints
  return Math.round(pts)
}

interface LedgerRow {
  delta: number
  createdAt: Date | string
}

/**
 * Saldo actual de un cliente. Si el config tiene caducidad en meses, filtra
 * transacciones más viejas que ese umbral ANTES de sumar. (v1: el filtro
 * aplica a TODAS las filas — earn y redeem. v2 debería separar: el earn
 * caduca, el redeem persiste como "gastado". En v1 el efecto neto es el
 * mismo si no hay redeems cuasi-simultáneos con caducidades.)
 */
export function computeBalance(
  rows: LedgerRow[],
  config: LoyaltyConfig,
  now: Date = new Date(),
): number {
  const cutoff =
    config.expirationMonths != null
      ? new Date(now.getTime() - config.expirationMonths * 30 * 24 * 3600 * 1000)
      : null

  let sum = 0
  for (const r of rows) {
    if (cutoff) {
      const ts = typeof r.createdAt === 'string' ? new Date(r.createdAt) : r.createdAt
      if (ts < cutoff) continue
    }
    sum += r.delta
  }
  return sum
}

// ─── Progress helpers ───────────────────────────────────────────────────────
// Las shapes (StampsProgress/PointsProgress/LoyaltyProgress) viven en
// `types.ts` para que el bundle cliente PWA pueda importarlas sin arrastrar
// Drizzle. Re-export aquí para conveniencia del server.

export type { StampsProgress, PointsProgress, LoyaltyProgress } from './types'
import type { StampsProgress, PointsProgress, LoyaltyProgress } from './types'

export function computeProgress(
  balance: number,
  config: LoyaltyConfig,
): LoyaltyProgress {
  if (config.mode === 'stamps') {
    return computeStampsProgress(balance, config)
  }
  return computePointsProgress(balance, config)
}

function computeStampsProgress(
  balance: number,
  config: LoyaltyStampsConfig,
): StampsProgress {
  const earned = Math.max(0, balance)
  // La "cartilla actual" es `balance mod stampsNeeded` una vez se canjea,
  // pero mientras el barbero no canjea, mostramos el total hasta completar
  // una cartilla. Al alcanzar `stampsNeeded`, la UI dice "puedes canjear".
  const needed = Math.max(1, Math.round(config.stampsNeeded))
  const shown = Math.min(earned, needed)
  return {
    mode: 'stamps',
    earned: shown,
    needed,
    progress: needed === 0 ? 1 : shown / needed,
    canRedeem: earned >= needed,
    reward: config.reward,
  }
}

function computePointsProgress(
  balance: number,
  config: LoyaltyPointsConfig,
): PointsProgress {
  const bal = Math.max(0, balance)
  const sorted = [...config.redeemTiers].sort((a, b) => a.pointsCost - b.pointsCost)
  const tiers = sorted.map((t) => ({
    pointsCost: t.pointsCost,
    reward: t.reward,
    canRedeem: bal >= t.pointsCost,
  }))
  const nextLocked = sorted.find((t) => bal < t.pointsCost) ?? null
  const progress = nextLocked
    ? nextLocked.pointsCost === 0
      ? 1
      : Math.min(1, bal / nextLocked.pointsCost)
    : 1
  return {
    mode: 'points',
    balance: bal,
    tiers,
    nextTier: nextLocked ? { pointsCost: nextLocked.pointsCost, reward: nextLocked.reward } : null,
    progress,
  }
}

// ─── Sanitizers (input → config válido o null) ──────────────────────────────

/**
 * Sanitiza un LoyaltyReward. Devuelve null si no es válido. El caller decide
 * qué hacer (rechazar request, caer al default, etc.).
 */
export function sanitizeReward(input: unknown): LoyaltyReward | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  const type = r.type
  if (type === 'service') {
    const name = typeof r.serviceName === 'string' ? r.serviceName.trim() : ''
    if (!name) return null
    return { type: 'service', serviceName: name }
  }
  if (type === 'discount_amount') {
    const cents = toInt(r.cents)
    if (cents == null || cents < 1 || cents > 100_000) return null
    return { type: 'discount_amount', cents }
  }
  if (type === 'discount_pct') {
    const pct = toInt(r.pct)
    if (pct == null || pct < 1 || pct > 100) return null
    return { type: 'discount_pct', pct }
  }
  return null
}

export function sanitizeStampsConfig(input: unknown): LoyaltyStampsConfig | null {
  if (!input || typeof input !== 'object') return null
  const c = input as Record<string, unknown>
  const stampsNeeded = toInt(c.stampsNeeded)
  if (stampsNeeded == null || stampsNeeded < 2 || stampsNeeded > 50) return null
  const reward = sanitizeReward(c.reward)
  if (!reward) return null
  return {
    mode: 'stamps',
    stampsNeeded,
    reward,
    eligibleServiceNames: sanitizeEligible(c.eligibleServiceNames),
    minPriceCents: clampInt(c.minPriceCents, 0, 100_000, 0),
    expirationMonths: sanitizeExpiration(c.expirationMonths),
  }
}

export function sanitizePointsConfig(input: unknown): LoyaltyPointsConfig | null {
  if (!input || typeof input !== 'object') return null
  const c = input as Record<string, unknown>
  const euroToPoints = toFloat(c.euroToPoints)
  if (euroToPoints == null || euroToPoints <= 0 || euroToPoints > 100) return null
  if (!Array.isArray(c.redeemTiers) || c.redeemTiers.length === 0) return null
  const tiers: LoyaltyPointsConfig['redeemTiers'] = []
  for (const raw of c.redeemTiers) {
    if (!raw || typeof raw !== 'object') return null
    const t = raw as Record<string, unknown>
    const pointsCost = toInt(t.pointsCost)
    if (pointsCost == null || pointsCost < 1 || pointsCost > 100_000) return null
    const reward = sanitizeReward(t.reward)
    if (!reward) return null
    tiers.push({ pointsCost, reward })
  }
  // Ordenar por coste ascendente — la UI y el cálculo de progress dependen de esto.
  tiers.sort((a, b) => a.pointsCost - b.pointsCost)
  return {
    mode: 'points',
    euroToPoints,
    redeemTiers: tiers,
    eligibleServiceNames: sanitizeEligible(c.eligibleServiceNames),
    minPriceCents: clampInt(c.minPriceCents, 0, 100_000, 0),
    expirationMonths: sanitizeExpiration(c.expirationMonths),
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

function toInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? Math.floor(n) : null
}

function toFloat(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = toInt(v)
  if (n == null) return fallback
  return Math.max(min, Math.min(max, n))
}

function sanitizeEligible(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const names = v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0)
  return names.length > 0 ? names : null
}

function sanitizeExpiration(v: unknown): number | null {
  if (v == null) return null
  const n = toInt(v)
  if (n == null || n < 1) return null
  return Math.min(120, n) // hard cap a 10 años
}
