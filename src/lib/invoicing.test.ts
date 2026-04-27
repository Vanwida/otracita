import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateAmounts,
  buildLineItem,
  aggregateLineAmounts,
  generateInvoiceNumber,
  determineInvoiceType,
  composeServiceName,
} from './invoicing-math.ts'

// -----------------------------------------------------------------------------
// Pure helpers — no DB, no I/O. Verifican que el cálculo de líneas + sus
// totales agregados coincide con el cálculo legacy `calculateAmounts` para
// el caso de un único servicio, y comprueban la composición multi-línea
// (servicio + productos).
// -----------------------------------------------------------------------------

test('buildLineItem reverse-calculates IVA from a price including IVA', () => {
  // Servicio único: 25,00 € con IVA 21% → base 20,66 € + IVA 4,34 €.
  const line = buildLineItem(
    { kind: 'service', name: 'Corte', quantity: 1, unitPriceCents: 2500 },
    21,
  )
  assert.equal(line.totalCents, 2500)
  assert.equal(line.subtotalCents, 2066)
  assert.equal(line.ivaAmountCents, 434)
})

test('buildLineItem with quantity > 1 multiplies the unit price first, then splits IVA', () => {
  const line = buildLineItem(
    { kind: 'product', name: 'Cera', quantity: 3, unitPriceCents: 1200 },
    21,
  )
  // 1200 × 3 = 3600. base = round(3600 / 1.21) = 2975. iva = 625.
  assert.equal(line.totalCents, 3600)
  assert.equal(line.subtotalCents, 2975)
  assert.equal(line.ivaAmountCents, 625)
})

test('aggregateLineAmounts sums each component independently — total is exact', () => {
  const lines = [
    buildLineItem({ kind: 'service', name: 'Corte', quantity: 1, unitPriceCents: 2500 }, 21),
    buildLineItem({ kind: 'product', name: 'Cera', quantity: 2, unitPriceCents: 1200 }, 21),
  ]
  const agg = aggregateLineAmounts(lines)
  // Servicio: 2500 (base 2066, IVA 434). Cera×2: 2400 (base 1983, IVA 417).
  assert.equal(agg.totalCents, 2500 + 2400)
  assert.equal(agg.subtotalCents, 2066 + 1983)
  assert.equal(agg.ivaAmountCents, 434 + 417)
  // Sanity: subtotal + iva = total (puede haber off-by-1 cents acumulados
  // entre líneas — confirmamos que se cumple para este caso).
  assert.equal(agg.subtotalCents + agg.ivaAmountCents, agg.totalCents)
})

test('aggregateLineAmounts on empty array returns zeros', () => {
  const agg = aggregateLineAmounts([])
  assert.deepEqual(agg, { subtotalCents: 0, ivaAmountCents: 0, totalCents: 0 })
})

test('buildLineItem matches calculateAmounts for a single service line', () => {
  // Backward compatibility check: la fórmula por línea da el mismo desglose
  // que la fórmula legacy `calculateAmounts(priceEuros, iva)` para qty=1.
  const priceEuros = 17.5
  const iva = 21
  const legacy = calculateAmounts(priceEuros, iva)
  const line = buildLineItem(
    { kind: 'service', name: 'X', quantity: 1, unitPriceCents: Math.round(priceEuros * 100) },
    iva,
  )
  assert.equal(line.totalCents, legacy.totalCents)
  assert.equal(line.subtotalCents, legacy.subtotalCents)
  assert.equal(line.ivaAmountCents, legacy.ivaAmountCents)
})

// -----------------------------------------------------------------------------
// composeServiceName — string legible para la columna legacy `service_name`.
// -----------------------------------------------------------------------------

test('composeServiceName returns service name when no products', () => {
  const lines = [
    buildLineItem({ kind: 'service', name: 'Corte de pelo', quantity: 1, unitPriceCents: 2500 }, 21),
  ]
  assert.equal(composeServiceName(lines), 'Corte de pelo')
})

test('composeServiceName composes service + product count (singular)', () => {
  const lines = [
    buildLineItem({ kind: 'service', name: 'Corte', quantity: 1, unitPriceCents: 2500 }, 21),
    buildLineItem({ kind: 'product', name: 'Cera', quantity: 1, unitPriceCents: 1200 }, 21),
  ]
  assert.equal(composeServiceName(lines), 'Corte + 1 producto')
})

test('composeServiceName composes service + product count (plural with multiple products)', () => {
  const lines = [
    buildLineItem({ kind: 'service', name: 'Corte', quantity: 1, unitPriceCents: 2500 }, 21),
    buildLineItem({ kind: 'product', name: 'Cera', quantity: 2, unitPriceCents: 1200 }, 21),
    buildLineItem({ kind: 'product', name: 'Champú', quantity: 1, unitPriceCents: 1800 }, 21),
  ]
  assert.equal(composeServiceName(lines), 'Corte + 3 productos')
})

test('composeServiceName falls back to product count when no service line', () => {
  const lines = [
    buildLineItem({ kind: 'product', name: 'Cera', quantity: 1, unitPriceCents: 1200 }, 21),
  ]
  assert.equal(composeServiceName(lines), '1 producto')
})

// -----------------------------------------------------------------------------
// Sanity — funciones existentes tocadas por el refactor (no han cambiado
// semántica, pero el test sirve de regresión).
// -----------------------------------------------------------------------------

test('generateInvoiceNumber pads the sequence and prefixes correctly', () => {
  assert.equal(generateInvoiceNumber({ invoiceNumberPrefix: 'FAC-2026-', invoiceNumberNext: 7 }), 'FAC-2026-0007')
  assert.equal(generateInvoiceNumber({ invoiceNumberPrefix: '', invoiceNumberNext: 7 }), '0007')
})

test('determineInvoiceType picks ticket for empty NIF and invoice for filled NIF', () => {
  assert.equal(determineInvoiceType(null), 'ticket')
  assert.equal(determineInvoiceType(''), 'ticket')
  assert.equal(determineInvoiceType('   '), 'ticket')
  assert.equal(determineInvoiceType('A12345678'), 'invoice')
})

