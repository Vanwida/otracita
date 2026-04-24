import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatFechaExpedicion, formatFechaHoraHusoGen, centsToDecimal } from './format.ts'

// -----------------------------------------------------------------------------
// Tests puros (sin DB) de los helpers de formato. Los helpers tocan zona
// horaria Madrid y formatos AEAT — cualquier drift aquí rompe el hash.
// -----------------------------------------------------------------------------

test('formatFechaExpedicion — DD-MM-YYYY Madrid', () => {
  // 1 ene 2024 00:00 UTC → 1 ene 2024 01:00 Madrid
  const d = new Date('2024-01-01T00:00:00Z')
  assert.equal(formatFechaExpedicion(d), '01-01-2024')

  // 31 dic 2023 23:59 UTC → 1 ene 2024 00:59 Madrid (cruza día por TZ)
  const d2 = new Date('2023-12-31T23:59:00Z')
  assert.equal(formatFechaExpedicion(d2), '01-01-2024')

  // Verano: Madrid +2 (CEST)
  const dSummer = new Date('2024-07-15T10:30:00Z')
  assert.equal(formatFechaExpedicion(dSummer), '15-07-2024')
})

test('formatFechaHoraHusoGen — ISO 8601 con offset Madrid', () => {
  // El vector oficial AEAT usa "2024-01-01T19:20:30+01:00" (horario invierno)
  const d = new Date('2024-01-01T18:20:30Z') // = 19:20 Madrid CET
  assert.equal(formatFechaHoraHusoGen(d), '2024-01-01T19:20:30+01:00')

  // Verano CEST (+02:00)
  const dSummer = new Date('2024-07-15T10:00:00Z')
  assert.equal(formatFechaHoraHusoGen(dSummer), '2024-07-15T12:00:00+02:00')
})

test('centsToDecimal — formato N.DD siempre con 2 decimales', () => {
  assert.equal(centsToDecimal(12345), '123.45')
  assert.equal(centsToDecimal(1235), '12.35')
  assert.equal(centsToDecimal(100), '1.00')
  assert.equal(centsToDecimal(10), '0.10')
  assert.equal(centsToDecimal(1), '0.01')
  assert.equal(centsToDecimal(0), '0.00')
  assert.equal(centsToDecimal(-500), '-5.00') // abono/rectificativa
})
