import test from 'node:test'
import assert from 'node:assert/strict'
import { eurosToCents, centsToEuros, roundEuros } from './format.ts'

// -----------------------------------------------------------------------------
// Conversión euros ⇄ céntimos — la frontera única entre lo que teclea el
// barbero (euros) y lo que persiste el schema (céntimos enteros).
//
// Este helper existe por L-05: `bookings.price` era INTEGER en euros y un
// servicio de 12,50 € se guardaba como 13. Ahora la única operación que puede
// perder precisión vive aquí y está cubierta.
// -----------------------------------------------------------------------------

test('eurosToCents: importes con decimales sobreviven', () => {
  assert.equal(eurosToCents(12.5), 1250)
  assert.equal(eurosToCents(17.5), 1750)
  assert.equal(eurosToCents(25), 2500)
  assert.equal(eurosToCents(0), 0)
})

test('eurosToCents: el redondeo compensa el float binario', () => {
  // 12.35 * 100 === 1234.9999999999998 y 0.29 * 100 === 28.999999999999996
  // en IEEE-754. Sin Math.round el barbero perdería un céntimo por cita.
  assert.equal(eurosToCents(12.35), 1235)
  assert.equal(eurosToCents(0.29), 29)
})

test('eurosToCents: medio céntimo cae al lado del float, no del redondeo', () => {
  // Límite conocido y aceptado: 1.005 no es representable en binario
  // (1.005 * 100 === 100.49999999999999), así que baja a 100. NO es un caso
  // real — todo importe entra por `parseDecimalInput(raw, 2)`, que ya lo
  // deja en 2 decimales antes de llegar aquí. Se documenta para que nadie
  // "arregle" el helper con toFixed y rompa el resto.
  assert.equal(eurosToCents(1.005), 100)
  assert.equal(eurosToCents(1.01), 101)
})

test('eurosToCents: ausencia de importe → null (distinto de 0 = gratis)', () => {
  assert.equal(eurosToCents(null), null)
  assert.equal(eurosToCents(undefined), null)
  assert.equal(eurosToCents(Number.NaN), null)
  assert.equal(eurosToCents(Number.POSITIVE_INFINITY), null)
  // 0 SÍ es un importe válido: servicio de cortesía cobrado a 0 €.
  assert.equal(eurosToCents(0), 0)
})

test('centsToEuros: céntimos → euros exactos', () => {
  assert.equal(centsToEuros(1250), 12.5)
  assert.equal(centsToEuros(1235), 12.35)
  assert.equal(centsToEuros(0), 0)
  assert.equal(centsToEuros(null), null)
  assert.equal(centsToEuros(undefined), null)
})

test('round-trip euros → céntimos → euros es idempotente', () => {
  for (const euros of [12.5, 17.5, 25, 0, 0.05, 99.99, 12.35]) {
    assert.equal(centsToEuros(eurosToCents(euros)), euros, `falla con ${euros}`)
  }
})

test('roundEuros: normaliza al céntimo y acepta strings del formulario', () => {
  assert.equal(roundEuros(12.5), 12.5)
  assert.equal(roundEuros('12.5'), 12.5)
  assert.equal(roundEuros(12.499), 12.5)
  assert.equal(roundEuros(12.494), 12.49)
  assert.equal(roundEuros(''), null)
  assert.equal(roundEuros('abc'), null)
  assert.equal(roundEuros(null), null)
  assert.equal(roundEuros(undefined), null)
})
