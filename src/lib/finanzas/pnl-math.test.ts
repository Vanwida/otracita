import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRevenueCents, computeIvaBreakdown } from './pnl-math.ts'

// -----------------------------------------------------------------------------
// computeRevenueCents — todos los componentes llegan ya en CÉNTIMOS enteros.
// Desde L-05 no hay ninguna columna de dinero en euros, así que la función
// solo agrega: no queda ningún redondeo donde perder medio euro.
// -----------------------------------------------------------------------------

test('computeRevenueCents: principal + extras se suman en céntimos', () => {
  const r = computeRevenueCents({
    bookingCents: 10000, // servicio principal, 100 €
    extrasCents: 2500, // 1 extra, 25 €
    manualCents: 0,
    productsCents: 0,
    tipsCents: 0,
  })
  assert.equal(r.bookingCents, 12500)
  assert.equal(r.totalCents, 12500)
})

test('computeRevenueCents: suma todos los componentes', () => {
  const r = computeRevenueCents({
    bookingCents: 20000, // 200 €
    extrasCents: 0,
    manualCents: 5000, // efectivo manual
    productsCents: 3000, // productos
    tipsCents: 1500, // propinas
  })
  assert.equal(r.bookingCents, 20000)
  assert.equal(r.productsCents, 3000)
  assert.equal(r.tipsCents, 1500)
  assert.equal(r.totalCents, 20000 + 5000 + 3000 + 1500) // 29500
})

test('computeRevenueCents: cita simple sin extras (no-regresión)', () => {
  const r = computeRevenueCents({
    bookingCents: 2500,
    extrasCents: 0,
    manualCents: 0,
    productsCents: 0,
    tipsCents: 0,
  })
  assert.equal(r.totalCents, 2500)
})

// L-05 — el caso que motivó el cambio de unidad.
test('computeRevenueCents: importes con decimales llegan intactos', () => {
  // Dos citas de Reni: 12,50 € y 17,50 €. Antes el schema las truncaba a
  // euros enteros y el P&L reportaba 30 € o 31 € según el redondeo.
  const r = computeRevenueCents({
    bookingCents: 1250 + 1750,
    extrasCents: 0,
    manualCents: 0,
    productsCents: 0,
    tipsCents: 0,
  })
  assert.equal(r.bookingCents, 3000)
  assert.equal(r.totalCents, 3000)
})

test('computeRevenueCents: sumar céntimos enteros no acumula drift', () => {
  // 10,01 € en dos trozos (10,005 + 0,005) era el caso frágil en euros-float.
  // En céntimos ya no existe: 1000 + 1 = 1001, exacto.
  const r = computeRevenueCents({
    bookingCents: 1000,
    extrasCents: 1,
    manualCents: 0,
    productsCents: 0,
    tipsCents: 0,
  })
  assert.equal(r.bookingCents, 1001)
})

// -----------------------------------------------------------------------------
// computeIvaBreakdown — IVA configurable; propina FUERA de la base.
// -----------------------------------------------------------------------------

test('computeIvaBreakdown @21% sin propinas == 21/121 histórico (no-regresión)', () => {
  for (const ing of [12345, 99999, 100000, 250075]) {
    const b = computeIvaBreakdown({
      ingresosCents: ing,
      tipsCents: 0,
      gastosConIvaCents: 0,
      ivaRate: 21,
    })
    assert.equal(b.ivaRepercutidoCents, Math.round((ing * 21) / 121))
    assert.equal(b.ingresosNetosCents, Math.round((ing * 100) / 121))
  }
})

test('computeIvaBreakdown: la propina NO entra a la base de IVA', () => {
  // svc+prod 120000c + propina 5000c → ingresos 125000c, base 120000c.
  const b = computeIvaBreakdown({
    ingresosCents: 125000,
    tipsCents: 5000,
    gastosConIvaCents: 0,
    ivaRate: 21,
  })
  assert.equal(b.ivaBaseCents, 120000)
  // IVA solo sobre 120000, no sobre 125000.
  assert.equal(b.ivaRepercutidoCents, Math.round((120000 * 21) / 121))
  // Neto = base sin IVA + propina nominal.
  assert.equal(
    b.ingresosNetosCents,
    Math.round((120000 * 100) / 121) + 5000,
  )
})

test('computeIvaBreakdown: ivaAPagar = repercutido − soportado, nunca negativo', () => {
  const b = computeIvaBreakdown({
    ingresosCents: 10000,
    tipsCents: 0,
    gastosConIvaCents: 999999, // soportado enorme
    ivaRate: 21,
  })
  assert.equal(b.ivaAPagarCents, 0) // clamp a 0
})

test('computeIvaBreakdown: ivaRate configurable (10%) coincide con factura', () => {
  // invoicing-math calculateAmounts: sub = round(total/(1+r/100)).
  const total = 10000
  const sub = Math.round(total / (1 + 10 / 100)) // 9091
  const b = computeIvaBreakdown({
    ingresosCents: total,
    tipsCents: 0,
    gastosConIvaCents: 0,
    ivaRate: 10,
  })
  assert.equal(b.ingresosNetosCents, sub) // 9091, paridad con la factura
})
