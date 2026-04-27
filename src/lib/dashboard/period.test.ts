import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PERIOD_OPTIONS,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
} from './period.ts'

// Now fijo para tests deterministas: 15 de junio de 2026, 14:30.
const NOW = new Date(2026, 5, 15, 14, 30, 0)

test('PERIOD_OPTIONS contains the expected keys in order', () => {
  assert.deepEqual(
    PERIOD_OPTIONS.map((p) => p.key),
    ['day', 'week', 'month', 'year', 'lifetime'],
  )
})

test('resolvePeriod returns the value when valid, fallback otherwise', () => {
  assert.equal(resolvePeriod('week', 'lifetime'), 'week')
  assert.equal(resolvePeriod(undefined, 'month'), 'month')
  assert.equal(resolvePeriod('garbage', 'day'), 'day')
  assert.equal(resolvePeriod('year', 'lifetime'), 'year')
})

test('getPeriodStart returns null only for lifetime', () => {
  assert.equal(getPeriodStart('lifetime', NOW), null)
  assert.notEqual(getPeriodStart('day', NOW), null)
  assert.notEqual(getPeriodStart('week', NOW), null)
  assert.notEqual(getPeriodStart('month', NOW), null)
  assert.notEqual(getPeriodStart('year', NOW), null)
})

test('getPeriodStart for day returns today at 00:00', () => {
  const start = getPeriodStart('day', NOW)!
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 5)
  assert.equal(start.getDate(), 15)
  assert.equal(start.getHours(), 0)
})

test('getPeriodStart for month returns 1st of current month', () => {
  const start = getPeriodStart('month', NOW)!
  assert.equal(start.getDate(), 1)
  assert.equal(start.getMonth(), 5) // junio
  assert.equal(start.getFullYear(), 2026)
})

test('getPeriodStart for year returns 1-jan of current year', () => {
  const start = getPeriodStart('year', NOW)!
  assert.equal(start.getDate(), 1)
  assert.equal(start.getMonth(), 0)
  assert.equal(start.getFullYear(), 2026)
})

test('getPreviousPeriod returns null for lifetime or null start', () => {
  assert.equal(getPreviousPeriod('lifetime', null, NOW), null)
  assert.equal(getPreviousPeriod('day', null, NOW), null)
})

test('getPreviousPeriod for month returns the full previous month', () => {
  const start = getPeriodStart('month', NOW)!
  const prev = getPreviousPeriod('month', start, NOW)!
  assert.equal(prev.startIso, '2026-05-01')
  assert.equal(prev.endIso, '2026-06-01')
})

test('getPreviousPeriod for year returns the full previous year', () => {
  const start = getPeriodStart('year', NOW)!
  const prev = getPreviousPeriod('year', start, NOW)!
  assert.equal(prev.startIso, '2025-01-01')
  assert.equal(prev.endIso, '2026-01-01')
})

test('getPreviousPeriod for week is the week before [-14d, -7d]', () => {
  const start = getPeriodStart('week', NOW)!
  const prev = getPreviousPeriod('week', start, NOW)!
  // start = NOW - 7d, prevEnd = NOW - 7d, prevStart = NOW - 14d
  // diff prevEnd - prevStart = 7 días en milisegundos.
  const diffMs = prev.endDate.getTime() - prev.startDate.getTime()
  assert.equal(diffMs, 7 * 24 * 60 * 60 * 1000)
})
