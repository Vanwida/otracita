import { SumupApiError } from '@/lib/sumup/client'

// -----------------------------------------------------------------------------
// SumUp — reembolso de una transaction.
//
//   POST https://api.sumup.com/v0.1/me/refund/{txn_id}
//   · body vacío           → reembolso TOTAL
//   · body { amount }       → reembolso PARCIAL (importe en EUROS, no minor unit)
//   · respuesta 204         → OK (sin cuerpo)
//   · Auth: Bearer access_token del Authorization-code flow (el del barbero,
//     el mismo que ya usamos para iniciar checkouts). El client-credentials
//     flow NO sirve para reembolsar.
//
// {txn_id} = el SumUp TRANSACTION id (uuid), NO el transaction_code legible.
// En nuestro modelo lo guardamos en cash_movements.sumup_transaction_id al
// registrar el cobro original (record-checkout.ts).
//
// Doc: https://developer.sumup.com/online-payments/guides/refund
//
// Idempotencia: SumUp no expone Idempotency-Key aquí. Un segundo POST sobre
// una tx ya reembolsada devuelve error (4xx). Tratamos ese caso como éxito
// idempotente vía `alreadyRefunded` para que el reintento del barbero no
// rompa — el dinero ya volvió al cliente.
// -----------------------------------------------------------------------------

const SUMUP_BASE = 'https://api.sumup.com'

export interface SumupRefundInput {
  /** access_token válido del barbero (usar ensureValidAccessToken antes). */
  token: string
  /** SumUp transaction id (uuid) del cobro original. */
  transactionId: string
  /** Parcial en EUROS (SumUp espera euros aquí, no céntimos). Omitir = total. */
  amountEuros?: number | null
}

export interface SumupRefundResult {
  /** true si el reembolso se aplicó ahora (204). */
  refunded: boolean
  /** true si SumUp dice que ya estaba reembolsada → éxito idempotente. */
  alreadyRefunded: boolean
}

export async function refundSumupTransaction(
  input: SumupRefundInput,
): Promise<SumupRefundResult> {
  if (!input.transactionId) {
    throw new SumupApiError(400, 'Falta la transacción SumUp a reembolsar.')
  }

  const hasPartial =
    typeof input.amountEuros === 'number' &&
    Number.isFinite(input.amountEuros) &&
    input.amountEuros > 0

  const res = await fetch(
    `${SUMUP_BASE}/v0.1/me/refund/${encodeURIComponent(input.transactionId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      // Total → sin body. Parcial → { amount } en euros.
      body: hasPartial ? JSON.stringify({ amount: input.amountEuros }) : undefined,
      cache: 'no-store',
    },
  )

  if (res.status === 204 || res.ok) {
    return { refunded: true, alreadyRefunded: false }
  }

  const text = await res.text().catch(() => '')
  // SumUp marca una tx ya reembolsada con 409/422 y un código tipo
  // TRANSACTION_ALREADY_REFUNDED / CONFLICT. Lo tratamos como idempotente:
  // el dinero ya volvió, el caller debe seguir y reconciliar caja igual.
  const lowered = text.toLowerCase()
  if (
    res.status === 409 ||
    lowered.includes('already') ||
    lowered.includes('refunded')
  ) {
    return { refunded: false, alreadyRefunded: true }
  }

  throw new SumupApiError(
    res.status,
    `SumUp refund ${res.status}: ${text.slice(0, 300)}`,
    text,
  )
}
