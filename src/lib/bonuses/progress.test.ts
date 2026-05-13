import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeBonusProgress, formatBonusValue } from './progress.ts'

describe('computeBonusProgress', () => {
  it('idle si no hay entries', () => {
    const r = computeBonusProgress({ unit: 'units', target: 20, rewardCents: 5000, entries: [] })
    assert.equal(r.progress, 0)
    assert.equal(r.status, 'idle')
    assert.equal(r.payoutCents, 0)
    assert.equal(r.pct, 0)
  })

  it('pending si suma < target', () => {
    const r = computeBonusProgress({ unit: 'units', target: 20, rewardCents: 5000, entries: [3, 2, 5] })
    assert.equal(r.progress, 10)
    assert.equal(r.status, 'pending')
    assert.equal(r.payoutCents, 0)
    assert.equal(r.pct, 50)
  })

  it('reached si suma >= target → paga reward completo', () => {
    const r = computeBonusProgress({ unit: 'units', target: 20, rewardCents: 5000, entries: [10, 12] })
    assert.equal(r.progress, 22)
    assert.equal(r.status, 'reached')
    assert.equal(r.payoutCents, 5000)
    assert.equal(r.pct, 100)
  })

  it('pct se capa a 100 aunque te pases mucho', () => {
    const r = computeBonusProgress({ unit: 'units', target: 10, rewardCents: 1000, entries: [50] })
    assert.equal(r.pct, 100)
  })

  it('unit=euros — values en cents, target en cents', () => {
    // Objetivo: 300€ vendidos → 30000 cents. Entries en cents.
    const r = computeBonusProgress({
      unit: 'euros',
      target: 30000,
      rewardCents: 3000,
      entries: [12000, 8000, 15000], // 350€ total
    })
    assert.equal(r.progress, 35000)
    assert.equal(r.status, 'reached')
    assert.equal(r.payoutCents, 3000)
  })

  it('target=0 — no se divide entre cero, pct=0', () => {
    const r = computeBonusProgress({ unit: 'units', target: 0, rewardCents: 0, entries: [5] })
    assert.equal(r.pct, 0)
    // Pero como progress > target (5 > 0), técnicamente está reached. Defensivo.
    assert.equal(r.status, 'reached')
  })
})

describe('formatBonusValue', () => {
  it('units → string plano', () => {
    assert.equal(formatBonusValue(20, 'units'), '20')
    assert.equal(formatBonusValue(1234, 'units'), '1234')
  })

  it('euros → cents a "12,34 €"', () => {
    assert.equal(formatBonusValue(1234, 'euros'), '12,34 €')
    assert.equal(formatBonusValue(50000, 'euros'), '500 €')
  })

  it('euros con cero decimales no muestra ,00', () => {
    assert.equal(formatBonusValue(5000, 'euros'), '50 €')
  })
})
