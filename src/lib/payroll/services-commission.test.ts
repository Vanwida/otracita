import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeServicesCommissionCents } from './services-commission.ts'

describe('computeServicesCommissionCents — no-regresión sin overrides', () => {
  it('sin overrides ≡ revenue total × globalPct (idéntico al camino viejo)', () => {
    // 2.000€ corte + 500€ barba = 2.500€; 25% global = 625€
    const r = computeServicesCommissionCents({
      rows: [
        { serviceName: 'Corte', revenueCents: 200000 },
        { serviceName: 'Barba', revenueCents: 50000 },
      ],
      overrides: [],
      globalPct: 25,
    })
    assert.equal(r, 62500)
    // Equivale a round(250000 * 0.25), el cálculo histórico de compute.ts.
    assert.equal(r, Math.round(250000 * (25 / 100)))
  })

  it('sin filas → 0', () => {
    assert.equal(
      computeServicesCommissionCents({ rows: [], overrides: [], globalPct: 50 }),
      0,
    )
  })
})

describe('computeServicesCommissionCents — overrides por-servicio', () => {
  it('aplica el override solo al servicio con override, global al resto', () => {
    // Corte 2.000€ @ 50% override = 1.000€
    // Barba   500€ @ 25% global   =   125€  → total 1.125€
    const r = computeServicesCommissionCents({
      rows: [
        { serviceName: 'Corte', revenueCents: 200000 },
        { serviceName: 'Barba', revenueCents: 50000 },
      ],
      overrides: [{ serviceName: 'Corte', pct: 50 }],
      globalPct: 25,
    })
    assert.equal(r, 100000 + 12500)
  })

  it('match de nombre case-insensitive + trim', () => {
    const r = computeServicesCommissionCents({
      rows: [{ serviceName: '  Corte de Pelo ', revenueCents: 100000 }],
      overrides: [{ serviceName: 'corte de pelo', pct: 40 }],
      globalPct: 10,
    })
    assert.equal(r, 40000)
  })

  it('override 0% es un override válido (no cae al global)', () => {
    const r = computeServicesCommissionCents({
      rows: [{ serviceName: 'Cortesía', revenueCents: 100000 }],
      overrides: [{ serviceName: 'Cortesía', pct: 0 }],
      globalPct: 50,
    })
    assert.equal(r, 0)
  })

  it('% fuera de rango se capa a [0,100] (global y override)', () => {
    const r = computeServicesCommissionCents({
      rows: [
        { serviceName: 'A', revenueCents: 100000 },
        { serviceName: 'B', revenueCents: 100000 },
      ],
      overrides: [{ serviceName: 'A', pct: 150 }],
      globalPct: -10,
    })
    // A → 100% de 1.000€ = 1.000€ ; B → 0% = 0
    assert.equal(r, 100000)
  })
})
