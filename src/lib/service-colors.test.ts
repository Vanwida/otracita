import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SERVICE_COLOR_TOKENS,
  SERVICE_COLOR_CLASSES,
  SERVICE_COLOR_LABELS,
  DEFAULT_SERVICE_COLOR,
  isServiceColorToken,
  normalizeServiceColor,
} from './service-colors.ts'

test('isServiceColorToken acepta tokens válidos', () => {
  assert.equal(isServiceColorToken('terracota'), true)
  assert.equal(isServiceColorToken('olive'), true)
  assert.equal(isServiceColorToken('sand'), true)
})

test('isServiceColorToken rechaza tokens desconocidos', () => {
  assert.equal(isServiceColorToken('chartreuse'), false)
  assert.equal(isServiceColorToken('TERRACOTA'), false) // case sensitive
  assert.equal(isServiceColorToken(''), false)
  assert.equal(isServiceColorToken(null), false)
  assert.equal(isServiceColorToken(undefined), false)
  assert.equal(isServiceColorToken(42), false)
  assert.equal(isServiceColorToken({ token: 'terracota' }), false)
})

test('normalizeServiceColor devuelve el default ante entradas inválidas', () => {
  assert.equal(normalizeServiceColor('chartreuse'), DEFAULT_SERVICE_COLOR)
  assert.equal(normalizeServiceColor(null), DEFAULT_SERVICE_COLOR)
  assert.equal(normalizeServiceColor(undefined), DEFAULT_SERVICE_COLOR)
  assert.equal(normalizeServiceColor(''), DEFAULT_SERVICE_COLOR)
})

test('normalizeServiceColor mantiene el token cuando es válido', () => {
  for (const token of SERVICE_COLOR_TOKENS) {
    assert.equal(normalizeServiceColor(token), token)
  }
})

test('todos los tokens tienen entrada en SERVICE_COLOR_CLASSES', () => {
  for (const token of SERVICE_COLOR_TOKENS) {
    const entry = SERVICE_COLOR_CLASSES[token]
    assert.ok(entry, `Falta entrada de clases para "${token}"`)
    assert.equal(typeof entry.bg, 'string')
    assert.equal(typeof entry.ink, 'string')
    assert.equal(typeof entry.border, 'string')
    assert.equal(typeof entry.ring, 'string')
    assert.ok(entry.bg.length > 0)
    assert.ok(entry.ink.length > 0)
  }
})

test('todos los tokens tienen una etiqueta en SERVICE_COLOR_LABELS', () => {
  for (const token of SERVICE_COLOR_TOKENS) {
    const label = SERVICE_COLOR_LABELS[token]
    assert.ok(label, `Falta etiqueta para "${token}"`)
    assert.equal(typeof label, 'string')
    assert.ok(label.length > 0)
  }
})

test('DEFAULT_SERVICE_COLOR es un token válido', () => {
  assert.ok(isServiceColorToken(DEFAULT_SERVICE_COLOR))
})

test('SERVICE_COLOR_TOKENS tiene exactamente 8 tokens (alineado con paleta)', () => {
  assert.equal(SERVICE_COLOR_TOKENS.length, 8)
  // No duplicados
  assert.equal(new Set(SERVICE_COLOR_TOKENS).size, 8)
})
