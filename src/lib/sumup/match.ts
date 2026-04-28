// -----------------------------------------------------------------------------
// SumUp transaction matching — funciones puras para enlazar una transaction
// del datáfono físico con un cash_movement manual ya creado.
//
// El barbero hoy:
//   1. Marca cita "completada" → modal cobro → elige "tarjeta"
//   2. Eso crea un movement manual con method='card' y el price del booking
//   3. Pasa la tarjeta por su SumUp Reader → SumUp procesa
//   4. 5-10 min después, polling trae la transaction → debe LINK a (2)
//
// La heurística de match es defensiva:
//   · Mismo método (card)
//   · Mismo currency (EUR)
//   · Importe entre [sumup × 0.9, sumup] — absorbe propinas en SumUp
//   · Timestamp ± 15 min de la transaction
//   · Movement aún sin sumup_transaction_id (no asignado)
//
// Si match → UPDATE el movement con sumup_transaction_id Y corregir amount
// a la cifra real de SumUp. Si no match → INSERT movement standalone.
// -----------------------------------------------------------------------------

export interface MovementMatchCandidate {
  id: string
  amountCents: number
  createdAt: Date
  method: string
  sumupTransactionId: string | null
}

export interface SumupTransactionForMatch {
  amountCents: number          // ya en cents (convertido desde euros)
  timestamp: Date
}

const TIME_WINDOW_MS = 15 * 60 * 1000           // ±15 min
const TIP_TOLERANCE = 0.10                       // hasta 10% más en SumUp (propina añadida)

/**
 * Busca el mejor match entre una transaction SumUp y una lista de candidates.
 * Devuelve el movement.id que debe actualizarse, o null si no hay match.
 *
 * Si hay varios candidatos posibles, elige el de timestamp más cercano a
 * la transaction. Esto reduce ambigüedad cuando 2 cortes a precios
 * idénticos cerca en el tiempo.
 */
export function findBestMatch(
  tx: SumupTransactionForMatch,
  candidates: readonly MovementMatchCandidate[],
): MovementMatchCandidate | null {
  const matches = candidates.filter((c) => isMatch(tx, c))
  if (matches.length === 0) return null
  // Más cercano en tiempo a la transaction
  return matches.reduce((best, curr) => {
    const dBest = Math.abs(best.createdAt.getTime() - tx.timestamp.getTime())
    const dCurr = Math.abs(curr.createdAt.getTime() - tx.timestamp.getTime())
    return dCurr < dBest ? curr : best
  })
}

/**
 * Decide si una transaction y un movement candidato son la misma operación.
 * Reglas:
 *  · No asignado todavía (sumupTransactionId null) — sino ya tiene match
 *  · method='card'
 *  · Ventana temporal ±15 min
 *  · Amount: el manual debe ser ≤ que SumUp y ≥ SumUp×(1-0.10).
 *    Razón: SumUp puede traer propina añadida → será MAYOR. Nunca menor.
 */
export function isMatch(
  tx: SumupTransactionForMatch,
  candidate: MovementMatchCandidate,
): boolean {
  if (candidate.sumupTransactionId !== null) return false
  if (candidate.method !== 'card') return false

  const dt = Math.abs(candidate.createdAt.getTime() - tx.timestamp.getTime())
  if (dt > TIME_WINDOW_MS) return false

  const minAcceptable = Math.round(tx.amountCents * (1 - TIP_TOLERANCE))
  if (candidate.amountCents > tx.amountCents) return false  // manual > sumup → no match
  if (candidate.amountCents < minAcceptable) return false   // demasiado pequeño
  return true
}

/**
 * Convierte el amount de SumUp (devuelto en EUROS según docs) a cents.
 * SumUp puede devolver decimales (25.00, 25.50) → multiplicamos × 100 y
 * redondeamos para evitar drift de float.
 */
export function sumupAmountToCents(amount: number): number {
  return Math.round(amount * 100)
}
