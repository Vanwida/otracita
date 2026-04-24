import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQrUrl } from './qr.ts'

// -----------------------------------------------------------------------------
// Tests contra los ejemplos literales del PDF AEAT v0.5.0 (10/12/2025):
// "Detalle de las especificaciones técnicas del código QR de la factura..."
// -----------------------------------------------------------------------------

// Sección 4 del PDF — ejemplo de URL con encoding UTF-8 correcto.
// Input: nif=89890001K, numserie=12345678&G33, fecha=01-01-2024, importe=241.4
// Expected: prewww2...ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.4
test('AEAT QR — ejemplo sección 4 con ampersand URL-encoded', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: '12345678&G33',
    fecha: '01-01-2024',
    importe: '241.4',
    env: 'pruebas',
    verifactu: true,
  })
  assert.equal(
    url,
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.4',
  )
})

// Sección 8.3 — ejemplo producción VeriFactu.
test('AEAT QR — URL producción VeriFactu', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: '12345678',
    fecha: '01-01-2024',
    importe: '241.40',
    env: 'production',
    verifactu: true,
  })
  assert.equal(
    url,
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678&fecha=01-01-2024&importe=241.40',
  )
})

// Sección 5.2/8.4 — URL NO-VeriFactu tiene endpoint distinto.
test('AEAT QR — URL NO-VeriFactu producción', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: '12345678',
    fecha: '01-01-2024',
    importe: '241.40',
    env: 'production',
    verifactu: false,
  })
  assert.equal(
    url,
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=89890001K&numserie=12345678&fecha=01-01-2024&importe=241.40',
  )
})

// Caracteres especiales comunes en series: "/" debe codearse como %2F
test('URL-encoding — "/" en numserie → %2F', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: 'F/2026/0123',
    fecha: '15-04-2026',
    importe: '25.00',
    env: 'pruebas',
  })
  assert.equal(
    url,
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=F%2F2026%2F0123&fecha=15-04-2026&importe=25.00',
  )
})

// Espacios → %20 (no '+', spec es UTF-8 URL encoding estándar)
test('URL-encoding — espacio → %20', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: 'A B',
    fecha: '01-01-2024',
    importe: '10.00',
  })
  assert.match(url, /numserie=A%20B/)
})

// Orden de parámetros fijo: nif, numserie, fecha, importe
test('Orden de parámetros — nif primero, importe último', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: '12345678',
    fecha: '01-01-2024',
    importe: '100.00',
  })
  const query = url.split('?')[1]
  const keys = query.split('&').map((kv) => kv.split('=')[0])
  assert.deepEqual(keys, ['nif', 'numserie', 'fecha', 'importe'])
})

// Default env = pruebas (para que mientras no tengamos certificado no
// mandemos a producción por accidente)
test('Default env es "pruebas" (conservador hasta M4)', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: '12345678',
    fecha: '01-01-2024',
    importe: '10.00',
  })
  assert.ok(url.startsWith('https://prewww2.aeat.es/'))
})

// Default verifactu=true (modo recomendado AEAT)
test('Default verifactu = true → endpoint ValidarQR (no ValidarQRNoVerifactu)', () => {
  const url = buildQrUrl({
    nif: '89890001K',
    numserie: '12345678',
    fecha: '01-01-2024',
    importe: '10.00',
  })
  assert.ok(url.includes('/ValidarQR?'))
  assert.ok(!url.includes('ValidarQRNoVerifactu'))
})
