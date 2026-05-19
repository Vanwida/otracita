import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRevenueCents, computeIvaBreakdown } from './pnl-math.ts'

// -----------------------------------------------------------------------------
// computeRevenueCents — servicios+extras (EUROS) ×100 una vez + cents directos.
// -----------------------------------------------------------------------------

test('computeRevenueCents: principal + extras ×100 una sola vez', () => {
  const r = computeRevenueCents({
    bookingPriceEuros: 100, // servicio principal
    extrasEuros: 25, // 1 extra
    manualCents: 0,
    productsCents: 0,
    tipsCents: 0,
  })
  // round((100 + 25) * 100) = 12500
  assert.equal(r.bookingCents, 12500)
  assert.equal(r.totalCents, 12500)
})

test('computeRevenueCents: suma todos los componentes', () => {
  const r = computeRevenueCents({
    bookingPriceEuros: 200, // 20000c
    extrasEuros: 0,
    manualCents: 5000, // efectivo manual
    productsCents: 3000, // productos
    tipsCents: 1500, // propinas
  })
  assert.equal(r.bookingCents, 20000)
  assert.equal(r.productsCents, 3000)
  assert.equal(r.tipsCents, 1500)
  assert.equal(r.totalCents, 20000 + 5000 + 3000 + 1500) // 29500
})

test('computeRevenueCents: cita simple sin extras = price*100 (no-regresión)', () => {
  const r = computeRevenueCents({
    bookingPriceEuros: 25,
    extrasEuros: 0,
    manualCents: 0,
    productsCents: 0,
    tipsCents: 0,
  })
  assert.equal(r.totalCents, 2500)
})

test('computeRevenueCents: redondeo único evita drift de céntimos', () => {
  // 10.005 + 0.005 = 10.01 € → 1001c. Si se redondeara por separado:
  // round(1000.5) + round(0.5) = 1001 + 1 = 1002 (mal). Una sola vez: 1001.
  const r = computeRevenueCents({
    bookingPriceEuros: 10.005,
    extrasEuros: 0.005,
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
