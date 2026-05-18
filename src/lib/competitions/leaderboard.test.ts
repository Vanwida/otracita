import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isoWeekStart,
  isoWeekEnd,
  isWeekClosed,
  rankLeaderboard,
  streakBonusFor,
} from './leaderboard.ts'

describe('isoWeekStart / isoWeekEnd', () => {
  it('lunes se queda en sí mismo; domingo retrocede al lunes', () => {
    // 2026-05-18 es lunes.
    assert.equal(isoWeekStart('2026-05-18'), '2026-05-18')
    assert.equal(isoWeekStart('2026-05-24'), '2026-05-18') // domingo
    assert.equal(isoWeekEnd('2026-05-18'), '2026-05-24')
    assert.equal(isoWeekEnd('2026-05-21'), '2026-05-24') // jueves
  })

  it('cruza fin de mes correctamente', () => {
    // 2026-03-01 es domingo → su semana ISO empieza 2026-02-23.
    assert.equal(isoWeekStart('2026-03-01'), '2026-02-23')
    assert.equal(isoWeekEnd('2026-02-23'), '2026-03-01')
  })
})

describe('isWeekClosed', () => {
  it('cerrada solo si hoy > domingo de esa semana', () => {
    assert.equal(isWeekClosed('2026-05-18', '2026-05-24'), false) // mismo domingo
    assert.equal(isWeekClosed('2026-05-18', '2026-05-25'), true) // lunes siguiente
    assert.equal(isWeekClosed('2026-05-18', '2026-05-20'), false) // a media semana
  })
})

describe('rankLeaderboard', () => {
  it('ordena desc y marca 1 ganador zero-sum', () => {
    const { entries, winnerBarberId, winnerValue } = rankLeaderboard([
      { barberId: 'b', barberName: 'Bea', value: 30000 },
      { barberId: 'a', barberName: 'Ana', value: 50000 },
      { barberId: 'c', barberName: 'Cris', value: 10000 },
    ])
    assert.equal(winnerBarberId, 'a')
    assert.equal(winnerValue, 50000)
    assert.equal(entries[0].rank, 1)
    assert.equal(entries[0].isWinner, true)
    assert.equal(entries[1].isWinner, false)
    assert.equal(entries.filter((e) => e.isWinner).length, 1)
  })

  it('empate → desempate determinista por barberId (lexicográfico)', () => {
    const r1 = rankLeaderboard([
      { barberId: 'zoe', barberName: 'Zoe', value: 100 },
      { barberId: 'ana', barberName: 'Ana', value: 100 },
    ])
    assert.equal(r1.winnerBarberId, 'ana')
    // Mismo input en otro orden → mismo ganador (estable para freeze).
    const r2 = rankLeaderboard([
      { barberId: 'ana', barberName: 'Ana', value: 100 },
      { barberId: 'zoe', barberName: 'Zoe', value: 100 },
    ])
    assert.equal(r2.winnerBarberId, 'ana')
  })

  it('semana sin actividad (todo 0) → sin ganador, no se reparte premio', () => {
    const { winnerBarberId, winnerValue, entries } = rankLeaderboard([
      { barberId: 'a', barberName: 'Ana', value: 0 },
      { barberId: 'b', barberName: 'Bea', value: 0 },
    ])
    assert.equal(winnerBarberId, null)
    assert.equal(winnerValue, null)
    assert.equal(entries.every((e) => !e.isWinner), true)
  })

  it('lista vacía → sin ganador', () => {
    const { winnerBarberId, entries } = rankLeaderboard([])
    assert.equal(winnerBarberId, null)
    assert.deepEqual(entries, [])
  })
})

describe('streakBonusFor', () => {
  it('paga si ganó las últimas N consecutivas', () => {
    const bonus = streakBonusFor({
      barberId: 'a',
      recentWinnersDesc: ['a', 'a', 'a', 'a'],
      streakWeeksForBonus: 4,
      streakBonusCents: 10000,
    })
    assert.equal(bonus, 10000)
  })

  it('no paga si un null/otro rompe la racha', () => {
    assert.equal(
      streakBonusFor({
        barberId: 'a',
        recentWinnersDesc: ['a', 'a', null, 'a'],
        streakWeeksForBonus: 4,
        streakBonusCents: 10000,
      }),
      0,
    )
    assert.equal(
      streakBonusFor({
        barberId: 'a',
        recentWinnersDesc: ['a', 'b', 'a', 'a'],
        streakWeeksForBonus: 4,
        streakBonusCents: 10000,
      }),
      0,
    )
  })

  it('no paga si aún no hay N semanas de historial', () => {
    assert.equal(
      streakBonusFor({
        barberId: 'a',
        recentWinnersDesc: ['a', 'a'],
        streakWeeksForBonus: 4,
        streakBonusCents: 10000,
      }),
      0,
    )
  })

  it('streakBonusCents 0 → siempre 0 (racha desactivada)', () => {
    assert.equal(
      streakBonusFor({
        barberId: 'a',
        recentWinnersDesc: ['a', 'a', 'a', 'a'],
        streakWeeksForBonus: 4,
        streakBonusCents: 0,
      }),
      0,
    )
  })
})
