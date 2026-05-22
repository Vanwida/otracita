import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeBookingTotalCentsFromRows } from './total-compute.ts'

// -----------------------------------------------------------------------------
// computeBookingTotalCentsFromRows — pure helper detrás de `bookingTotalCents`.
//
// Invariante crítico que protege estos tests: este es el ÚNICO sitio donde se
// calcula el "total real" de una cita en céntimos. El endpoint /charge usa
// este valor para validar que la suma de tramos coincide con el importe; si
// el cálculo se descuadra de la factura, los clientes acaban viendo
// "sum_mismatch" sin razón aparente. Los tests cubren los 3 vectores que
// causaron bugs históricos: extras multi-servicio (R7), cortesía (priceEuros
// null), y separación de productos (ventas paralelas que NO suben el total).
// -----------------------------------------------------------------------------

describe('computeBookingTotalCentsFromRows — caso simple (sin extras)', () => {
  it('booking 25€ sin extras → 2500 céntimos', () => {
    assert.equal(computeBookingTotalCentsFromRows(25, []), 2500)
  })

  it('booking 0€ sin extras → 0', () => {
    assert.equal(computeBookingTotalCentsFromRows(0, []), 0)
  })

  it('booking null sin extras → 0 (cita sin importe, p.ej. legacy)', () => {
    assert.equal(computeBookingTotalCentsFromRows(null, []), 0)
  })

  it('booking undefined sin extras → 0', () => {
    assert.equal(computeBookingTotalCentsFromRows(undefined, []), 0)
  })

  it('booking 99€ sin extras → 9900 (no overflow ni mantissa raro)', () => {
    assert.equal(computeBookingTotalCentsFromRows(99, []), 9900)
  })
})

describe('computeBookingTotalCentsFromRows — multi-servicio R7 (extras)', () => {
  it('corte 25€ + barba 10€ → 3500', () => {
    assert.equal(
      computeBookingTotalCentsFromRows(25, [{ priceEuros: 10 }]),
      3500,
    )
  })

  it('corte 25€ + barba 10€ + cejas 5€ → 4000 (3 servicios)', () => {
    assert.equal(
      computeBookingTotalCentsFromRows(25, [
        { priceEuros: 10 },
        { priceEuros: 5 },
      ]),
      4000,
    )
  })

  it('extras a 0€ no afectan al total', () => {
    assert.equal(
      computeBookingTotalCentsFromRows(25, [{ priceEuros: 0 }]),
      2500,
    )
  })

  it('extra null (cortesía) NO suma ni resta', () => {
    // priceEuros NULL = cortesía deliberada (el barbero regala el servicio).
    // No debe restar 0€×100 con redondeo raro, simplemente contribuir 0.
    assert.equal(
      computeBookingTotalCentsFromRows(25, [
        { priceEuros: null },
        { priceEuros: 10 },
      ]),
      3500,
    )
  })

  it('extra negativo (datos sucios) NO resta del total', () => {
    // Defensivo: si alguien metió priceEuros=-5 por error en DB, NO restar.
    assert.equal(
      computeBookingTotalCentsFromRows(25, [{ priceEuros: -5 }]),
      2500,
    )
  })
})

describe('computeBookingTotalCentsFromRows — redondeo (paridad con invoicing)', () => {
  it('×100 se aplica UNA sola vez sobre la suma (no extra×100 + principal×100)', () => {
    // Si fuese round(p × 100) + Σ round(extra × 100) podría cuadrar distinto
    // por redondeos. El motor suma euros primero y multiplica al final.
    // 25.5 € + 10.4 € = 35.9 € → 3590 (no 3589 ni 3591).
    assert.equal(
      computeBookingTotalCentsFromRows(25.5, [{ priceEuros: 10.4 }]),
      3590,
    )
  })

  it('valores decimales redondean correctamente', () => {
    // 0.1 + 0.2 = 0.30000000000000004 en floating point. ×100 = 30.0000…04,
    // round() → 30.
    assert.equal(
      computeBookingTotalCentsFromRows(0.1, [{ priceEuros: 0.2 }]),
      30,
    )
  })
})

describe('computeBookingTotalCentsFromRows — ventas de productos NO suben el total', () => {
  it('el helper SOLO acepta extras de servicios; los productos NO entran (modelo separado)', () => {
    // Este test es documental: el shape de `extras` corresponde a
    // booking_services. Las ventas de productos viven en product_sales y
    // NO se pasan a este helper — la contabilidad de productos es paralela.
    // Si alguien intentara meterlas aquí, el TS chillaría (no hay campo
    // `quantity` ni `unitPriceCents` en el shape).
    //
    // Verificamos que 1 booking 25€ + 2 extras servicios produce el total
    // que el contrato /charge espera, independientemente de cualquier venta
    // de producto que pudiera existir asociada al booking en DB.
    assert.equal(
      computeBookingTotalCentsFromRows(25, [
        { priceEuros: 10 },
        { priceEuros: 5 },
      ]),
      4000,
    )
  })
})
