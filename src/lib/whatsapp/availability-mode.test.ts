import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canServeBookingFlow } from './availability-mode.ts'

// -----------------------------------------------------------------------------
// L-01 — regresión: un alta por wizard (sin google_calendar_id) tiene que poder
// entrar al flujo de reserva. Antes el engine solo miraba googleCalendarId, así
// que esos tenants caían en "integración con calendario en proceso" y, si
// llegaban a elegir día, en "Error interno".
// -----------------------------------------------------------------------------

describe('canServeBookingFlow', () => {
  it('alta por wizard (flag DB, sin GCal) → sirve el flujo', () => {
    assert.equal(canServeBookingFlow({ useDbAvailability: true }), true)
  })

  it('tenant legacy (GCal, sin flag) → sigue sirviendo el flujo', () => {
    assert.equal(
      canServeBookingFlow({ useDbAvailability: false, googleCalendarId: 'cal@group.calendar.google.com' }),
      true,
    )
  })

  it('flag DB + GCal → sirve (el flag manda río abajo)', () => {
    assert.equal(
      canServeBookingFlow({ useDbAvailability: true, googleCalendarId: 'cal@group.calendar.google.com' }),
      true,
    )
  })

  it('sin flag y sin GCal → no puede servir', () => {
    assert.equal(canServeBookingFlow({ useDbAvailability: false }), false)
  })

  it('googleCalendarId vacío no cuenta como calendario', () => {
    assert.equal(canServeBookingFlow({ useDbAvailability: false, googleCalendarId: '' }), false)
  })
})
