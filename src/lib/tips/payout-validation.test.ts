import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePayoutBody,
  validateUndoBody,
  validatePayoutRows,
  PAYOUT_BATCH_LIMIT,
  type PayoutTipRow,
} from './payout-validation.ts'

// -----------------------------------------------------------------------------
// Tests del validador de payload de /api/tips/payout y /payout/undo.
// (épica Reni #28 parte 3b 2026-05-22). Cubre:
//   · forma del body (tipIds + method)
//   · estado de las filas cargadas (tenant mismatch, idempotencia, card_payroll
//     solo aplica a paymentMethod=card).
// -----------------------------------------------------------------------------

describe('validatePayoutBody — happy paths', () => {
  test('válido: 1 tipId + cash', () => {
    const r = validatePayoutBody({ tipIds: ['t-1'], method: 'cash' })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.deepEqual(r.tipIds, ['t-1'])
      assert.equal(r.method, 'cash')
    }
  })
  test('válido: 3 tipIds + transfer', () => {
    const r = validatePayoutBody({
      tipIds: ['a', 'b', 'c'],
      method: 'transfer',
    })
    assert.equal(r.ok, true)
  })
  test('válido: card_payroll', () => {
    const r = validatePayoutBody({ tipIds: ['t-1'], method: 'card_payroll' })
    assert.equal(r.ok, true)
  })
  test('trim whitespace de ids', () => {
    const r = validatePayoutBody({ tipIds: ['  t-1  '], method: 'cash' })
    assert.equal(r.ok, true)
    if (r.ok) assert.deepEqual(r.tipIds, ['t-1'])
  })
})

describe('validatePayoutBody — rechazos', () => {
  test('body no es objeto', () => {
    const r = validatePayoutBody(null)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.status, 400)
  })
  test('method ausente', () => {
    const r = validatePayoutBody({ tipIds: ['t-1'] })
    assert.equal(r.ok, false)
  })
  test('method desconocido', () => {
    const r = validatePayoutBody({ tipIds: ['t-1'], method: 'wire' })
    assert.equal(r.ok, false)
  })
  test('tipIds vacío', () => {
    const r = validatePayoutBody({ tipIds: [], method: 'cash' })
    assert.equal(r.ok, false)
  })
  test('tipIds no array', () => {
    const r = validatePayoutBody({ tipIds: 't-1', method: 'cash' })
    assert.equal(r.ok, false)
  })
  test('tipIds excede límite', () => {
    const big = Array.from({ length: PAYOUT_BATCH_LIMIT + 1 }, (_, i) => `t-${i}`)
    const r = validatePayoutBody({ tipIds: big, method: 'cash' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /Máximo/)
  })
  test('tipIds contiene non-string', () => {
    const r = validatePayoutBody({ tipIds: ['t-1', 42], method: 'cash' })
    assert.equal(r.ok, false)
  })
  test('tipIds contiene string vacío', () => {
    const r = validatePayoutBody({ tipIds: ['t-1', '   '], method: 'cash' })
    assert.equal(r.ok, false)
  })
})

describe('validateUndoBody', () => {
  test('válido: solo tipIds', () => {
    const r = validateUndoBody({ tipIds: ['t-1'] })
    assert.equal(r.ok, true)
  })
  test('rechaza vacío', () => {
    const r = validateUndoBody({ tipIds: [] })
    assert.equal(r.ok, false)
  })
  test('rechaza exceso límite', () => {
    const big = Array.from({ length: PAYOUT_BATCH_LIMIT + 1 }, (_, i) => `t-${i}`)
    const r = validateUndoBody({ tipIds: big })
    assert.equal(r.ok, false)
  })
})

describe('validatePayoutRows — tenant + estado + idempotencia', () => {
  const baseRow = (overrides: Partial<PayoutTipRow> = {}): PayoutTipRow => ({
    id: 't-1',
    status: 'paid',
    paymentMethod: 'card',
    paidOutAt: null,
    ...overrides,
  })

  it('ok: una fila válida + method cash', () => {
    const r = validatePayoutRows([baseRow()], 1, 'cash')
    assert.equal(r, null)
  })

  it('ok: card_payroll sobre paymentMethod=card', () => {
    const r = validatePayoutRows(
      [baseRow({ paymentMethod: 'card' })],
      1,
      'card_payroll',
    )
    assert.equal(r, null)
  })

  it('404: tenant mismatch (rows.length < expected)', () => {
    // Simula: pidió 2 ids, la DB devolvió 1 (la otra no es del tenant).
    const r = validatePayoutRows([baseRow()], 2, 'cash')
    assert.notEqual(r, null)
    if (r) {
      assert.equal(r.status, 404)
      assert.match(r.error, /no existen/)
    }
  })

  it('409: una propina ya está marcada como pagada (idempotencia)', () => {
    const r = validatePayoutRows(
      [baseRow(), baseRow({ id: 't-2', paidOutAt: new Date() })],
      2,
      'cash',
    )
    assert.notEqual(r, null)
    if (r) assert.equal(r.status, 409)
  })

  it('409: status != paid (no se puede liquidar un pending)', () => {
    const r = validatePayoutRows(
      [baseRow({ status: 'pending' })],
      1,
      'cash',
    )
    assert.notEqual(r, null)
    if (r) assert.equal(r.status, 409)
  })

  it('400: card_payroll con tip cash → rechazo', () => {
    const r = validatePayoutRows(
      [baseRow({ paymentMethod: 'cash' })],
      1,
      'card_payroll',
    )
    assert.notEqual(r, null)
    if (r) {
      assert.equal(r.status, 400)
      assert.match(r.error, /card_payroll/)
    }
  })

  it('400: card_payroll con tip legacy NULL → rechazo (sin paymentMethod canónico)', () => {
    // Diseño: card_payroll exige paymentMethod EXPLÍCITO = 'card'. Las legacy
    // NULL se rechazan adrede — el jefe debería corregir el método primero
    // (vía PATCH /api/tips/[id]) si quiere meterla en nómina. Evita ambigüedad.
    const r = validatePayoutRows(
      [baseRow({ paymentMethod: null })],
      1,
      'card_payroll',
    )
    assert.notEqual(r, null)
    if (r) assert.equal(r.status, 400)
  })

  it('ok: cash method acepta tip cash', () => {
    const r = validatePayoutRows(
      [baseRow({ paymentMethod: 'cash' })],
      1,
      'cash',
    )
    assert.equal(r, null)
  })

  it('ok: transfer method acepta cualquier paymentMethod', () => {
    const r = validatePayoutRows(
      [
        baseRow({ paymentMethod: 'card', id: 'a' }),
        baseRow({ paymentMethod: 'cash', id: 'b' }),
        baseRow({ paymentMethod: null, id: 'c' }),
      ],
      3,
      'transfer',
    )
    assert.equal(r, null)
  })
})
