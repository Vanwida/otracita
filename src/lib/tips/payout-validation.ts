// -----------------------------------------------------------------------------
// Validación pura del payload de POST /api/tips/payout y /payout/undo
// (épica Reni #28 parte 3b). Extraído de la route handler para testearlo
// sin levantar DB/auth — sigue el patrón de `charge-validation.ts`.
//
// Dos validadores: el de body (forma del JSON) y el de filas cargadas
// (estado de las propinas vs el método pedido).
// -----------------------------------------------------------------------------

export type PayoutMethod = 'cash' | 'transfer' | 'card_payroll'

const VALID_METHODS: ReadonlySet<PayoutMethod> = new Set([
  'cash',
  'transfer',
  'card_payroll',
])

export const PAYOUT_BATCH_LIMIT = 100

export interface PayoutBodyOk {
  ok: true
  tipIds: string[]
  method: PayoutMethod
}

export interface PayoutBodyErr {
  ok: false
  status: 400
  error: string
}

/** Valida body de POST /api/tips/payout. */
export function validatePayoutBody(body: unknown): PayoutBodyOk | PayoutBodyErr {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, status: 400, error: 'JSON inválido' }
  }
  const b = body as { tipIds?: unknown; method?: unknown }

  if (
    typeof b.method !== 'string' ||
    !VALID_METHODS.has(b.method as PayoutMethod)
  ) {
    return {
      ok: false,
      status: 400,
      error: "Método inválido. Esperado 'cash' | 'transfer' | 'card_payroll'.",
    }
  }

  if (!Array.isArray(b.tipIds) || b.tipIds.length === 0) {
    return { ok: false, status: 400, error: 'tipIds requerido (≥1).' }
  }
  if (b.tipIds.length > PAYOUT_BATCH_LIMIT) {
    return {
      ok: false,
      status: 400,
      error: `Máximo ${PAYOUT_BATCH_LIMIT} propinas por lote.`,
    }
  }

  const tipIds: string[] = []
  for (const raw of b.tipIds) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { ok: false, status: 400, error: 'tipIds inválido.' }
    }
    tipIds.push(raw.trim())
  }

  return { ok: true, tipIds, method: b.method as PayoutMethod }
}

/** Valida body de POST /api/tips/payout/undo (sin method). */
export interface UndoBodyOk {
  ok: true
  tipIds: string[]
}
export function validateUndoBody(body: unknown): UndoBodyOk | PayoutBodyErr {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, status: 400, error: 'JSON inválido' }
  }
  const b = body as { tipIds?: unknown }

  if (!Array.isArray(b.tipIds) || b.tipIds.length === 0) {
    return { ok: false, status: 400, error: 'tipIds requerido (≥1).' }
  }
  if (b.tipIds.length > PAYOUT_BATCH_LIMIT) {
    return {
      ok: false,
      status: 400,
      error: `Máximo ${PAYOUT_BATCH_LIMIT} propinas por lote.`,
    }
  }
  const tipIds: string[] = []
  for (const raw of b.tipIds) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { ok: false, status: 400, error: 'tipIds inválido.' }
    }
    tipIds.push(raw.trim())
  }
  return { ok: true, tipIds }
}

// -----------------------------------------------------------------------------
// Validación del estado de las filas cargadas vs el método pedido.
//
// Devuelve null si todo OK; objeto con error + status si algo no cumple. Los
// callers (route handler) traducen a Response.json.
// -----------------------------------------------------------------------------

export interface PayoutTipRow {
  /** id de la propina (para mensajes; no se expone). */
  id: string
  /** 'paid' | 'pending' | 'expired' | etc. — solo aceptamos 'paid'. */
  status: string
  /** 'cash' | 'card' | null (legacy = card implícito). */
  paymentMethod: string | null
  /** Si ya estaba marcada como pagada al barbero. */
  paidOutAt: Date | null
}

export interface ValidationError {
  status: 400 | 404 | 409
  error: string
}

/**
 * Valida que las filas cargadas estén en estado consistente con la operación
 * /payout. `expectedCount` = `tipIds.length` (el caller ya validó length>0).
 */
export function validatePayoutRows(
  rows: PayoutTipRow[],
  expectedCount: number,
  method: PayoutMethod,
): ValidationError | null {
  if (rows.length !== expectedCount) {
    // Alguna tip no existe (o no es del tenant — el caller filtra por
    // client_id antes de llamar). 404 sin revelar cuál.
    return {
      status: 404,
      error: 'Una o más propinas no existen en esta barbería.',
    }
  }

  for (const row of rows) {
    if (row.status !== 'paid') {
      return {
        status: 409,
        error: 'Solo se pueden liquidar propinas con estado "paid".',
      }
    }
    if (row.paidOutAt !== null) {
      return {
        status: 409,
        error: 'Una o más propinas ya están marcadas como pagadas.',
      }
    }
    if (method === 'card_payroll' && row.paymentMethod !== 'card') {
      return {
        status: 400,
        error:
          "El método 'card_payroll' solo aplica a propinas de tarjeta (las cash ya están entregadas).",
      }
    }
  }

  return null
}
