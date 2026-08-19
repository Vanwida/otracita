import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SERVICE_PRICE_ERROR,
  MAX_SERVICE_PRICE,
  parseServicePrice,
  servicePriceError,
  normalizeServicePrice,
  inferCourtesy,
  formatServicePrice,
} from './service-price.ts'

// -----------------------------------------------------------------------------
// U-12 — un servicio no se guarda a 0 € por descuido. Helpers puros, sin I/O.
// -----------------------------------------------------------------------------

test('el input en blanco NO es 0 € — es "sin decidir"', () => {
  assert.equal(parseServicePrice(''), null)
  assert.equal(parseServicePrice('   '), null)
  assert.equal(parseServicePrice(undefined), null)
  assert.equal(parseServicePrice(null), null)
  assert.equal(parseServicePrice('abc'), null)
  assert.equal(parseServicePrice(Number.NaN), null)
})

test('acepta coma decimal (teclado español) y números ya guardados', () => {
  assert.equal(parseServicePrice('12,5'), 12.5)
  assert.equal(parseServicePrice('12.5'), 12.5)
  assert.equal(parseServicePrice(25), 25)
  assert.equal(parseServicePrice(0), 0)
})

test('guardar sin precio da error; el 0 explícito también', () => {
  assert.equal(servicePriceError('', false), SERVICE_PRICE_ERROR)
  assert.equal(servicePriceError('0', false), SERVICE_PRICE_ERROR)
  assert.equal(servicePriceError(0, false), SERVICE_PRICE_ERROR)
  assert.equal(servicePriceError('-5', false), SERVICE_PRICE_ERROR)
  assert.equal(servicePriceError(undefined, undefined), SERVICE_PRICE_ERROR)
})

test('cortesía deja pasar el 0 a propósito', () => {
  assert.equal(servicePriceError('', true), null)
  assert.equal(servicePriceError('0', true), null)
  assert.equal(normalizeServicePrice('', true), 0)
  assert.equal(normalizeServicePrice('30', true), 0)
})

test('un precio normal pasa; un dedazo enorme no', () => {
  assert.equal(servicePriceError('15', false), null)
  assert.equal(servicePriceError(0.5, false), null)
  assert.notEqual(servicePriceError(MAX_SERVICE_PRICE + 1, false), null)
})

test('normaliza a number con céntimos limpios — bookings/create exige number', () => {
  assert.equal(normalizeServicePrice('12,499', false), 12.5)
  assert.equal(typeof normalizeServicePrice('25', false), 'number')
})

test('un 0 € legacy sin flag se lee como cortesía para no bloquear la edición', () => {
  assert.equal(inferCourtesy(0, undefined), true)
  assert.equal(inferCourtesy('0', undefined), true)
  // Un flag explícito manda sobre la inferencia.
  assert.equal(inferCourtesy(0, false), false)
  assert.equal(inferCourtesy(20, true), true)
  // Sin precio no inferimos cortesía: es un "sin decidir", no un regalo.
  assert.equal(inferCourtesy('', undefined), false)
})

test('la lista del dashboard dice "Gratis", no "0€"', () => {
  assert.equal(formatServicePrice(0, true), 'Gratis')
  assert.equal(formatServicePrice(15, false), '15€')
  assert.equal(formatServicePrice('', false), '—')
})
