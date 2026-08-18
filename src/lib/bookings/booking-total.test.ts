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
// "sum_mismatch" sin razón aparente. Los tests cubren los vectores que
// causaron bugs históricos: extras multi-servicio (R7), cortesía (priceCents
// null), separación de productos (ventas paralelas que NO suben el total) y
// precios con decimales (L-05: Reni cobra 12,50 y 17,50).
// -----------------------------------------------------------------------------

describe('computeBookingTotalCentsFromRows — caso simple (sin extras)', () => {
  it('booking 25 € (2500c) sin extras → 2500 céntimos', () => {
    assert.equal(computeBookingTotalCentsFromRows(2500, []), 2500)
  })

  it('booking 0 sin extras → 0', () => {
    assert.equal(computeBookingTotalCentsFromRows(0, []), 0)
  })

  it('booking null sin extras → 0 (cita sin importe, p.ej. legacy)', () => {
    assert.equal(computeBookingTotalCentsFromRows(null, []), 0)
  })

  it('booking undefined sin extras → 0', () => {
    assert.equal(computeBookingTotalCentsFromRows(undefined, []), 0)
  })

  it('booking 99 € (9900c) sin extras → 9900 (no overflow ni mantissa raro)', () => {
    assert.equal(computeBookingTotalCentsFromRows(9900, []), 9900)
  })
})

describe('computeBookingTotalCentsFromRows — multi-servicio R7 (extras)', () => {
  it('corte 25 € + barba 10 € → 3500', () => {
    assert.equal(computeBookingTotalCentsFromRows(2500, [{ priceCents: 1000 }]), 3500)
  })

  it('corte 25 € + barba 10 € + cejas 5 € → 4000 (3 servicios)', () => {
    assert.equal(
      computeBookingTotalCentsFromRows(2500, [
        { priceCents: 1000 },
        { priceCents: 500 },
      ]),
      4000,
    )
  })

  it('extras a 0 no afectan al total', () => {
    assert.equal(computeBookingTotalCentsFromRows(2500, [{ priceCents: 0 }]), 2500)
  })

  it('extra null (cortesía) NO suma ni resta', () => {
    // priceCents NULL = cortesía deliberada (el barbero regala el servicio).
    assert.equal(
      computeBookingTotalCentsFromRows(2500, [
        { priceCents: null },
        { priceCents: 1000 },
      ]),
      3500,
    )
  })

  it('extra negativo (datos sucios) NO resta del total', () => {
    // Defensivo: si alguien metió priceCents=-500 por error en DB, NO restar.
    assert.equal(computeBookingTotalCentsFromRows(2500, [{ priceCents: -500 }]), 2500)
  })
})

// -----------------------------------------------------------------------------
// L-05 — el motivo por el que este helper existe en céntimos.
//
// Antes `bookings.price` era INTEGER en EUROS: 12,50 € se truncaba en el
// INSERT y la factura decía 13,00 €. Ahora el importe llega ya en céntimos y
// la suma es exacta — no hay ningún punto donde se pueda perder medio euro.
// -----------------------------------------------------------------------------
describe('computeBookingTotalCentsFromRows — precios con decimales (L-05)', () => {
  it('servicio de 12,50 € → 1250, NO 1300', () => {
    assert.equal(computeBookingTotalCentsFromRows(1250, []), 1250)
  })

  it('12,50 € + extra 17,50 € → 3000 exactos', () => {
    assert.equal(computeBookingTotalCentsFromRows(1250, [{ priceCents: 1750 }]), 3000)
  })

  it('tres importes con céntimos impares suman sin deriva', () => {
    // 12,35 + 7,45 + 0,99 = 20,79 €. En euros-float esto arrastraba error;
    // en céntimos enteros la suma es exacta por construcción.
    assert.equal(
      computeBookingTotalCentsFromRows(1235, [{ priceCents: 745 }, { priceCents: 99 }]),
      2079,
    )
  })

  it('céntimos fraccionarios (datos sucios) se redondean, no se truncan', () => {
    assert.equal(computeBookingTotalCentsFromRows(1250.6, []), 1251)
  })
})

describe('computeBookingTotalCentsFromRows — ventas de productos NO suben el total', () => {
  it('el helper SOLO acepta extras de servicios; los productos NO entran (modelo separado)', () => {
    // Este test es documental: el shape de `extras` corresponde a
    // booking_services. Las ventas de productos viven en product_sales y
    // NO se pasan a este helper — la contabilidad de productos es paralela.
    // Si alguien intentara meterlas aquí, el TS chillaría (no hay campo
    // `quantity` ni `unitPriceCents` en el shape).
    assert.equal(
      computeBookingTotalCentsFromRows(2500, [
        { priceCents: 1000 },
        { priceCents: 500 },
      ]),
      4000,
    )
  })
})
