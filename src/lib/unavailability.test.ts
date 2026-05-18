import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  unavailabilityIntervals,
  weekdayForDate,
  unavailabilityFor,
  type BarberUnavailability,
} from './unavailability.ts'

// -----------------------------------------------------------------------------
// unavailabilityIntervals — the pure interval math the availability engine
// subtracts from a barber's open window. The most important test here is the
// NO-REGRESSION one: a barber with zero breaks/blocks must yield ZERO extra
// intervals, so the existing slot loop behaves byte-for-byte as before this
// feature (the `hours` parser was never touched).
// -----------------------------------------------------------------------------

const EMPTY: BarberUnavailability = { breaks: [], blocks: [] }

// 2026-05-18 is a Monday → getUTCDay() === 1.
const MON = '2026-05-18'
const TUE = '2026-05-19'

describe('weekdayForDate', () => {
  it('matches getUTCDay convention used by hoursForDate', () => {
    assert.equal(weekdayForDate('2026-05-17'), 0) // Sunday
    assert.equal(weekdayForDate(MON), 1) // Monday
    assert.equal(weekdayForDate('2026-05-23'), 6) // Saturday
  })
})

describe('unavailabilityIntervals — no-regression (the load-bearing case)', () => {
  it('a barber with NO breaks and NO blocks produces ZERO intervals', () => {
    const open = [9 * 60, 20 * 60] as const
    assert.deepEqual(
      unavailabilityIntervals(MON, open[0], open[1], EMPTY),
      [],
      'empty unavailability MUST be a no-op so legacy hours-only barbers keep identical slots',
    )
  })

  it('unavailabilityFor returns the shared EMPTY for an unknown barber', () => {
    const map = new Map<string, BarberUnavailability>()
    assert.deepEqual(unavailabilityFor(map, 'nope'), EMPTY)
    // And that empty value is a no-op.
    assert.deepEqual(
      unavailabilityIntervals(MON, 600, 1200, unavailabilityFor(map, 'nope')),
      [],
    )
  })

  it('returns [] when the open window is empty / inverted', () => {
    const u: BarberUnavailability = {
      breaks: [{ weekday: 1, start: '13:00', end: '14:00' }],
      blocks: [],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 800, 800, u), [])
    assert.deepEqual(unavailabilityIntervals(MON, 900, 600, u), [])
  })
})

describe('unavailabilityIntervals — recurring breaks (R12)', () => {
  const lunchEveryMonday: BarberUnavailability = {
    breaks: [{ weekday: 1, start: '13:00', end: '14:00' }],
    blocks: [],
  }

  it('applies a recurring break only on its weekday', () => {
    assert.deepEqual(
      unavailabilityIntervals(MON, 9 * 60, 20 * 60, lunchEveryMonday),
      [{ start: 13 * 60, end: 14 * 60 }],
    )
    // Tuesday → no Monday break.
    assert.deepEqual(
      unavailabilityIntervals(TUE, 9 * 60, 20 * 60, lunchEveryMonday),
      [],
    )
  })

  it('clamps a break to the open window', () => {
    const u: BarberUnavailability = {
      breaks: [{ weekday: 1, start: '08:00', end: '10:00' }],
      blocks: [],
    }
    // Open 09:00 → break clamped to 09:00-10:00.
    assert.deepEqual(
      unavailabilityIntervals(MON, 9 * 60, 20 * 60, u),
      [{ start: 9 * 60, end: 10 * 60 }],
    )
  })

  it('drops a break entirely outside the open window', () => {
    const u: BarberUnavailability = {
      breaks: [{ weekday: 1, start: '21:00', end: '22:00' }],
      blocks: [],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 9 * 60, 20 * 60, u), [])
  })

  it('supports multiple breaks on the same day', () => {
    const u: BarberUnavailability = {
      breaks: [
        { weekday: 1, start: '13:00', end: '14:00' },
        { weekday: 1, start: '17:00', end: '17:15' },
      ],
      blocks: [],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 9 * 60, 20 * 60, u), [
      { start: 13 * 60, end: 14 * 60 },
      { start: 17 * 60, end: 17 * 60 + 15 },
    ])
  })
})

describe('unavailabilityIntervals — ad-hoc blocks & absences (R2)', () => {
  it('a partial block removes just its range (falta de disponibilidad)', () => {
    const u: BarberUnavailability = {
      breaks: [],
      blocks: [{ start: '16:00', end: '16:15' }],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 9 * 60, 20 * 60, u), [
      { start: 16 * 60, end: 16 * 60 + 15 },
    ])
  })

  it('a full-day absence (null/null) removes the ENTIRE open window', () => {
    const u: BarberUnavailability = {
      breaks: [],
      blocks: [{ start: null, end: null }],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 9 * 60, 20 * 60, u), [
      { start: 9 * 60, end: 20 * 60 },
    ])
  })

  it('combines recurring breaks and ad-hoc blocks', () => {
    const u: BarberUnavailability = {
      breaks: [{ weekday: 1, start: '13:00', end: '14:00' }],
      blocks: [{ start: '10:00', end: '10:30' }],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 9 * 60, 20 * 60, u), [
      { start: 13 * 60, end: 14 * 60 },
      { start: 10 * 60, end: 10 * 60 + 30 },
    ])
  })

  it('clamps an over-wide block to the open window', () => {
    const u: BarberUnavailability = {
      breaks: [],
      blocks: [{ start: '06:00', end: '23:00' }],
    }
    assert.deepEqual(unavailabilityIntervals(MON, 9 * 60, 20 * 60, u), [
      { start: 9 * 60, end: 20 * 60 },
    ])
  })
})
