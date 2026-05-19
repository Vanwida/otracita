import { db } from '@/db'
import { payments } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { refundStripeCharge, StripeRefundError } from '@/lib/stripe/refund'
import { recordRefundMovement } from '@/lib/cash/record-refund'

// -----------------------------------------------------------------------------
// POST /api/payments/:id/refund
//
// Reembolsa un cobro online (Stripe Connect destination charge) hecho a un
// cliente del barbero. Llamado desde el panel de la cita ("Reembolsar").
//
// Body (opcional):
//   { amountCents?: number }   // parcial. Omitir = reembolso TOTAL.
//
// Garantías:
//   · Multi-tenant: clientId SOLO de la sesión (requireClientAccess). El pago
//     debe pertenecer al tenant (o admin).
//   · Idempotente: solo se reembolsa un pago 'succeeded'. Si ya está
//     'refunded' devolvemos 200 sin re-llamar a Stripe. Idempotency-Key
//     estable por (paymentId+amount) en la llamada Stripe.
//   · Webhook-consistente: `charge.refunded` también flipa payments.status y
//     emite el cash_movement; el dedupeKey (refund id `re_…`) hace que la
//     acción del barbero y el webhook colapsen a UN solo apunte de caja.
// -----------------------------------------------------------------------------

interface Body {
  amountCents?: unknown
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  const { client, user, isAdmin } = access
  const { id } = await ctx.params

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const [payment] = await db.select().from(payments).where(eq(payments.id, id))
  if (!payment) {
    return Response.json({ error: 'Pago no encontrado' }, { status: 404 })
  }
  if (!isAdmin && payment.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Idempotente: ya reembolsado → 200, no re-llamamos a Stripe.
  if (payment.status === 'refunded') {
    return Response.json({ ok: true, alreadyRefunded: true, status: 'refunded' })
  }
  // Solo un cobro liquidado se puede reembolsar.
  if (payment.status !== 'succeeded') {
    return Response.json(
      { error: 'Solo se puede reembolsar un pago completado.' },
      { status: 409 },
    )
  }
  if (!payment.stripeChargeId) {
    return Response.json(
      {
        error:
          'Este pago aún no tiene cargo confirmado en Stripe. Espera unos segundos y reintenta.',
      },
      { status: 409 },
    )
  }

  // --- Importe a reembolsar: total o parcial validado --------------------
  let amountCents: number | null = null
  if (body.amountCents !== undefined && body.amountCents !== null) {
    const n =
      typeof body.amountCents === 'number'
        ? body.amountCents
        : Number.parseInt(String(body.amountCents), 10)
    if (!Number.isInteger(n) || n <= 0 || n > payment.amountCents) {
      return Response.json(
        {
          error: `Importe inválido. Máximo reembolsable: ${(payment.amountCents / 100).toFixed(2)} €.`,
        },
        { status: 400 },
      )
    }
    amountCents = n
  }
  const refundedCents = amountCents ?? payment.amountCents
  const isFullRefund = refundedCents >= payment.amountCents

  // --- Stripe: reembolso del destination charge -------------------------
  let refundId: string
  try {
    const result = await refundStripeCharge({
      chargeId: payment.stripeChargeId,
      amountCents,
      // Estable por pago+importe → reintentos no duplican el refund.
      idempotencyKey: `otracita-refund-${payment.id}-${refundedCents}`,
      metadata: {
        otracita_payment_id: payment.id,
        otracita_client_id: payment.clientId,
        ...(payment.bookingId
          ? { otracita_booking_id: payment.bookingId }
          : {}),
      },
    })
    refundId = result.refundId
  } catch (err) {
    if (
      err instanceof StripeRefundError &&
      err.code === 'charge_already_refunded'
    ) {
      // Stripe dice que ya estaba reembolsado: éxito idempotente. Aún así
      // alineamos nuestro estado + caja abajo usando un dedupe key estable.
      refundId = `already-${payment.stripeChargeId}`
    } else {
      const message =
        err instanceof StripeRefundError ? err.message : 'Error al reembolsar'
      console.error('[payments/refund] stripe refund failed:', message)
      return Response.json({ error: message }, { status: 502 })
    }
  }

  // --- Estado del pago: solo total marca 'refunded' ---------------------
  // (un parcial deja el pago 'succeeded' — sigue siendo un cobro válido por
  //  el resto; el webhook charge.refunded coincide con esta regla.)
  const now = new Date()
  if (isFullRefund) {
    await db
      .update(payments)
      .set({ status: 'refunded', updatedAt: now })
      .where(eq(payments.id, payment.id))
  } else {
    await db
      .update(payments)
      .set({ updatedAt: now })
      .where(eq(payments.id, payment.id))
  }

  // --- Caja: apunte 'refund' (RESTA de online). dedupeKey = refund id, el
  //     MISMO que usará el webhook → un único apunte. ---------------------
  const cajaOutcome = await recordRefundMovement({
    clientId: payment.clientId,
    amountCents: refundedCents,
    method: 'online',
    dedupeKey: refundId,
    bookingId: payment.bookingId,
    notes: `Reembolso Stripe ${isFullRefund ? 'total' : 'parcial'} · pago ${payment.id.slice(0, 8)}`,
    createdByEmail: user.email,
  })

  return Response.json({
    ok: true,
    status: isFullRefund ? 'refunded' : 'succeeded',
    refundedCents,
    cashRegister: cajaOutcome.outcome,
  })
}
