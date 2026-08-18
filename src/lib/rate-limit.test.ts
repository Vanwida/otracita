import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkRateLimit,
  rateLimitResponse,
  __resetRateLimitForTests,
  WINDOW_HOUR_MS,
} from './rate-limit.ts'

// -----------------------------------------------------------------------------
// Pure in-memory limiter — no DB, no I/O, no network.
//
// The bug this file locks down (L-12): the login copy promises "3 códigos por
// hora", but the limiter only ever had a 60-second window, so the same phone
// could pull 3 codes EVERY minute — 180/h. These tests pin the OTP budget to
// a real one-hour window while keeping the per-minute default that the other
// endpoints (verify, availability grid, waitlist) rely on.
// -----------------------------------------------------------------------------

/** The OTP request budget, mirrored from src/app/api/app/otp/request/route.ts. */
const OTP_MAX = 3
const KEY = 'app-otp-req-phone:+34644288663'

function withFakeClock(fn: (tick: (ms: number) => void) => void): void {
  __resetRateLimitForTests()
  mock.timers.enable({ apis: ['Date'], now: 0 })
  try {
    fn((ms) => mock.timers.tick(ms))
  } finally {
    mock.timers.reset()
    __resetRateLimitForTests()
  }
}

test('el 4º código en la misma hora se rechaza con 429', () => {
  withFakeClock(() => {
    for (let i = 1; i <= OTP_MAX; i++) {
      assert.equal(checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS).ok, true, `código ${i}`)
    }

    const fourth = checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)
    assert.equal(fourth.ok, false)
    assert.equal(fourth.remaining, 0)
    assert.equal(rateLimitResponse(fourth).status, 429)
  })
})

test('la ventana NO se reinicia al pasar un minuto (regresión L-12)', () => {
  withFakeClock((tick) => {
    for (let i = 0; i < OTP_MAX; i++) checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)

    // Con la ventana vieja de 60s esto devolvía ok:true y permitía 180 códigos/h.
    tick(61_000)
    assert.equal(checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS).ok, false)

    // Aún bloqueado a falta de un segundo para la hora.
    tick(WINDOW_HOUR_MS - 61_000 - 1_000)
    assert.equal(checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS).ok, false)
  })
})

test('pasada la hora completa se vuelve a permitir', () => {
  withFakeClock((tick) => {
    for (let i = 0; i < OTP_MAX; i++) checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)

    tick(WINDOW_HOUR_MS)
    const fresh = checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)
    assert.equal(fresh.ok, true)
    assert.equal(fresh.remaining, OTP_MAX - 1)
  })
})

test('retryAfter cuenta lo que falta de hora, no de minuto', () => {
  withFakeClock((tick) => {
    for (let i = 0; i < OTP_MAX; i++) checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)

    tick(600_000) // 10 minutos dentro de la ventana
    const blocked = checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)
    assert.equal(blocked.retryAfter, 3_000) // 50 minutos restantes
    assert.equal(rateLimitResponse(blocked).headers.get('Retry-After'), '3000')
  })
})

test('el 429 dice cuántos minutos hay que esperar, no "un momento"', async () => {
  const body = (await rateLimitResponse({ ok: false, retryAfter: 3_000, remaining: 0 }).json()) as {
    error: string
  }
  assert.match(body.error, /50 minutos/)

  const shortBody = (await rateLimitResponse({ ok: false, retryAfter: 12, remaining: 0 }).json()) as {
    error: string
  }
  assert.match(shortBody.error, /un momento/)
})

test('cada teléfono tiene su propio cupo', () => {
  withFakeClock(() => {
    for (let i = 0; i < OTP_MAX; i++) checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS)
    assert.equal(checkRateLimit(KEY, OTP_MAX, WINDOW_HOUR_MS).ok, false)

    const other = 'app-otp-req-phone:+34600000000'
    assert.equal(checkRateLimit(other, OTP_MAX, WINDOW_HOUR_MS).ok, true)
  })
})

test('sin windowMs la ventana sigue siendo de un minuto (verify, grid, waitlist)', () => {
  withFakeClock((tick) => {
    const key = 'app-otp-verify:1.2.3.4'
    assert.equal(checkRateLimit(key, 1).ok, true)
    assert.equal(checkRateLimit(key, 1).ok, false)

    tick(60_000)
    assert.equal(checkRateLimit(key, 1).ok, true)
  })
})
