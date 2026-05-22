import test from 'node:test'
import assert from 'node:assert/strict'
import {
  summariseByMethod,
  summariseByKind,
  summariseByBarber,
  buildMovementBreakdown,
  type MovementForBreakdown,
} from './breakdown.ts'

// -----------------------------------------------------------------------------
// summariseByMethod — totales firmados + incoming/outgoing + counts.
// -----------------------------------------------------------------------------

test('summariseByMethod: cash incoming + outgoing separados, neto correcto', () => {
  const m: MovementForBreakdown[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500, barberId: 'a' },
    { kind: 'tip_cash', method: 'cash', amountCents: 500, barberId: 'a' },
    { kind: 'expense', method: 'cash', amountCents: 800, barberId: null },
    { kind: 'withdrawal', method: 'cash', amountCents: 1000, barberId: null },
  ]
  const rows = summariseByMethod(m)
  const cash = rows.find((r) => r.method === 'cash')!
  assert.equal(cash.netCents, 2500 + 500 - 800 - 1000)
  assert.equal(cash.incomingCents, 3000)
  assert.equal(cash.outgoingCents, 1800)
  assert.equal(cash.count, 4)
})

test('summariseByMethod: orden estable cash → card → online aun sin movimientos', () => {
  const rows = summariseByMethod([])
  assert.deepEqual(
    rows.map((r) => r.method),
    ['cash', 'card', 'online'],
  )
  assert.equal(rows[0].count, 0)
  assert.equal(rows[1].netCents, 0)
})

test('summariseByMethod: refund cuenta como egreso (resta al neto)', () => {
  const m: MovementForBreakdown[] = [
    { kind: 'booking', method: 'card', amountCents: 3000, barberId: 'a' },
    { kind: 'refund', method: 'card', amountCents: 1000, barberId: 'a' },
  ]
  const rows = summariseByMethod(m)
  const card = rows.find((r) => r.method === 'card')!
  assert.equal(card.netCents, 2000)
  assert.equal(card.incomingCents, 3000)
  assert.equal(card.outgoingCents, 1000)
})

// -----------------------------------------------------------------------------
// summariseByKind — agrupa, firma, ordena (incoming primero, luego egresos).
// -----------------------------------------------------------------------------

test('summariseByKind: agrupa por kind con neto firmado', () => {
  const m: MovementForBreakdown[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500, barberId: 'a' },
    { kind: 'booking', method: 'card', amountCents: 4000, barberId: 'b' },
    { kind: 'expense', method: 'cash', amountCents: 800, barberId: null },
  ]
  const rows = summariseByKind(m)
  const booking = rows.find((r) => r.kind === 'booking')!
  assert.equal(booking.netCents, 6500)
  assert.equal(booking.count, 2)
  const expense = rows.find((r) => r.kind === 'expense')!
  assert.equal(expense.netCents, -800)
  // Incoming antes que outgoing en el orden.
  assert.ok(rows.indexOf(booking) < rows.indexOf(expense))
})

// -----------------------------------------------------------------------------
// summariseByBarber — split por método, "Sin asignar" al final.
// -----------------------------------------------------------------------------

test('summariseByBarber: agrupa por barbero con split por método', () => {
  const names = new Map([
    ['a', 'Reni'],
    ['b', 'Pablo'],
  ])
  const m: MovementForBreakdown[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500, barberId: 'a' },
    { kind: 'booking', method: 'card', amountCents: 3000, barberId: 'a' },
    { kind: 'tip_cash', method: 'cash', amountCents: 500, barberId: 'a' },
    { kind: 'booking', method: 'card', amountCents: 4000, barberId: 'b' },
    { kind: 'expense', method: 'cash', amountCents: 1000, barberId: null },
  ]
  const rows = summariseByBarber(m, names)
  // 3 filas: Reni, Pablo, Sin asignar.
  assert.equal(rows.length, 3)
  const reni = rows.find((r) => r.barberId === 'a')!
  assert.equal(reni.barberName, 'Reni')
  assert.equal(reni.cashCents, 3000)
  assert.equal(reni.cardCents, 3000)
  assert.equal(reni.totalCents, 6000)
  assert.equal(reni.count, 3)
  // El barbero con MÁS total va primero.
  assert.equal(rows[0].barberId, 'a')
  // "Sin asignar" siempre va al final.
  assert.equal(rows[rows.length - 1].barberId, null)
})

// -----------------------------------------------------------------------------
// buildMovementBreakdown — composición + flag unknownMethodCount.
// -----------------------------------------------------------------------------

test('buildMovementBreakdown: marca movimientos con método legacy/NULL', () => {
  const m: MovementForBreakdown[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500, barberId: 'a' },
    // Simulamos un legacy con method inválido. El cast es deliberado para el test.
    { kind: 'booking', method: 'unknown' as 'cash', amountCents: 1000, barberId: null },
  ]
  const out = buildMovementBreakdown(m)
  assert.equal(out.unknownMethodCount, 1)
  // El movimiento legacy NO entra en byMethod (no contamina cuadre)…
  const cash = out.byMethod.find((r) => r.method === 'cash')!
  assert.equal(cash.netCents, 2500)
  // …pero SÍ aparece en byKind (el agregado por tipo es agnóstico de método).
  const booking = out.byKind.find((r) => r.kind === 'booking')!
  assert.equal(booking.netCents, 3500)
})

test('buildMovementBreakdown: totals globales (incoming/outgoing/net) sin contar unknown', () => {
  const m: MovementForBreakdown[] = [
    { kind: 'booking', method: 'cash', amountCents: 2500, barberId: 'a' },
    { kind: 'booking', method: 'card', amountCents: 4000, barberId: 'a' },
    { kind: 'expense', method: 'cash', amountCents: 800, barberId: null },
    { kind: 'withdrawal', method: 'cash', amountCents: 500, barberId: null },
    { kind: 'booking', method: 'unknown' as 'cash', amountCents: 999, barberId: null },
  ]
  const out = buildMovementBreakdown(m)
  assert.equal(out.totals.incomingCents, 2500 + 4000)
  assert.equal(out.totals.outgoingCents, 800 + 500)
  assert.equal(out.totals.netCents, 6500 - 1300)
})
