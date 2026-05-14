import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeBarberPayroll, isProfileConfigured } from './compute.ts'
import type { BarberMonthRaw, BarberSalaryProfile } from './types.ts'

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
})
