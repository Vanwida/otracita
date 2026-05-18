import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeBookingSnapshot,
  sanitizeExtraServices,
  type BookingServiceLine,
} from './duration.ts'

// -----------------------------------------------------------------------------
// computeBookingSnapshot — el invariante crítico es que `bookings.duration`
// SNAPSHOT = principal + suma(extras), porque alimenta el chequeo de solape.
// -----------------------------------------------------------------------------

test('sin extras → duración == principal (no-regresión: 4/5 callers)', () => {
  assert.deepEqual(computeBookingSnapshot(30), { durationMin: 30 })
  assert.deepEqual(computeBookingSnapshot(30, undefined), { durationMin: 30 })
  assert.deepEqual(computeBookingSnapshot(30, null), { durationMin: 30 })
  assert.deepEqual(computeBookingSnapshot(45, []), { durationMin: 45 })
})

test('multi-servicio → duración == suma (evita doble-booking)', () => {
  const extras: BookingServiceLine[] = [
    { name: 'Barba', durationMin: 20, priceEuros: 10 },
    { name: 'Cejas', durationMin: 10, priceEuros: 5 },
  ]
  // Corte 30 + Barba 20 + Cejas 10 = 60 → el motor reserva 60 min, no 30.
  assert.equal(computeBookingSnapshot(30, extras).durationMin, 60)
})

test('extra a medio rellenar (duración <= 0) no envenena el snapshot', () => {
  const extras: BookingServiceLine[] = [
    { name: 'Barba', durationMin: 20, priceEuros: 10 },
    { name: '', durationMin: 0, priceEuros: null },
  ]
  assert.equal(computeBookingSnapshot(30, extras).durationMin, 50)
})

test('principal inválido se trata como 0, no NaN', () => {
  assert.equal(computeBookingSnapshot(Number.NaN).durationMin, 0)
  assert.equal(
    computeBookingSnapshot(Number.NaN, [{ name: 'X', durationMin: 15, priceEuros: null }])
      .durationMin,
    15,
  )
})

// -----------------------------------------------------------------------------
// sanitizeExtraServices — no confiar en el body crudo del caller.
// -----------------------------------------------------------------------------

test('descarta entradas sin nombre o sin duración válida', () => {
  const out = sanitizeExtraServices([
    { name: 'Barba', durationMin: 20, priceEuros: 10 },
    { name: '   ', durationMin: 30, priceEuros: 5 }, // nombre vacío → fuera
    { name: 'Mascarilla', durationMin: 0, priceEuros: 8 }, // dur 0 → fuera
    { name: 'Lavado', durationMin: -5, priceEuros: 3 }, // dur negativa → fuera
    'basura',
    null,
  ])
  assert.deepEqual(out, [{ name: 'Barba', durationMin: 20, priceEuros: 10 }])
})

test('precio ausente/negativo → null (extra de cortesía permitido)', () => {
  const out = sanitizeExtraServices([
    { name: 'Cortesía', durationMin: 10 },
    { name: 'NegPrice', durationMin: 10, priceEuros: -2 },
  ])
  assert.deepEqual(out, [
    { name: 'Cortesía', durationMin: 10, priceEuros: null },
    { name: 'NegPrice', durationMin: 10, priceEuros: null },
  ])
})

test('no-array → []', () => {
  assert.deepEqual(sanitizeExtraServices(undefined), [])
  assert.deepEqual(sanitizeExtraServices(null), [])
  assert.deepEqual(sanitizeExtraServices('x'), [])
})
