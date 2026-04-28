import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findBestMatch,
  isMatch,
  sumupAmountToCents,
  type MovementMatchCandidate,
  type SumupTransactionForMatch,
} from './match.ts'

const NOW = new Date('2026-04-27T17:35:00Z')

function candidate(overrides: Partial<MovementMatchCandidate>): MovementMatchCandidate {
  return {
    id: 'mov-1',
    amountCents: 2500,
    createdAt: NOW,
    method: 'card',
    sumupTransactionId: null,
    ...overrides,
  }
}

const tx: SumupTransactionForMatch = {
  amountCents: 2500,
  timestamp: NOW,
}

// -----------------------------------------------------------------------------
// isMatch — reglas individuales
// -----------------------------------------------------------------------------

test('isMatch: candidato ya asignado no hace match', () => {
  assert.equal(isMatch(tx, candidate({ sumupTransactionId: 'sumup-X' })), false)
})

test('isMatch: candidato con method != card no hace match', () => {
  assert.equal(isMatch(tx, candidate({ method: 'cash' })), false)
})

test('isMatch: dentro de ventana ±15min sí hace match', () => {
  const c = candidate({ createdAt: new Date(NOW.getTime() - 14 * 60 * 1000) })
  assert.equal(isMatch(tx, c), true)
})

test('isMatch: fuera de ventana ±15min NO hace match', () => {
  const c = candidate({ createdAt: new Date(NOW.getTime() - 16 * 60 * 1000) })
  assert.equal(isMatch(tx, c), false)
})

test('isMatch: amounts iguales hacen match', () => {
  assert.equal(isMatch(tx, candidate({ amountCents: 2500 })), true)
})

test('isMatch: SumUp con propina (mayor) sí hace match con candidato menor', () => {
  // SumUp 27€ (25 corte + 2 propina), candidato 25€ → match
  const txWithTip: SumupTransactionForMatch = { amountCents: 2700, timestamp: NOW }
  assert.equal(isMatch(txWithTip, candidate({ amountCents: 2500 })), true)
})

test('isMatch: candidato MAYOR que SumUp NO hace match (no tiene sentido)', () => {
  // SumUp 25€, candidato 30€ — el manual no puede ser mayor que el cobrado real
  const c = candidate({ amountCents: 3000 })
  assert.equal(isMatch(tx, c), false)
})

test('isMatch: candidato más del 10% inferior NO hace match (ruido)', () => {
  // SumUp 25€ → mínimo aceptable 22.50€. Candidato 20€ → fuera
  const c = candidate({ amountCents: 2000 })
  assert.equal(isMatch(tx, c), false)
})

// -----------------------------------------------------------------------------
// findBestMatch — selección entre múltiples candidatos
// -----------------------------------------------------------------------------

test('findBestMatch: sin candidatos devuelve null', () => {
  assert.equal(findBestMatch(tx, []), null)
})

test('findBestMatch: un único candidato válido lo elige', () => {
  const c = candidate({ id: 'only' })
  assert.equal(findBestMatch(tx, [c])?.id, 'only')
})

test('findBestMatch: entre 2 candidatos válidos elige el más cercano en tiempo', () => {
  const c1 = candidate({
    id: 'far',
    createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
  })
  const c2 = candidate({
    id: 'close',
    createdAt: new Date(NOW.getTime() - 2 * 60 * 1000),
  })
  assert.equal(findBestMatch(tx, [c1, c2])?.id, 'close')
})

test('findBestMatch: ignora candidatos ya asignados aunque coincidan', () => {
  const cTaken = candidate({ id: 'taken', sumupTransactionId: 'sumup-Y' })
  const cFree = candidate({ id: 'free' })
  assert.equal(findBestMatch(tx, [cTaken, cFree])?.id, 'free')
})

// -----------------------------------------------------------------------------
// sumupAmountToCents — float safety
// -----------------------------------------------------------------------------

test('sumupAmountToCents: redondea correctamente importes con decimales', () => {
  assert.equal(sumupAmountToCents(25.00), 2500)
  assert.equal(sumupAmountToCents(25.50), 2550)
  assert.equal(sumupAmountToCents(25.99), 2599)
  // Float drift edge case
  assert.equal(sumupAmountToCents(0.1 + 0.2), 30) // 0.30000000000000004 → 30
})
