import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeBarberPayroll, isProfileConfigured, selectTierBonus } from './compute.ts'
import type { BarberMonthRaw, BarberSalaryProfile, TierBonus } from './types.ts'

const ZERO_RAW: BarberMonthRaw = {
  servicesRevenueCents: 0,
  productsRevenueCents: 0,
  tipsCents: 0,
  bonusesPayoutCents: 0,
}

function profile(p: Partial<BarberSalaryProfile> = {}): BarberSalaryProfile {
  return {
    salaryType: p.salaryType ?? null,
    salaryBaseCents: p.salaryBaseCents ?? 0,
    commissionServicesPct: p.commissionServicesPct ?? 0,
    commissionProductsPct: p.commissionProductsPct ?? 0,
    chairRentCents: p.chairRentCents ?? 0,
    tierBonuses: p.tierBonuses ?? null,
  }
}

describe('computeBarberPayroll — perfil fijo (solo base)', () => {
  it('base 1250€ sin ingresos → total = 1250€', () => {
    const r = computeBarberPayroll(profile({ salaryBaseCents: 125000 }), ZERO_RAW)
    assert.equal(r.totalCents, 125000)
    assert.equal(r.baseCents, 125000)
    assert.equal(r.commissionServicesCents, 0)
  })

  it('base 1250€ + propinas 50€ → total = 1300€ (propinas íntegras)', () => {
    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000 }),
      { ...ZERO_RAW, tipsCents: 5000 },
    )
    assert.equal(r.totalCents, 130000)
    assert.equal(r.tipsCents, 5000)
  })
})

describe('computeBarberPayroll — perfil mixto (base + comisiones)', () => {
  it('25% sobre 2160€ servicios = 540€ + base 1250€ = 1790€', () => {
    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000, commissionServicesPct: 25 }),
      { ...ZERO_RAW, servicesRevenueCents: 216000 },
    )
    assert.equal(r.commissionServicesCents, 54000)
    assert.equal(r.totalCents, 125000 + 54000)
  })

  it('comisiones servicios+productos + bonos suman al total', () => {
    const r = computeBarberPayroll(
      profile({
        salaryBaseCents: 125000,
        commissionServicesPct: 25,
        commissionProductsPct: 10,
      }),
      {
        servicesRevenueCents: 200000,   // 2.000 €
        productsRevenueCents: 50000,    // 500 €
        tipsCents: 3000,                 // 30 €
        bonusesPayoutCents: 5000,        // 50 €
      },
    )
    assert.equal(r.commissionServicesCents, 50000)   // 25% de 2.000€ = 500€
    assert.equal(r.commissionProductsCents, 5000)    // 10% de 500€ = 50€
    assert.equal(r.tipsCents, 3000)
    assert.equal(r.bonusesPayoutCents, 5000)
    assert.equal(r.totalCents, 125000 + 50000 + 5000 + 3000 + 5000)
  })
})

describe('computeBarberPayroll — perfil autónomo (alquiler RESTA)', () => {
  it('60% sobre 3000€ servicios − 150€ alquiler = 1650€', () => {
    const r = computeBarberPayroll(
      profile({
        commissionServicesPct: 60,
        chairRentCents: 15000,
      }),
      { ...ZERO_RAW, servicesRevenueCents: 300000 },
    )
    assert.equal(r.commissionServicesCents, 180000)
    assert.equal(r.chairRentCents, 15000)
    assert.equal(r.totalCents, 180000 - 15000)
  })

  it('total puede ser negativo si alquiler > comisiones (mes flojo)', () => {
    const r = computeBarberPayroll(
      profile({ commissionServicesPct: 50, chairRentCents: 20000 }),
      { ...ZERO_RAW, servicesRevenueCents: 30000 },   // 300€ × 50% = 150€
    )
    assert.equal(r.totalCents, 15000 - 20000)        // = -50€
    assert.ok(r.totalCents < 0)
  })
})

describe('computeBarberPayroll — defensivo', () => {
  it('% fuera de rango se capa a [0, 100]', () => {
    const r1 = computeBarberPayroll(
      profile({ commissionServicesPct: 150 }),
      { ...ZERO_RAW, servicesRevenueCents: 100000 },
    )
    assert.equal(r1.commissionServicesCents, 100000)  // 100% → 100% del raw

    const r2 = computeBarberPayroll(
      profile({ commissionServicesPct: -10 }),
      { ...ZERO_RAW, servicesRevenueCents: 100000 },
    )
    assert.equal(r2.commissionServicesCents, 0)
  })

  it('NaN en % se trata como 0', () => {
    const r = computeBarberPayroll(
      profile({ commissionServicesPct: NaN }),
      { ...ZERO_RAW, servicesRevenueCents: 100000 },
    )
    assert.equal(r.commissionServicesCents, 0)
  })

  it('base negativa se redondea a 0 (no bonifica al barbero)', () => {
    const r = computeBarberPayroll(profile({ salaryBaseCents: -500 }), ZERO_RAW)
    assert.equal(r.baseCents, 0)
  })
})

describe('isProfileConfigured', () => {
  it('todo a 0 sin salaryType → false', () => {
    assert.equal(isProfileConfigured(profile()), false)
  })

  it('salaryType seteado → true aunque todo sea 0', () => {
    assert.equal(isProfileConfigured(profile({ salaryType: 'fijo' })), true)
  })

  it('algún valor > 0 sin salaryType → true', () => {
    assert.equal(isProfileConfigured(profile({ salaryBaseCents: 100 })), true)
    assert.equal(isProfileConfigured(profile({ commissionServicesPct: 25 })), true)
    assert.equal(isProfileConfigured(profile({ chairRentCents: 150 })), true)
  })

  it('tramos no vacíos sin salaryType → true', () => {
    assert.equal(
      isProfileConfigured(profile({ tierBonuses: [{ thresholdCents: 400000, bonusCents: 10000 }] })),
      true,
    )
  })
})

// ----------------------------------------------------------------------------
// F1 — selectTierBonus (helper puro)
// ----------------------------------------------------------------------------

describe('selectTierBonus', () => {
  const tiers: TierBonus[] = [
    { thresholdCents: 400000, bonusCents: 10000 },   // 4.000 € → 100 €
    { thresholdCents: 500000, bonusCents: 25000 },   // 5.000 € → 250 €
    { thresholdCents: 600000, bonusCents: 35000 },   // 6.000 € → 350 €
  ]

  it('null/[] → null', () => {
    assert.equal(selectTierBonus(null, 500000), null)
    assert.equal(selectTierBonus([], 500000), null)
  })

  it('por debajo del primer threshold → null', () => {
    assert.equal(selectTierBonus(tiers, 399999), null)
    assert.equal(selectTierBonus(tiers, 0), null)
  })

  it('justo en el threshold activa el tramo (≥ no >)', () => {
    const t = selectTierBonus(tiers, 400000)
    assert.deepEqual(t, { thresholdCents: 400000, bonusCents: 10000 })
  })

  it('entre tramos activa el inferior (5.500 € → tramo 5k = 250€)', () => {
    const t = selectTierBonus(tiers, 550000)
    assert.deepEqual(t, { thresholdCents: 500000, bonusCents: 25000 })
  })

  it('por encima del último activa el último', () => {
    const t = selectTierBonus(tiers, 999999)
    assert.deepEqual(t, { thresholdCents: 600000, bonusCents: 35000 })
  })

  it('tramos desordenados se ordenan internamente', () => {
    const desordenados: TierBonus[] = [
      { thresholdCents: 600000, bonusCents: 35000 },
      { thresholdCents: 400000, bonusCents: 10000 },
      { thresholdCents: 500000, bonusCents: 25000 },
    ]
    assert.deepEqual(
      selectTierBonus(desordenados, 550000),
      { thresholdCents: 500000, bonusCents: 25000 },
    )
  })

  it('tramo con bonus = 0 es válido (decremento explícito)', () => {
    const t: TierBonus[] = [
      { thresholdCents: 400000, bonusCents: 10000 },
      { thresholdCents: 500000, bonusCents: 0 },
    ]
    assert.deepEqual(selectTierBonus(t, 550000), { thresholdCents: 500000, bonusCents: 0 })
  })

  it('NaN/Infinity en threshold o bonus se filtran', () => {
    const t: TierBonus[] = [
      { thresholdCents: NaN, bonusCents: 10000 },
      { thresholdCents: 400000, bonusCents: NaN },
      { thresholdCents: 500000, bonusCents: 25000 },
    ]
    assert.deepEqual(selectTierBonus(t, 600000), { thresholdCents: 500000, bonusCents: 25000 })
  })
})

// ----------------------------------------------------------------------------
// F1 — computeBarberPayroll con salaried_with_tier_bonus
// ----------------------------------------------------------------------------

describe('computeBarberPayroll — F1 salaried_with_tier_bonus', () => {
  const tiers: TierBonus[] = [
    { thresholdCents: 400000, bonusCents: 10000 },
    { thresholdCents: 500000, bonusCents: 25000 },
    { thresholdCents: 600000, bonusCents: 35000 },
  ]

  it('ejemplo Reni: base 1350€ + facturó 5500€ → bono 250€ → total 1600€', () => {
    const r = computeBarberPayroll(
      profile({
        salaryType: 'salaried_with_tier_bonus',
        salaryBaseCents: 135000,
        tierBonuses: tiers,
      }),
      { ...ZERO_RAW, servicesRevenueCents: 550000 },
    )
    assert.equal(r.facturadoCents, 550000)
    assert.deepEqual(r.tierBonus, { thresholdCents: 500000, bonusCents: 25000 })
    assert.equal(r.totalCents, 135000 + 25000)   // base + tramo 5k
  })

  it('barbero con 0 facturación → bono = 0, base se paga igual', () => {
    const r = computeBarberPayroll(
      profile({
        salaryType: 'salaried_with_tier_bonus',
        salaryBaseCents: 135000,
        tierBonuses: tiers,
      }),
      ZERO_RAW,
    )
    assert.equal(r.facturadoCents, 0)
    assert.equal(r.tierBonus, null)
    assert.equal(r.totalCents, 135000)
  })

  it('tramos vacíos [] → bono = 0 siempre (efectivamente asalariado puro)', () => {
    const r = computeBarberPayroll(
      profile({
        salaryType: 'salaried_with_tier_bonus',
        salaryBaseCents: 135000,
        tierBonuses: [],
      }),
      { ...ZERO_RAW, servicesRevenueCents: 999999 },
    )
    assert.equal(r.tierBonus, null)
    assert.equal(r.totalCents, 135000)
  })

  it('facturación cuenta servicios + productos, NO propinas', () => {
    const r = computeBarberPayroll(
      profile({
        salaryType: 'salaried_with_tier_bonus',
        salaryBaseCents: 135000,
        tierBonuses: tiers,
      }),
      {
        servicesRevenueCents: 350000,
        productsRevenueCents: 60000,    // total facturación = 410.000 → tramo 4k
        tipsCents: 100000,               // las propinas NO suben la facturación
        bonusesPayoutCents: 0,
      },
    )
    assert.equal(r.facturadoCents, 410000)
    assert.deepEqual(r.tierBonus, { thresholdCents: 400000, bonusCents: 10000 })
    // total = base + tips (íntegras) + bono tramo
    assert.equal(r.totalCents, 135000 + 100000 + 10000)
  })

  it('facturó justo debajo del primer tramo → bono = 0', () => {
    const r = computeBarberPayroll(
      profile({
        salaryType: 'salaried_with_tier_bonus',
        salaryBaseCents: 135000,
        tierBonuses: tiers,
      }),
      { ...ZERO_RAW, servicesRevenueCents: 399900 },
    )
    assert.equal(r.tierBonus, null)
    assert.equal(r.totalCents, 135000)
  })

  it('combinado con bonos R9 (por actividades) — son ortogonales y se suman ambos', () => {
    const r = computeBarberPayroll(
      profile({
        salaryType: 'salaried_with_tier_bonus',
        salaryBaseCents: 135000,
        tierBonuses: tiers,
      }),
      {
        servicesRevenueCents: 500000,
        productsRevenueCents: 0,
        tipsCents: 0,
        bonusesPayoutCents: 7000,        // bono R9 por reseñas, p.ej.
      },
    )
    assert.deepEqual(r.tierBonus, { thresholdCents: 500000, bonusCents: 25000 })
    assert.equal(r.bonusesPayoutCents, 7000)
    assert.equal(r.totalCents, 135000 + 25000 + 7000)
  })

  it('los tramos se IGNORAN si salaryType no es salaried_with_tier_bonus', () => {
    // Aunque el perfil tenga tierBonuses por error/legado, si el tipo es
    // 'mixto' (u otro) NO debe aplicar el bono — el motor lo descarta.
    const r = computeBarberPayroll(
      profile({
        salaryType: 'mixto',
        salaryBaseCents: 125000,
        commissionServicesPct: 25,
        tierBonuses: tiers,
      }),
      { ...ZERO_RAW, servicesRevenueCents: 800000 },
    )
    assert.equal(r.tierBonus, null)
    // total = base + comisión servicios, sin tramo
    assert.equal(r.totalCents, 125000 + Math.round(800000 * 0.25))
  })

  it('facturadoCents se rellena incluso cuando salaryType no es F1 (informativo)', () => {
    // El campo informativo facturadoCents debe estar disponible siempre, aunque
    // no se use en el cálculo de tramos cuando el tipo no aplica.
    const r = computeBarberPayroll(
      profile({ salaryType: 'fijo', salaryBaseCents: 125000 }),
      { ...ZERO_RAW, servicesRevenueCents: 300000, productsRevenueCents: 50000 },
    )
    assert.equal(r.facturadoCents, 350000)
    assert.equal(r.tierBonus, null)
  })
})
