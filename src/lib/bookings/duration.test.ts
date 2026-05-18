import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeBookingSnapshot,
  sanitizeExtraServices,
  hasBookingOverlap,
  hhmmToMinutes,
  type BookingServiceLine,
  type OverlapBooking,
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

// -----------------------------------------------------------------------------
// hasBookingOverlap — el bug que el cold review encontró: editar una cita
// (A3) recalcula la duración pero hay que re-validar solape o se acepta un
// doble-booking en silencio.
// -----------------------------------------------------------------------------

const BARBER_A = 'b-aaaa'

/** Cita existente a las 11:00, 30 min, barbero A. */
const next1130: OverlapBooking = {
  id: 'next',
  time: '11:30',
  duration: 30, // 11:30–12:00
  barberId: BARBER_A,
  barber: 'Dani',
  status: 'confirmed',
}

test('editar extiende duración → pisa la siguiente cita → solape detectado', () => {
  // Cita propia 11:00, originalmente 30 min (acababa 11:30, justo antes de
  // la de las 11:30). Se edita a 60 min → 11:00–12:00 → pisa next1130.
  const clash = hasBookingOverlap(
    {
      selfId: 'self',
      startMinutes: hhmmToMinutes('11:00'),
      durationMin: 60,
      barberId: BARBER_A,
      barber: 'Dani',
    },
    [next1130],
    0, // sin buffer
  )
  assert.equal(clash, true)
})

test('editar SIN extender de más → no pisa (30 min cabe antes de 11:30)', () => {
  const clash = hasBookingOverlap(
    {
      selfId: 'self',
      startMinutes: hhmmToMinutes('11:00'),
      durationMin: 30, // 11:00–11:30, justo hasta el inicio de la otra
      barberId: BARBER_A,
      barber: 'Dani',
    },
    [next1130],
    0,
  )
  assert.equal(clash, false)
})

test('buffer del cliente empuja el final de la existente → solape', () => {
  // next1130 ocupa 11:30–12:00; con buffer 15 min su fin efectivo es 12:15.
  // Una cita 12:00–12:10 NO solaparía sin buffer, pero CON buffer sí.
  const clash = hasBookingOverlap(
    {
      selfId: 'self',
      startMinutes: hhmmToMinutes('12:00'),
      durationMin: 10,
      barberId: BARBER_A,
      barber: 'Dani',
    },
    [next1130],
    15,
  )
  assert.equal(clash, true)
})

test('excluye la propia cita (selfId) y las canceladas', () => {
  const self: OverlapBooking = { ...next1130, id: 'self', status: 'confirmed' }
  const cancelled: OverlapBooking = {
    ...next1130,
    id: 'x',
    status: 'cancelled',
  }
  const clash = hasBookingOverlap(
    {
      selfId: 'self',
      startMinutes: hhmmToMinutes('11:00'),
      durationMin: 120, // solaparía con self y cancelled si contaran
      barberId: BARBER_A,
      barber: 'Dani',
    },
    [self, cancelled],
    0,
  )
  assert.equal(clash, false)
})

test('otro barbero no cuenta como solape', () => {
  const clash = hasBookingOverlap(
    {
      selfId: 'self',
      startMinutes: hhmmToMinutes('11:00'),
      durationMin: 120,
      barberId: 'b-bbbb',
      barber: 'Pablo',
    },
    [next1130],
    0,
  )
  assert.equal(clash, false)
})

test('match por NOMBRE cuando barberId es null (filas legacy)', () => {
  const legacy: OverlapBooking = {
    id: 'legacy',
    time: '11:30',
    duration: 30,
    barberId: null, // fila antigua sin id
    barber: 'Dani',
    status: 'confirmed',
  }
  const clash = hasBookingOverlap(
    {
      selfId: 'self',
      startMinutes: hhmmToMinutes('11:00'),
      durationMin: 60,
      barberId: null,
      barber: 'dani', // case-insensitive
    },
    [legacy],
    0,
  )
  assert.equal(clash, true)
})
