import { db } from '@/db'
import {
  cashSessions,
  cashMovements,
  sumupPendingTransactions,
  bookings,
  clients,
} from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import {
  shouldAutoInvoiceBooking,
  tryAutoInvoiceForCompletedBooking,
} from '@/lib/invoicing'
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup'

// -----------------------------------------------------------------------------
// recordSumupCheckoutResult — single entry point para registrar el resultado
// de un cobro SumUp, independiente del origen:
//
//   1. Cloud API + Reader físico → callback en /api/sumup/checkout/return
//   2. Tap to Pay desde app móvil (iOS SDK) → /api/app/mobile/checkout/record
//
// Ambos terminan llamando aquí. La función es idempotente vía
// cash_movements.sumup_transaction_id UNIQUE.
//
// Reglas:
//   · status SUCCESSFUL + sesión abierta → INSERT cash_movement directo
//   · status SUCCESSFUL + sin sesión     → INSERT en sumup_pending_transactions
//   · status REFUNDED + sesión abierta   → kind='refund' (negativo)
//   · status REFUNDED + sin sesión       → pending
//   · status CANCELLED/FAILED            → ignorar (no entra en caja)
//
// Si bookingId presente Y status SUCCESSFUL → además marca el booking como
// completed + dispara auto-factura + push review (encadenado).
// -----------------------------------------------------------------------------

export interface RecordCheckoutInput {
  clientId: string
  /** Identificador único de la transaction (SumUp tx id o client_transaction_id). */
  sumupTransactionId: string
  /** Status según SumUp / SDK: SUCCESSFUL | REFUNDED | CANCELLED | FAILED. */
  status: string
  amountCents: number
  currency: string
  /** ISO timestamp de la transaction. */
  timestampIso: string
  /** Si el cobro está atado a un booking, su id (validado externamente que pertenece al client). */
  bookingId?: string | null
  /** Texto opcional para notes del movement (ej: transaction_code humano legible). */
  reference?: string | null
  /** 'POS' (Reader físico) o 'TAP_TO_PAY' (móvil) — informativo para pending. */
  paymentType?: string | null
  /** Payload original — guardado en sumup_pending_transactions.raw_payload si va a buffer. */
  rawPayload?: Record<string, unknown> | null
}

export interface RecordCheckoutResult {
  outcome: 'inserted' | 'pending' | 'duplicate' | 'ignored' | 'refund'
  cashMovementId?: string
  pendingId?: string
}

export async function recordSumupCheckoutResult(
  input: RecordCheckoutInput,
): Promise<RecordCheckoutResult> {
  // Solo procesamos SUCCESSFUL y REFUNDED.
  if (input.status !== 'SUCCESSFUL' && input.status !== 'REFUNDED') {
    return { outcome: 'ignored' }
  }

  if (input.currency !== 'EUR') {
    // Por ahora solo EUR; ignoramos otras divisas para no contaminar cuadre.
    return { outcome: 'ignored' }
  }

  // Idempotencia: ¿ya procesamos esta transaction?
  const [existsMovement] = await db
    .select({ id: cashMovements.id })
    .from(cashMovements)
    .where(eq(cashMovements.sumupTransactionId, input.sumupTransactionId))
  if (existsMovement) return { outcome: 'duplicate', cashMovementId: existsMovement.id }

  const [existsPending] = await db
    .select({ id: sumupPendingTransactions.id })
    .from(sumupPendingTransactions)
    .where(eq(sumupPendingTransactions.sumupTransactionId, input.sumupTransactionId))
  if (existsPending) return { outcome: 'duplicate', pendingId: existsPending.id }

  const [openSession] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, input.clientId), isNull(cashSessions.closedAt)))

  // Sin sesión → buffer pending. Se importa al abrir la siguiente caja.
  if (!openSession) {
    const [pending] = await db
      .insert(sumupPendingTransactions)
      .values({
        clientId: input.clientId,
        sumupTransactionId: input.sumupTransactionId,
        amountCents: input.amountCents,
        currency: input.currency,
        status: input.status,
        paymentType: input.paymentType ?? 'POS',
        transactionTimestamp: new Date(input.timestampIso),
        rawPayload: input.rawPayload ?? null,
      })
      .returning({ id: sumupPendingTransactions.id })
    return { outcome: 'pending', pendingId: pending?.id }
  }

  // Hay sesión. Insertar movement.
  const [movement] = await db
    .insert(cashMovements)
    .values({
      clientId: input.clientId,
      sessionId: openSession.id,
      kind: input.status === 'REFUNDED' ? 'refund' : 'booking',
      method: 'card',
      amountCents: input.amountCents,
      sumupTransactionId: input.sumupTransactionId,
      referenceType: input.bookingId ? 'booking' : null,
      referenceId: input.bookingId ?? null,
      notes: input.reference ?? `SumUp ${input.sumupTransactionId}`,
    })
    .returning({ id: cashMovements.id })

  // Si SUCCESSFUL + bookingId → cerrar booking en cadena.
  if (input.status === 'SUCCESSFUL' && input.bookingId) {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId))
    if (booking && booking.status === 'confirmed') {
      await db
        .update(bookings)
        .set({ status: 'completed', paymentMethod: 'card' })
        .where(eq(bookings.id, input.bookingId))

      const [clientRow] = await db.select().from(clients).where(eq(clients.id, input.clientId))
      if (clientRow) {
        const updatedBooking = {
          ...booking,
          status: 'completed' as const,
          paymentMethod: 'card' as const,
        }
        if (shouldAutoInvoiceBooking(updatedBooking) && clientRow.invoicingEnabled) {
          tryAutoInvoiceForCompletedBooking(input.bookingId)
        }
        if (clientRow.ratingsEnabled) {
          tryRatingFollowupForCompletedBooking(input.bookingId)
        }
      }
    }
  }

  return {
    outcome: input.status === 'REFUNDED' ? 'refund' : 'inserted',
    cashMovementId: movement?.id,
  }
}
