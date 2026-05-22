import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeBarberPayroll } from './compute.ts'
import type { BarberMonthRaw, BarberSalaryProfile } from './types.ts'

// -----------------------------------------------------------------------------
// Tests del split CASH vs CARD en propinas a nivel motor de payroll mensual.
//
// El motor agrega propinas por barbero usando un FILTER (WHERE payment_method
// = 'cash') en monthly.ts L204-211 y entrega dos sub-totales a compute.ts vía
// `tipsCashCents` + `tipsCardCents`. La regla de liquidación:
//
//   · CASH: el barbero YA cobró en mano al cliente (self-liquidated). NO
//     entra al `totalCents` de nómina. Informativo solamente.
//   · CARD: el barbero NO cobró aún (el dinero está en la cuenta del local
//     vía Stripe/SumUp). SÍ entra al `totalCents` — el local lo paga vía
//     nómina al final del mes.
//   · NULL (legacy pre-V1): cuenta como CARD implícito. Esto es importante
//     porque hay datos histórico-Stripe-Checkout donde paymentMethod ya
//     estaba NULL antes de la migración del split.
//
// Estos tests COMPLEMENTAN compute.test.ts (que cubre normalización del
// raw): aquí simulamos los escenarios que el frontend ve realmente — 3 tips
// mixtos del mes para un barbero, etc — y comprobamos que la nómina suma
// solo lo que corresponde.
// -----------------------------------------------------------------------------

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

const ZERO_RAW: BarberMonthRaw = {
  servicesRevenueCents: 0,
  productsRevenueCents: 0,
  tipsCents: 0,
  bonusesPayoutCents: 0,
}

// Helper: simula lo que monthly.ts produce tras agregar N propinas con sus
// métodos. Devuelve el BarberMonthRaw que compute.ts recibe.
function aggregateTips(
  tipsInDb: Array<{ amountCents: number; paymentMethod: 'cash' | 'card' | null }>,
): {
  tipsCents: number
  tipsCashCents: number
  tipsCardCents: number
} {
  let tipsCents = 0
  let tipsCashCents = 0
  let tipsCardCents = 0
  for (const t of tipsInDb) {
    tipsCents += t.amountCents
    // Mismo predicado que el SQL FILTER en monthly.ts: 'cash' explícito → cash;
    // 'card' o NULL → card (legacy implícito).
    if (t.paymentMethod === 'cash') {
      tipsCashCents += t.amountCents
    } else {
      tipsCardCents += t.amountCents
    }
  }
  return { tipsCents, tipsCashCents, tipsCardCents }
}

describe('payroll-tips — Tip cash único', () => {
  it('un solo tip cash de 10€ → tipsCashCents=1000, tipsCardCents=0, NO suma al total', () => {
    const agg = aggregateTips([{ amountCents: 1000, paymentMethod: 'cash' }])
    assert.equal(agg.tipsCashCents, 1000)
    assert.equal(agg.tipsCardCents, 0)

    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000 }),
      { ...ZERO_RAW, ...agg },
    )
    assert.equal(r.tipsCashCents, 1000)
    assert.equal(r.tipsCardCents, 0)
    // El barbero ya tiene los 10€ cash en mano. La nómina solo paga la base.
    assert.equal(r.totalCents, 125000)
  })
})

describe('payroll-tips — Tip card único', () => {
  it('un solo tip card de 10€ → tipsCardCents=1000, SÍ suma al total', () => {
    const agg = aggregateTips([{ amountCents: 1000, paymentMethod: 'card' }])
    assert.equal(agg.tipsCashCents, 0)
    assert.equal(agg.tipsCardCents, 1000)

    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000 }),
      { ...ZERO_RAW, ...agg },
    )
    assert.equal(r.tipsCashCents, 0)
    assert.equal(r.tipsCardCents, 1000)
    // El barbero NO ha cobrado los 10€ aún → entran en la nómina.
    assert.equal(r.totalCents, 125000 + 1000)
  })
})

describe('payroll-tips — Tip legacy (paymentMethod NULL)', () => {
  it('tip NULL cuenta como card implícito (data histórica pre-split = Stripe Checkout)', () => {
    // El COALESCE(payment_method, 'card') del SQL FILTER en monthly.ts
    // garantiza que filas sin método explícito entren como card. Sin esto
    // un barbero perdería todas sus propinas históricas de un golpe en la
    // siguiente nómina post-migración.
    const agg = aggregateTips([{ amountCents: 1500, paymentMethod: null }])
    assert.equal(agg.tipsCashCents, 0)
    assert.equal(agg.tipsCardCents, 1500)

    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000 }),
      { ...ZERO_RAW, ...agg },
    )
    assert.equal(r.tipsCardCents, 1500)
    assert.equal(r.totalCents, 125000 + 1500)
  })
})

describe('payroll-tips — Mix realista (cash + card + null)', () => {
  it('3 tips del mes: 10€ cash + 5€ card + 8€ null → cash=1000, card=1300, total suma solo card+null', () => {
    // Escenario del mes de Reni:
    //   · Cliente A: 10 € cash directo (Bizum-bolsillo, dejó cambio, etc).
    //   · Cliente B: 5 € card vía PWA Stripe Checkout.
    //   · Cliente C: 8 € sin método (legacy fila pre-split).
    // tipsCashCents = 1000 (10€). tipsCardCents = 1300 (5€ + 8€).
    // El barbero ya tiene los 10€ en mano; la nómina paga base + 1300.
    const agg = aggregateTips([
      { amountCents: 1000, paymentMethod: 'cash' },
      { amountCents: 500, paymentMethod: 'card' },
      { amountCents: 800, paymentMethod: null },
    ])
    assert.equal(agg.tipsCents, 2300)
    assert.equal(agg.tipsCashCents, 1000)
    assert.equal(agg.tipsCardCents, 1300)

    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000 }),
      { ...ZERO_RAW, ...agg },
    )
    assert.equal(r.tipsCents, 2300) // informativo
    assert.equal(r.tipsCashCents, 1000)
    assert.equal(r.tipsCardCents, 1300)
    // Total: base + card (cash NO suma porque ya está en el bolsillo).
    assert.equal(r.totalCents, 125000 + 1300)
  })

  it('mix sin tips → total = base (no rompe el caso degenerate)', () => {
    const agg = aggregateTips([])
    assert.equal(agg.tipsCashCents, 0)
    assert.equal(agg.tipsCardCents, 0)

    const r = computeBarberPayroll(
      profile({ salaryBaseCents: 125000 }),
      { ...ZERO_RAW, ...agg },
    )
    assert.equal(r.totalCents, 125000)
  })
})

describe('payroll-tips — interacción con motor completo (base + comisiones + bonos + cash)', () => {
  it('escenario realista Reni: base + comisión + propinas mixtas + bono R9', () => {
    // Mes típico:
    //   · 1350 € base.
    //   · 25% comisión sobre 2160 € facturados = 540 €.
    //   · 40 € tips cash + 15 € tips card (de Stripe).
    //   · 70 € bono R9 (reseñas).
    // Cash NO entra al total. Esperamos: 1350 + 540 + 15 + 70 = 1975 €.
    const agg = aggregateTips([
      { amountCents: 4000, paymentMethod: 'cash' },
      { amountCents: 1500, paymentMethod: 'card' },
    ])
    const r = computeBarberPayroll(
      profile({
        salaryType: 'mixto',
        salaryBaseCents: 135000,
        commissionServicesPct: 25,
      }),
      {
        servicesRevenueCents: 216000,
        productsRevenueCents: 0,
        ...agg,
        bonusesPayoutCents: 7000,
      },
    )
    assert.equal(r.commissionServicesCents, 54000)
    assert.equal(r.tipsCashCents, 4000)
    assert.equal(r.tipsCardCents, 1500)
    assert.equal(r.totalCents, 135000 + 54000 + 1500 + 7000)
  })
})
