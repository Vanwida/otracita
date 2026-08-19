import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeBookingDelta,
  computeBalance,
  computeProgress,
  sanitizeReward,
  sanitizeStampsConfig,
  sanitizePointsConfig,
} from './compute.ts'
import type { LoyaltyStampsConfig, LoyaltyPointsConfig } from './types.ts'

// -----------------------------------------------------------------------------
// computeBookingDelta
// -----------------------------------------------------------------------------

const stamps10: LoyaltyStampsConfig = {
  mode: 'stamps',
  stampsNeeded: 10,
  reward: { type: 'discount_pct', pct: 100 },
  eligibleServiceNames: null,
  minPriceCents: 1000,
  expirationMonths: null,
}

const points1: LoyaltyPointsConfig = {
  mode: 'points',
  euroToPoints: 1,
  redeemTiers: [{ pointsCost: 100, reward: { type: 'discount_amount', cents: 500 } }],
  eligibleServiceNames: null,
  minPriceCents: 1000,
  expirationMonths: null,
}

test('stamps: booking con precio >= min da 1 sello', () => {
  assert.equal(computeBookingDelta({ priceCents: 1500, serviceName: 'Corte' }, stamps10), 1)
  assert.equal(computeBookingDelta({ priceCents: 1000, serviceName: 'Corte' }, stamps10), 1)
})

test('stamps: booking por debajo del min no da sello', () => {
  assert.equal(computeBookingDelta({ priceCents: 900, serviceName: 'Corte' }, stamps10), 0)
})

test('stamps: booking sin precio no da sello', () => {
  assert.equal(computeBookingDelta({ priceCents: null, serviceName: 'Corte' }, stamps10), 0)
  assert.equal(computeBookingDelta({ priceCents: 0, serviceName: 'Corte' }, stamps10), 0)
})

test('stamps: respeta eligibleServiceNames si está set', () => {
  const cfg: LoyaltyStampsConfig = { ...stamps10, eligibleServiceNames: ['Corte'] }
  assert.equal(computeBookingDelta({ priceCents: 1500, serviceName: 'Corte' }, cfg), 1)
  assert.equal(computeBookingDelta({ priceCents: 1500, serviceName: 'Barba' }, cfg), 0)
})

test('stamps: null o [] en eligibleServiceNames acepta todos', () => {
  const cfg: LoyaltyStampsConfig = { ...stamps10, eligibleServiceNames: [] }
  assert.equal(computeBookingDelta({ priceCents: 1500, serviceName: 'Cualquiera' }, cfg), 1)
})

test('points: 12 € * 1 pt/€ = 12 pts', () => {
  assert.equal(computeBookingDelta({ priceCents: 1200, serviceName: 'Corte' }, points1), 12)
})

test('points: redondea al entero más cercano', () => {
  const cfg: LoyaltyPointsConfig = { ...points1, euroToPoints: 1.5 }
  assert.equal(computeBookingDelta({ priceCents: 1300, serviceName: 'Corte' }, cfg), 20) // 19.5 → 20
  assert.equal(computeBookingDelta({ priceCents: 1000, serviceName: 'Corte' }, cfg), 15)
})

test('points: respeta minPriceCents', () => {
  assert.equal(computeBookingDelta({ priceCents: 900, serviceName: 'Corte' }, points1), 0)
})

// L-05 — precios con decimales. Antes el importe llegaba en euros ENTEROS
// (12,50 € se guardaba como 13), así que un servicio de 12,50 € otorgaba
// puntos de 13 € y podía cruzar un minPrice que en realidad no cruzaba.
test('L-05: 12,50 € (1250c) compara contra minPriceCents sin redondear a euro', () => {
  const cfg: LoyaltyStampsConfig = { ...stamps10, minPriceCents: 1300 }
  // 1250 < 1300 → no hay sello. Con el bug viejo (12,50 → 13 €) sí lo daba.
  assert.equal(computeBookingDelta({ priceCents: 1250, serviceName: 'Corte' }, cfg), 0)
  assert.equal(computeBookingDelta({ priceCents: 1300, serviceName: 'Corte' }, cfg), 1)
})

test('L-05: los puntos usan el importe real con decimales', () => {
  // 17,50 € × 1 pt/€ = 17,5 → 18 pts (redondeo al entero más cercano).
  assert.equal(computeBookingDelta({ priceCents: 1750, serviceName: 'Corte' }, points1), 18)
  // 12,50 € × 1 pt/€ = 12,5 → 13 pts.
  assert.equal(computeBookingDelta({ priceCents: 1250, serviceName: 'Corte' }, points1), 13)
})

// -----------------------------------------------------------------------------
// computeBalance
// -----------------------------------------------------------------------------

test('balance: suma todos los deltas', () => {
  const rows = [
    { delta: 1, createdAt: new Date() },
    { delta: 1, createdAt: new Date() },
    { delta: -2, createdAt: new Date() },
    { delta: 3, createdAt: new Date() },
  ]
  assert.equal(computeBalance(rows, stamps10), 3)
})

test('balance: sin caducidad incluye filas antiguas', () => {
  const old = new Date('2020-01-01')
  const rows = [
    { delta: 5, createdAt: old },
    { delta: 3, createdAt: new Date() },
  ]
  assert.equal(computeBalance(rows, stamps10), 8)
})

test('balance: con caducidad descarta filas más viejas que el umbral', () => {
  const cfg: LoyaltyStampsConfig = { ...stamps10, expirationMonths: 6 }
  const now = new Date('2026-06-01')
  const rows = [
    { delta: 5, createdAt: new Date('2025-01-01') }, // >6m → fuera
    { delta: 3, createdAt: new Date('2026-03-01') }, // dentro
    { delta: 2, createdAt: new Date('2026-05-01') }, // dentro
  ]
  assert.equal(computeBalance(rows, cfg, now), 5)
})

// -----------------------------------------------------------------------------
// computeProgress — stamps
// -----------------------------------------------------------------------------

test('progress stamps: 7/10 → no canjeable, progress 0.7', () => {
  const p = computeProgress(7, stamps10)
  assert.equal(p.mode, 'stamps')
  if (p.mode !== 'stamps') return
  assert.equal(p.earned, 7)
  assert.equal(p.needed, 10)
  assert.equal(p.progress, 0.7)
  assert.equal(p.canRedeem, false)
})

test('progress stamps: 10/10 → canjeable', () => {
  const p = computeProgress(10, stamps10)
  if (p.mode !== 'stamps') throw new Error('expected stamps')
  assert.equal(p.canRedeem, true)
  assert.equal(p.progress, 1)
})

test('progress stamps: 15/10 → canjeable, earned capped a needed para UI', () => {
  const p = computeProgress(15, stamps10)
  if (p.mode !== 'stamps') throw new Error('expected stamps')
  assert.equal(p.earned, 10) // display, no real balance
  assert.equal(p.canRedeem, true)
})

// -----------------------------------------------------------------------------
// computeProgress — points
// -----------------------------------------------------------------------------

test('progress points: muestra todos los tiers con canRedeem correcto', () => {
  const cfg: LoyaltyPointsConfig = {
    ...points1,
    redeemTiers: [
      { pointsCost: 100, reward: { type: 'discount_amount', cents: 500 } },
      { pointsCost: 250, reward: { type: 'discount_amount', cents: 1500 } },
      { pointsCost: 500, reward: { type: 'service', serviceName: 'Corte' } },
    ],
  }
  const p = computeProgress(300, cfg)
  if (p.mode !== 'points') throw new Error('expected points')
  assert.equal(p.balance, 300)
  assert.equal(p.tiers.length, 3)
  assert.equal(p.tiers[0].canRedeem, true)
  assert.equal(p.tiers[1].canRedeem, true)
  assert.equal(p.tiers[2].canRedeem, false)
  assert.equal(p.nextTier?.pointsCost, 500)
  assert.equal(p.progress, 0.6)
})

test('progress points: balance por encima del tier más alto → nextTier null, progress 1', () => {
  const p = computeProgress(1000, points1)
  if (p.mode !== 'points') throw new Error('expected points')
  assert.equal(p.nextTier, null)
  assert.equal(p.progress, 1)
})

// -----------------------------------------------------------------------------
// sanitizeReward
// -----------------------------------------------------------------------------

test('sanitizeReward: service válido', () => {
  assert.deepEqual(sanitizeReward({ type: 'service', serviceName: 'Corte' }), {
    type: 'service',
    serviceName: 'Corte',
  })
})

test('sanitizeReward: service sin nombre → null', () => {
  assert.equal(sanitizeReward({ type: 'service', serviceName: '  ' }), null)
})

test('sanitizeReward: discount_amount dentro del rango', () => {
  assert.deepEqual(sanitizeReward({ type: 'discount_amount', cents: 500 }), {
    type: 'discount_amount',
    cents: 500,
  })
})

test('sanitizeReward: discount_amount fuera de rango → null', () => {
  assert.equal(sanitizeReward({ type: 'discount_amount', cents: 0 }), null)
  assert.equal(sanitizeReward({ type: 'discount_amount', cents: 200_000 }), null)
})

test('sanitizeReward: discount_pct 1..100', () => {
  assert.deepEqual(sanitizeReward({ type: 'discount_pct', pct: 50 }), {
    type: 'discount_pct',
    pct: 50,
  })
  assert.equal(sanitizeReward({ type: 'discount_pct', pct: 0 }), null)
  assert.equal(sanitizeReward({ type: 'discount_pct', pct: 101 }), null)
})

test('sanitizeReward: tipo desconocido → null', () => {
  assert.equal(sanitizeReward({ type: 'pizza' }), null)
  assert.equal(sanitizeReward(null), null)
  assert.equal(sanitizeReward('nope'), null)
})

// -----------------------------------------------------------------------------
// sanitizeStampsConfig / sanitizePointsConfig
// -----------------------------------------------------------------------------

test('sanitizeStampsConfig: valid config pasa', () => {
  const c = sanitizeStampsConfig({
    stampsNeeded: 10,
    reward: { type: 'service', serviceName: 'Corte' },
    eligibleServiceNames: ['Corte', 'Barba'],
    minPriceCents: 1000,
    expirationMonths: 12,
  })
  assert.ok(c)
  assert.equal(c!.stampsNeeded, 10)
  assert.deepEqual(c!.eligibleServiceNames, ['Corte', 'Barba'])
})

test('sanitizeStampsConfig: stampsNeeded fuera de rango → null', () => {
  assert.equal(
    sanitizeStampsConfig({ stampsNeeded: 1, reward: { type: 'discount_pct', pct: 50 } }),
    null,
  )
  assert.equal(
    sanitizeStampsConfig({ stampsNeeded: 100, reward: { type: 'discount_pct', pct: 50 } }),
    null,
  )
})

test('sanitizePointsConfig: tiers se ordenan por coste ascendente', () => {
  const c = sanitizePointsConfig({
    euroToPoints: 1,
    redeemTiers: [
      { pointsCost: 500, reward: { type: 'service', serviceName: 'Corte' } },
      { pointsCost: 100, reward: { type: 'discount_amount', cents: 500 } },
    ],
  })
  assert.ok(c)
  assert.equal(c!.redeemTiers[0].pointsCost, 100)
  assert.equal(c!.redeemTiers[1].pointsCost, 500)
})

test('sanitizePointsConfig: sin tiers → null', () => {
  assert.equal(sanitizePointsConfig({ euroToPoints: 1, redeemTiers: [] }), null)
})

test('sanitizePointsConfig: euroToPoints fuera de rango → null', () => {
  assert.equal(
    sanitizePointsConfig({
      euroToPoints: 0,
      redeemTiers: [{ pointsCost: 100, reward: { type: 'discount_amount', cents: 500 } }],
    }),
    null,
  )
  assert.equal(
    sanitizePointsConfig({
      euroToPoints: 101,
      redeemTiers: [{ pointsCost: 100, reward: { type: 'discount_amount', cents: 500 } }],
    }),
    null,
  )
})
