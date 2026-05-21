import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PERIOD_OPTIONS,
  resolvePeriod,
  getPeriodStart,
  getPeriodEnd,
  getPreviousPeriod,
  parseIsoDate,
  toLocalIso,
  resolvePeriodSelection,
} from './period.ts'

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
  assert.equal(resolvePeriod('range', 'month'), 'range')
})

test('parseIsoDate accepts YYYY-MM-DD and rejects malformed input', () => {
  const ok = parseIsoDate('2026-05-21')!
  assert.equal(ok.getFullYear(), 2026)
  assert.equal(ok.getMonth(), 4)
  assert.equal(ok.getDate(), 21)
  assert.equal(parseIsoDate(undefined), null)
  assert.equal(parseIsoDate(''), null)
  assert.equal(parseIsoDate('21/05/2026'), null)
  assert.equal(parseIsoDate('2026-13-01'), null)
  assert.equal(parseIsoDate('2026-02-30'), null)
})

test('getPeriodStart returns null only for lifetime / invalid range', () => {
  assert.equal(getPeriodStart('lifetime', NOW), null)
  assert.notEqual(getPeriodStart('day', NOW), null)
  assert.notEqual(getPeriodStart('week', NOW), null)
  assert.notEqual(getPeriodStart('month', NOW), null)
  assert.notEqual(getPeriodStart('year', NOW), null)
  assert.equal(getPeriodStart('range', NOW, {}), null)
})

test('getPeriodStart for day returns selected day at 00:00 or today', () => {
  const today = getPeriodStart('day', NOW)!
  assert.equal(today.getDate(), 15)
  const picked = getPeriodStart('day', NOW, { date: new Date(2026, 4, 3) })!
  assert.equal(picked.getMonth(), 4)
  assert.equal(picked.getDate(), 3)
})

test('getPeriodStart for month returns 1st of current month', () => {
  const start = getPeriodStart('month', NOW)!
  assert.equal(start.getDate(), 1)
  assert.equal(start.getMonth(), 5)
})

test('getPeriodStart for year returns 1-jan of current year', () => {
  const start = getPeriodStart('year', NOW)!
  assert.equal(start.getDate(), 1)
  assert.equal(start.getMonth(), 0)
})

test('getPeriodStart for range uses the provided start date at 00:00', () => {
  const start = getPeriodStart('range', NOW, {
    start: new Date(2026, 3, 1),
    end: new Date(2026, 3, 30),
  })!
  assert.equal(start.getMonth(), 3)
  assert.equal(start.getDate(), 1)
})

test('getPeriodEnd is exclusive (next day after the period last day)', () => {
  const dayEnd = getPeriodEnd('day', NOW, { date: new Date(2026, 4, 3) })!
  assert.equal(toLocalIso(dayEnd), '2026-05-04')
  const rangeEnd = getPeriodEnd('range', NOW, {
    start: new Date(2026, 3, 1),
    end: new Date(2026, 3, 30),
  })!
  assert.equal(toLocalIso(rangeEnd), '2026-05-01')
  assert.equal(toLocalIso(getPeriodEnd('month', NOW)!), '2026-06-16')
  assert.equal(getPeriodEnd('lifetime', NOW), null)
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
  const diffMs = prev.endDate.getTime() - prev.startDate.getTime()
  assert.equal(diffMs, 7 * 24 * 60 * 60 * 1000)
})

test('getPreviousPeriod for day uses the selected day (no aliasing to today)', () => {
  const date = new Date(2026, 4, 3)
  const start = getPeriodStart('day', NOW, { date })!
  const prev = getPreviousPeriod('day', start, NOW, { date })!
  assert.equal(prev.startIso, '2026-05-02')
  assert.equal(prev.endIso, '2026-05-03')
})

test('getPreviousPeriod for range returns a same-size block immediately before', () => {
  const params = {
    start: new Date(2026, 3, 1),
    end: new Date(2026, 3, 7),
  }
  const start = getPeriodStart('range', NOW, params)!
  const prev = getPreviousPeriod('range', start, NOW, params)!
  assert.equal(prev.startIso, '2026-03-25')
  assert.equal(prev.endIso, '2026-04-01')
})

test('resolvePeriodSelection — defaults to fallback when no params', () => {
  const sel = resolvePeriodSelection({}, NOW, 'month')
  assert.equal(sel.period, 'month')
  assert.equal(sel.periodStartIso, '2026-06-01')
  assert.equal(sel.periodEndIso, '2026-06-16')
  assert.equal(sel.periodLabel, 'mes')
})

test('resolvePeriodSelection — day with explicit date', () => {
  const sel = resolvePeriodSelection({ period: 'day', date: '2026-05-03' }, NOW)
  assert.equal(sel.period, 'day')
  assert.equal(sel.periodStartIso, '2026-05-03')
  assert.equal(sel.periodEndIso, '2026-05-04')
})

test('resolvePeriodSelection — range with start and end', () => {
  const sel = resolvePeriodSelection(
    { period: 'range', start: '2026-05-01', end: '2026-05-15' },
    NOW,
  )
  assert.equal(sel.period, 'range')
  assert.equal(sel.periodStartIso, '2026-05-01')
  assert.equal(sel.periodEndIso, '2026-05-16')
  assert.equal(sel.periodLabel, 'rango')
})

test('resolvePeriodSelection — range with end<start swaps automatically', () => {
  const sel = resolvePeriodSelection(
    { period: 'range', start: '2026-05-15', end: '2026-05-01' },
    NOW,
  )
  assert.equal(sel.periodStartIso, '2026-05-01')
  assert.equal(sel.periodEndIso, '2026-05-16')
})

test('resolvePeriodSelection — range with missing end returns null bounds', () => {
  const sel = resolvePeriodSelection(
    { period: 'range', start: '2026-05-01' },
    NOW,
  )
  assert.equal(sel.period, 'range')
  assert.equal(sel.periodStartIso, '2026-05-01')
  assert.equal(sel.periodEndIso, null)
})

test('resolvePeriodSelection — lifetime never has date bounds', () => {
  const sel = resolvePeriodSelection({ period: 'lifetime' }, NOW)
  assert.equal(sel.period, 'lifetime')
  assert.equal(sel.periodStartIso, null)
  assert.equal(sel.periodEndIso, null)
})
