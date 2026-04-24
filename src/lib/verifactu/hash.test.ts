import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHashAlta, computeHashAnulacion, _internals } from './hash.ts'

// -----------------------------------------------------------------------------
// Tests contra los 3 vectores oficiales del PDF AEAT v0.1.2 (27/08/2024):
// "Detalle de las especificaciones técnicas para generación de la huella o
// hash de los registros de facturación" — secciones 6.1, 6.2, 6.3.
//
// Si uno solo de estos tests falla, el algoritmo está mal y NO desplegar.
// -----------------------------------------------------------------------------

// ─── Caso 6.1 — Primer RegistroAlta (sin huella anterior) ────────────────────
test('AEAT vector 6.1 — primer RegistroAlta', () => {
  const hash = computeHashAlta({
    IDEmisorFactura: '89890001K',
    NumSerieFactura: '12345678/G33',
    FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1',
    CuotaTotal: '12.35',
    ImporteTotal: '123.45',
    Huella: '', // primer registro
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  })
  assert.equal(
    hash,
    '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
  )
})

// Verificación extra del payload exacto — el PDF muestra literal la cadena
// construida antes de hashear.
test('AEAT vector 6.1 — payload construido coincide con PDF', () => {
  const payload = _internals.buildPayload([
    ['IDEmisorFactura', '89890001K'],
    ['NumSerieFactura', '12345678/G33'],
    ['FechaExpedicionFactura', '01-01-2024'],
    ['TipoFactura', 'F1'],
    ['CuotaTotal', '12.35'],
    ['ImporteTotal', '123.45'],
    ['Huella', ''],
    ['FechaHoraHusoGenRegistro', '2024-01-01T19:20:30+01:00'],
  ])
  assert.equal(
    payload,
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00',
  )
})

// ─── Caso 6.2 — RegistroAlta encadenado (segundo o sucesivo) ─────────────────
test('AEAT vector 6.2 — RegistroAlta encadenado', () => {
  const hash = computeHashAlta({
    IDEmisorFactura: '89890001K',
    NumSerieFactura: '12345679/G34',
    FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1',
    CuotaTotal: '12.35',
    ImporteTotal: '123.45',
    Huella: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
  })
  assert.equal(
    hash,
    'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
  )
})

// ─── Caso 6.3 — RegistroAnulacion ───────────────────────────────────────────
test('AEAT vector 6.3 — RegistroAnulacion', () => {
  const hash = computeHashAnulacion({
    IDEmisorFacturaAnulada: '89890001K',
    NumSerieFacturaAnulada: '12345679/G34',
    FechaExpedicionFacturaAnulada: '01-01-2024',
    Huella: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
  })
  assert.equal(
    hash,
    '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68',
  )
})

// ─── Casos de borde — tratamiento valores ────────────────────────────────────

test('trim de espacios en valores (AEAT: "12345678 / G33" → "12345678 / G33")', () => {
  // El PDF muestra que el campo NumSerieFactura "  12345678 / G33  " (con
  // espacios inicio/fin) se trata como "12345678 / G33" (trim exterior,
  // se conservan los internos).
  assert.equal(_internals.normaliseValue('  12345678 / G33  '), '12345678 / G33')
})

test('valores vacíos se representan como "nombre="', () => {
  const payload = _internals.buildPayload([
    ['NIF', '89890001K'],
    ['ID', ''],
    ['IdSistemaInformatico', ''],
  ])
  assert.equal(payload, 'NIF=89890001K&ID=&IdSistemaInformatico=')
})

test('null/undefined equivalen a empty string', () => {
  assert.equal(_internals.normaliseValue(null), '')
  assert.equal(_internals.normaliseValue(undefined), '')
})

test('SHA-256 hex upper 64 chars de longitud', () => {
  const h = _internals.sha256HexUpper('anything')
  assert.equal(h.length, 64)
  assert.match(h, /^[0-9A-F]{64}$/)
})
