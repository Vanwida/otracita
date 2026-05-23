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
  // Cubrimos un sample de cada zona del círculo cromático (#68) para que el
  // test rompa si alguien borra un token específico, no solo si el array
  // entero se vacía. Iterar el array completo va en otro test más abajo.
  assert.equal(isServiceColorToken('terracota'), true)
  assert.equal(isServiceColorToken('olive'), true)
  assert.equal(isServiceColorToken('sand'), true)
  // Tokens añadidos en #68 — un caso por cada uno.
  assert.equal(isServiceColorToken('coral'), true)
  assert.equal(isServiceColorToken('blush'), true)
  assert.equal(isServiceColorToken('brick'), true)
  assert.equal(isServiceColorToken('peach'), true)
  assert.equal(isServiceColorToken('oat'), true)
  assert.equal(isServiceColorToken('mustard'), true)
  assert.equal(isServiceColorToken('sage'), true)
  assert.equal(isServiceColorToken('jade'), true)
  assert.equal(isServiceColorToken('teal'), true)
  assert.equal(isServiceColorToken('fog'), true)
  assert.equal(isServiceColorToken('denim'), true)
  assert.equal(isServiceColorToken('lavender'), true)
  assert.equal(isServiceColorToken('plum'), true)
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

test('SERVICE_COLOR_TOKENS tiene 21 tokens (paleta ampliada #68)', () => {
  // Antes 8, ahora 21 (#68 — coral/blush/brick/peach/oat/mustard/sage/jade/
  // teal/fog/denim/lavender/plum sumados a la base original). Si subes o
  // bajas tokens en globals.css, este número MANDA — actualízalo aquí y en
  // service-colors.ts a la vez para que el catálogo no quede medio migrado.
  assert.equal(SERVICE_COLOR_TOKENS.length, 21)
  // No duplicados
  assert.equal(new Set(SERVICE_COLOR_TOKENS).size, 21)
})

test('todos los tokens nuevos #68 están en SERVICE_COLOR_CLASSES', () => {
  // Test específico para los 13 tokens añadidos en #68 — asegura que ninguno
  // se queda "huérfano" (token en el array pero sin entrada de clases →
  // pintaría sin estilo en la agenda).
  const newTokens = [
    'coral', 'blush', 'brick', 'peach', 'oat', 'mustard',
    'sage', 'jade', 'teal', 'fog', 'denim', 'lavender', 'plum',
  ] as const
  for (const t of newTokens) {
    assert.ok(SERVICE_COLOR_TOKENS.includes(t), `Token "${t}" no está en array`)
    const entry = SERVICE_COLOR_CLASSES[t]
    assert.ok(entry, `Falta entrada de clases para "${t}"`)
    assert.equal(entry.bg, `bg-svc-${t}-bg`)
    assert.equal(entry.ink, `text-svc-${t}-ink`)
    assert.equal(entry.border, `border-svc-${t}-ink`)
    assert.equal(entry.ring, `ring-svc-${t}-ink`)
  }
})
