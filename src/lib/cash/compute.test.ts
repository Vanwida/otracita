import test from 'node:test'
import assert from 'node:assert/strict'
import {
  signedAmount,
  sumByMethod,
  computeExpectedClosing,
  computeDescuadre,
  isIncoming,
  type MovementForCompute,
} from './compute.ts'

// -----------------------------------------------------------------------------
// signedAmount + isIncoming — egresos negativos, ingresos positivos.
// -----------------------------------------------------------------------------

test('signedAmount: ingresos suman, egresos restan', () => {
  assert.equal(signedAmount({ kind: 'booking', amountCents: 2500 }), 2500)
  assert.equal(signedAmount({ kind: 'product_sale', amountCents: 1200 }), 1200)
  assert.equal(signedAmount({ kind: 'tip_cash', amountCents: 500 }), 500)
  assert.equal(signedAmount({ kind: 'deposit', amountCents: 1000 }), 1000)
  assert.equal(signedAmount({ kind: 'expense', amountCents: 800 }), -800)
  assert.equal(signedAmount({ kind: 'withdrawal', amountCents: 5000 }), -5000)
  assert.equal(signedAmount({ kind: 'adjustment', amountCents: 300 }), 300)
})

test('signedAmount: refund RESTA (devolución al cliente sale del cajón)', () => {
  // amount_cents siempre positivo; el signo negativo lo pone el kind.
  // Sin esto un reembolso sumaba al esperado y descuadraba al revés.
  assert.equal(signedAmount({ kind: 'refund', amountCents: 2500 }), -2500)
})

test('isIncoming flags positive vs negative kinds', () => {
  assert.equal(isIncoming('booking'), true)
  assert.equal(isIncoming('product_sale'), true)
  assert.equal(isIncoming('tip_cash'), true)
  assert.equal(isIncoming('deposit'), true)
  assert.equal(isIncoming('adjustment'), true)
  assert.equal(isIncoming('expense'), false)
  assert.equal(isIncoming('withdrawal'), false)
  assert.equal(isIncoming('refund'), false)
})

test('refund reduces expected closing (cash y card)', () => {
  // Venta de 25€ + reembolso de 10€ → esperado neto +15€ por método.
  const movs: MovementForCompute[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500 },
    { kind: 'refund', method: 'cash', amountCents: 1000 },
    { kind: 'booking', method: 'card', amountCents: 3000 },
    { kind: 'refund', method: 'card', amountCents: 1000 },
  ]
  const totals = sumByMethod(movs)
  assert.equal(totals.cashCents, 2500 - 1000) // 1500
  assert.equal(totals.cardCents, 3000 - 1000) // 2000

  // opening 50€ + 15€ cash neto = 65€; card neto 20€ (sin opening).
  const expected = computeExpectedClosing(5000, movs)
  assert.equal(expected.cashExpectedCents, 6500)
  assert.equal(expected.cardExpectedCents, 2000)
})

// -----------------------------------------------------------------------------
// sumByMethod — separa cash/card/online aplicando signo.
// -----------------------------------------------------------------------------

test('sumByMethod splits totals by method', () => {
  const movs: MovementForCompute[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500 },         // +25 cash
    { kind: 'booking', method: 'card', amountCents: 3000 },         // +30 card
    { kind: 'product_sale', method: 'cash', amountCents: 1200 },    // +12 cash
    { kind: 'tip_cash', method: 'cash', amountCents: 500 },         // +5 cash
    { kind: 'expense', method: 'cash', amountCents: 800 },          // -8 cash
    { kind: 'withdrawal', method: 'cash', amountCents: 5000 },      // -50 cash
    { kind: 'booking', method: 'online', amountCents: 4000 },       // +40 online
  ]
  const totals = sumByMethod(movs)
  assert.equal(totals.cashCents, 2500 + 1200 + 500 - 800 - 5000) // -1600
  assert.equal(totals.cardCents, 3000)
  assert.equal(totals.onlineCents, 4000)
})

test('sumByMethod on empty array returns zeros', () => {
  assert.deepEqual(sumByMethod([]), { cashCents: 0, cardCents: 0, onlineCents: 0 })
})

// -----------------------------------------------------------------------------
// computeExpectedClosing — opening solo aplica al efectivo.
// -----------------------------------------------------------------------------

test('computeExpectedClosing adds opening only to cash, not card or online', () => {
  const movs: MovementForCompute[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500 },
    { kind: 'booking', method: 'card', amountCents: 3000 },
    { kind: 'booking', method: 'online', amountCents: 1500 },
  ]
  const expected = computeExpectedClosing(5000, movs)
  // opening 50€ + 25€ cash = 75€
  assert.equal(expected.cashExpectedCents, 7500)
  assert.equal(expected.cardExpectedCents, 3000)
  assert.equal(expected.onlineExpectedCents, 1500)
})

test('computeExpectedClosing handles only-expenses scenario (cash goes below opening)', () => {
  const movs: MovementForCompute[] = [
    { kind: 'expense', method: 'cash', amountCents: 1500 }, // -15
  ]
  const expected = computeExpectedClosing(2000, movs)
  // 20€ - 15€ = 5€
  assert.equal(expected.cashExpectedCents, 500)
})

// -----------------------------------------------------------------------------
// computeDescuadre — counted - expected.
// -----------------------------------------------------------------------------

test('computeDescuadre returns null when counted is null', () => {
  assert.equal(computeDescuadre(5000, null), null)
})

test('computeDescuadre = counted - expected (positive = sobra, negative = falta)', () => {
  assert.equal(computeDescuadre(5000, 5000), 0)   // exacto
  assert.equal(computeDescuadre(5000, 5200), 200)  // sobran 2€
  assert.equal(computeDescuadre(5000, 4800), -200) // faltan 2€
})

// -----------------------------------------------------------------------------
// End-to-end realista de un día.
// -----------------------------------------------------------------------------

test('e2e: día típico con 3 cortes, 1 producto, 1 propina cash, 1 gasto, 1 retirada', () => {
  const opening = 5000 // 50€ de cambio inicial
  const movs: MovementForCompute[] = [
    // Mañana
    { kind: 'booking', method: 'cash', amountCents: 2000 },         // 20€ corte 1
    { kind: 'booking', method: 'card', amountCents: 2500 },         // 25€ corte 2
    { kind: 'product_sale', method: 'cash', amountCents: 1200 },    // 12€ cera
    { kind: 'tip_cash', method: 'cash', amountCents: 300 },         // 3€ propina
    // Tarde
    { kind: 'expense', method: 'cash', amountCents: 350 },          // 3,50€ café
    { kind: 'booking', method: 'online', amountCents: 3000 },       // 30€ online
    { kind: 'withdrawal', method: 'cash', amountCents: 5000 },      // 50€ al banco
  ]
  const expected = computeExpectedClosing(opening, movs)

  // Cash: 50 + 20 + 12 + 3 - 3.50 - 50 = 31.50€
  assert.equal(expected.cashExpectedCents, 5000 + 2000 + 1200 + 300 - 350 - 5000)
  assert.equal(expected.cashExpectedCents, 3150)

  // Card: 25€
  assert.equal(expected.cardExpectedCents, 2500)

  // Online: 30€
  assert.equal(expected.onlineExpectedCents, 3000)

  // Cierre: barbero cuenta 31,40€ en cajón (faltan 10c) y datáfono dice 25€ exacto
  const cashDesc = computeDescuadre(expected.cashExpectedCents, 3140)
  const cardDesc = computeDescuadre(expected.cardExpectedCents, 2500)
  assert.equal(cashDesc, -10)
  assert.equal(cardDesc, 0)
})
