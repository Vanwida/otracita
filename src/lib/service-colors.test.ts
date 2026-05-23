import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SERVICE_COLOR_TOKENS,
  SERVICE_COLOR_CLASSES,
  SERVICE_COLOR_LABELS,
  SERVICE_COLOR_TEXT,
  SERVICE_COLOR_LIGHTNESS,
  DEFAULT_SERVICE_COLOR,
  isServiceColorToken,
  isCustomHex,
  isValidServiceColor,
  normalizeServiceColor,
  pickTextColor,
  pickTextColorFor,
  hexLuminance,
} from './service-colors.ts'

test('isServiceColorToken acepta los 12 tokens válidos', () => {
  for (const t of SERVICE_COLOR_TOKENS) {
    assert.equal(isServiceColorToken(t), true, `${t} debería ser válido`)
  }
})

test('isServiceColorToken rechaza tokens desconocidos', () => {
  // Tokens viejos pastel — ya no existen.
  assert.equal(isServiceColorToken('terracota'), false)
  assert.equal(isServiceColorToken('coral'), false)
  assert.equal(isServiceColorToken('blush'), false)
  assert.equal(isServiceColorToken('peach'), false)
  // Case sensitive.
  assert.equal(isServiceColorToken('RED'), false)
  // No-strings.
  assert.equal(isServiceColorToken(''), false)
  assert.equal(isServiceColorToken(null), false)
  assert.equal(isServiceColorToken(undefined), false)
  assert.equal(isServiceColorToken(42), false)
  assert.equal(isServiceColorToken({ token: 'red' }), false)
})

test('isCustomHex acepta formato #RRGGBB y rechaza el resto', () => {
  assert.equal(isCustomHex('#FF5733'), true)
  assert.equal(isCustomHex('#ff5733'), true)
  assert.equal(isCustomHex('#000000'), true)
  assert.equal(isCustomHex('#ffffff'), true)
  // Inválidos.
  assert.equal(isCustomHex('FF5733'), false)       // sin #
  assert.equal(isCustomHex('#FFF'), false)         // 3 chars no soportado
  assert.equal(isCustomHex('#FF57331'), false)     // 7 chars
  assert.equal(isCustomHex('#GGGGGG'), false)      // no-hex
  assert.equal(isCustomHex('red'), false)
  assert.equal(isCustomHex(null), false)
})

test('isValidServiceColor acepta token O hex', () => {
  assert.equal(isValidServiceColor('red'), true)
  assert.equal(isValidServiceColor('#FF5733'), true)
  assert.equal(isValidServiceColor('terracota'), false)
  assert.equal(isValidServiceColor('not-a-color'), false)
})

test('normalizeServiceColor devuelve el default ante entradas inválidas', () => {
  assert.equal(normalizeServiceColor('terracota'), DEFAULT_SERVICE_COLOR)
  assert.equal(normalizeServiceColor(null), DEFAULT_SERVICE_COLOR)
  assert.equal(normalizeServiceColor(undefined), DEFAULT_SERVICE_COLOR)
  assert.equal(normalizeServiceColor(''), DEFAULT_SERVICE_COLOR)
})

test('normalizeServiceColor mantiene el token cuando es válido', () => {
  for (const token of SERVICE_COLOR_TOKENS) {
    assert.equal(normalizeServiceColor(token), token)
  }
})

test('normalizeServiceColor normaliza hex a minúsculas', () => {
  assert.equal(normalizeServiceColor('#FF5733'), '#ff5733')
  assert.equal(normalizeServiceColor('#abcdef'), '#abcdef')
})

test('todos los tokens tienen entrada en SERVICE_COLOR_CLASSES', () => {
  for (const token of SERVICE_COLOR_TOKENS) {
    const entry = SERVICE_COLOR_CLASSES[token]
    assert.ok(entry, `Falta entrada de clases para "${token}"`)
    assert.equal(entry.bg, `bg-svc-${token}`)
    assert.equal(entry.border, `border-svc-${token}`)
    assert.equal(entry.ring, `ring-svc-${token}`)
    // ink es text-on-svc-light o text-on-svc-dark según luminancia.
    assert.ok(entry.ink === 'text-on-svc-light' || entry.ink === 'text-on-svc-dark')
  }
})

test('todos los tokens tienen etiqueta en SERVICE_COLOR_LABELS', () => {
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

test('SERVICE_COLOR_TOKENS tiene 12 tokens — paleta saturada Booksy', () => {
  // De 21 pastel → 12 saturados. Si alguien cambia este número actualiza
  // también el bloque @theme en globals.css y SERVICE_COLOR_LIGHTNESS.
  assert.equal(SERVICE_COLOR_TOKENS.length, 12)
  assert.equal(new Set(SERVICE_COLOR_TOKENS).size, 12)
})

test('pickTextColor decide light/dark por luminancia (boundary 0.6)', () => {
  // Boundary: L < 0.6 → light, L ≥ 0.6 → dark.
  assert.equal(pickTextColor(0.59), 'light')
  assert.equal(pickTextColor(0.61), 'dark')
  assert.equal(pickTextColor(0.6), 'dark')   // boundary inclusivo en dark
  assert.equal(pickTextColor(0.0), 'light')
  assert.equal(pickTextColor(1.0), 'dark')
})

test('SERVICE_COLOR_TEXT está alineado con SERVICE_COLOR_LIGHTNESS', () => {
  for (const t of SERVICE_COLOR_TOKENS) {
    const expected = pickTextColor(SERVICE_COLOR_LIGHTNESS[t])
    assert.equal(SERVICE_COLOR_TEXT[t], expected, `Texto de ${t} debería ser ${expected}`)
  }
  // Sanity: amber y cyan deberían usar texto OSCURO (L ≥ 0.6).
  assert.equal(SERVICE_COLOR_TEXT.amber, 'dark')
  assert.equal(SERVICE_COLOR_TEXT.cyan, 'dark')
  // red, blue, indigo deberían usar texto CLARO (L < 0.6).
  assert.equal(SERVICE_COLOR_TEXT.red, 'light')
  assert.equal(SERVICE_COLOR_TEXT.blue, 'light')
  assert.equal(SERVICE_COLOR_TEXT.indigo, 'light')
})

test('hexLuminance para anchors conocidos', () => {
  // #000000 (negro puro) → L ≈ 0.
  assert.ok((hexLuminance('#000000') ?? 1) < 0.01, '#000 debería tener L ≈ 0')
  // #ffffff (blanco puro) → L ≈ 1.
  assert.ok((hexLuminance('#ffffff') ?? 0) > 0.99, '#fff debería tener L ≈ 1')
  // #1E88E5 (azul Booksy) → L < 0.6 (texto claro).
  const blueL = hexLuminance('#1E88E5')
  assert.ok(blueL !== null)
  assert.ok(blueL! < 0.6, `#1E88E5 debería tener L < 0.6 (texto claro), got ${blueL}`)
  // #FFC107 (ámbar Booksy) → L > 0.6 (texto oscuro).
  const amberL = hexLuminance('#FFC107')
  assert.ok(amberL !== null)
  assert.ok(amberL! > 0.6, `#FFC107 debería tener L > 0.6 (texto oscuro), got ${amberL}`)
})

test('hexLuminance rechaza inputs no-hex', () => {
  assert.equal(hexLuminance('red'), null)
  assert.equal(hexLuminance('#GGGGGG'), null)
  assert.equal(hexLuminance(''), null)
})

test('pickTextColorFor con tokens y hex', () => {
  // Tokens canónicos: el resultado debe alinear con SERVICE_COLOR_TEXT.
  assert.equal(pickTextColorFor('red'), SERVICE_COLOR_TEXT.red)
  assert.equal(pickTextColorFor('amber'), 'dark')
  assert.equal(pickTextColorFor('indigo'), 'light')
  // Hex custom rojo puro (#ff0000) → L* ≈ 0.53 → light.
  assert.equal(pickTextColorFor('#ff0000'), 'light')
  // Hex custom #FF5733 (naranja vivo, L* ≈ 0.60 — justo en boundary) → dark.
  // El caller del spec puede elegir el color que quiera; aquí simplemente
  // verificamos el comportamiento determinista del helper.
  assert.equal(pickTextColorFor('#FF5733'), 'dark')
  // Hex blanco → texto oscuro.
  assert.equal(pickTextColorFor('#ffffff'), 'dark')
  // Hex negro → texto claro.
  assert.equal(pickTextColorFor('#000000'), 'light')
  // Inválido → cae al texto del default.
  assert.equal(pickTextColorFor('not-a-color'), SERVICE_COLOR_TEXT[DEFAULT_SERVICE_COLOR])
  assert.equal(pickTextColorFor(null), SERVICE_COLOR_TEXT[DEFAULT_SERVICE_COLOR])
})
