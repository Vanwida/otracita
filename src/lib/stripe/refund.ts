import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'

// -----------------------------------------------------------------------------
// Stripe Connect — reembolso de un destination charge.
//
// Nuestro flujo de cobro (src/app/api/payments/create-link) crea un
// destination charge: el cargo vive en la plataforma con
// `transfer_data.destination = cuenta Connect del barbero` y un
// `application_fee_amount` (0% en piloto, configurable).
//
// Para que los LIBROS DEL BARBERO queden correctos al reembolsar hay que:
//   · refund.charge        = el charge original (NO el payment_intent — para
//                            destination charges se reembolsa el charge).
//   · reverse_transfer     = true → recupera del barbero el dinero que se le
//                            transfirió (si no, la plataforma se come el
//                            negativo y el barbero se queda el cobro).
//   · refund_application_fee = true → devuelve proporcionalmente la comisión
//                            de plataforma. Con fee 0% es no-op, pero lo
//                            dejamos SIEMPRE true para que el día que el fee
//                            sea >0 el reembolso no descuadre (la comisión
//                            se reembolsa proporcional al importe devuelto).
//   · amount (opcional)    = parcial en céntimos. Sin amount = total.
//
// Idempotencia: `Idempotency-Key` por (paymentId + amount). Reintentos de red
// o doble click NO crean dos refunds — Stripe devuelve el mismo objeto.
// Doc: https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes
// -----------------------------------------------------------------------------

export interface StripeRefundInput {
  /** Charge id `ch_…` / `py_…` que guardamos en payments.stripeChargeId. */
  chargeId: string
  /** Parcial en céntimos. Omitir / null = reembolso TOTAL. */
  amountCents?: number | null
  /** Clave de idempotencia estable para esta operación de reembolso. */
  idempotencyKey: string
  /** Auditoría: queda en refund.metadata para conciliar desde el Dashboard. */
  metadata?: Record<string, string>
}

export interface StripeRefundResult {
  refundId: string
  status: Stripe.Refund['status']
  amountCents: number
}

export class StripeRefundError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'StripeRefundError'
  }
}

export async function refundStripeCharge(
  input: StripeRefundInput,
): Promise<StripeRefundResult> {
  if (!input.chargeId) {
    throw new StripeRefundError('Falta el cargo de Stripe a reembolsar.')
  }

  const params: Stripe.RefundCreateParams = {
    charge: input.chargeId,
    reverse_transfer: true,
    refund_application_fee: true,
  }
  if (
    typeof input.amountCents === 'number' &&
    Number.isInteger(input.amountCents) &&
    input.amountCents > 0
  ) {
    params.amount = input.amountCents
  }
  if (input.metadata) params.metadata = input.metadata

  try {
    const refund = await stripe.refunds.create(params, {
      idempotencyKey: input.idempotencyKey,
    })
    return {
      refundId: refund.id,
      status: refund.status,
      amountCents: refund.amount,
    }
  } catch (err) {
    const e = err as Stripe.errors.StripeError
    // `charge_already_refunded` NO es un fallo real — el dinero ya volvió al
    // cliente. El caller lo trata como éxito idempotente.
    throw new StripeRefundError(
      e?.message ?? 'Error al reembolsar en Stripe',
      e?.code,
    )
  }
}
