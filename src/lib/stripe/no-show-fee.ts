import { stripe } from '@/lib/stripe'
import { db } from '@/db'
import { payments } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { calcApplicationFeeCents } from '@/lib/payments'
import { recordMovementInBackground } from '@/lib/cash/record-movement'
import type Stripe from 'stripe'

// -----------------------------------------------------------------------------
// No-show fee — cobro OFF-SESSION de la tarifa por no presentarse.
//
// REALIDAD SCA (investigada, no inventada): un cobro off-session a un cliente
// que NO está presente exige un método de pago previamente GUARDADO y
// CONSENTIDO (Stripe SetupIntent → PaymentMethod adjuntado a un Customer, con
// mandato MIT). HOY otracita NO captura tarjeta en las reservas WhatsApp/PWA,
// así que en producción este cobro se SALTA con motivo 'no_card_on_file'
// hasta que se implemente la captura+consentimiento en la reserva (ver
// PROPUESTA DE DISEÑO en el entregable — toca create.ts, fuera de mi
// ownership; flageado al owner de create.ts).
//
// Esta función implementa el MECANISMO de cobro completo y correcto para
// cuando ese método guardado exista:
//   · PaymentIntent off_session + confirm, destination charge a la cuenta
//     Connect del barbero (mismo modelo que create-link), application_fee
//     proporcional, metadata de auditoría.
//   · Idempotente: idempotencyKey estable por booking → un no_show marcado
//     dos veces NO cobra dos veces. Además SELECT previo en `payments` por
//     (bookingId, type='no_show_fee').
//   · Caja: emite cash_movement kind='booking' method='online' (es un
//     INGRESO real al negocio — la penalización entra como cobro). Vía
//     recordMovementInBackground (no bloquea, idempotente por sesión).
//
// NUNCA lanza: el caller (ruta no-show) debe completar el marcado de no_show
// aunque el cobro de la tarifa falle. Devuelve un resultado describible.
// -----------------------------------------------------------------------------

export type NoShowFeeOutcome =
  | { status: 'charged'; paymentId: string; amountCents: number }
  | { status: 'skipped'; reason: NoShowFeeSkipReason }
  | { status: 'already_charged'; paymentId: string }
  | { status: 'failed'; error: string }

export type NoShowFeeSkipReason =
  // Tarifa no configurada para este negocio (noShowFeeCents = 0).
  | 'fee_not_configured'
  // El barbero no tiene Connect activo → no hay dónde enrutar el cobro.
  | 'connect_inactive'
  // No hay tarjeta guardada/consentida del cliente (caso actual en prod —
  // bloqueado por la decisión de captura de tarjeta en la reserva).
  | 'no_card_on_file'

export interface ChargeNoShowFeeInput {
  clientId: string
  bookingId: string
  /** Tarifa configurada del negocio en céntimos (clients.noShowFeeCents). */
  feeCents: number
  /** Cuenta Connect del barbero (clients.stripeConnectAccountId). */
  connectAccountId: string | null
  connectActive: boolean
  /** Stripe Customer del CLIENTE FINAL. Null hoy (no se captura). */
  stripeCustomerId: string | null
  /** PaymentMethod guardado y consentido del cliente. Null hoy. */
  savedPaymentMethodId: string | null
  description?: string
}

export async function chargeNoShowFee(
  input: ChargeNoShowFeeInput,
): Promise<NoShowFeeOutcome> {
  if (!Number.isInteger(input.feeCents) || input.feeCents <= 0) {
    return { status: 'skipped', reason: 'fee_not_configured' }
  }
  if (!input.connectActive || !input.connectAccountId) {
    return { status: 'skipped', reason: 'connect_inactive' }
  }
  // Bloqueo de realidad: sin tarjeta guardada+consentida NO se puede cobrar
  // off-session legalmente (SCA). Esto es lo que ocurre HOY en producción.
  if (!input.stripeCustomerId || !input.savedPaymentMethodId) {
    return { status: 'skipped', reason: 'no_card_on_file' }
  }

  // Idempotencia a nivel de fila: ¿ya hay un cobro de no-show para este
  // booking? (cubre doble-marcado de no_show + reintentos de red).
  const existing = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, input.bookingId),
        eq(payments.type, 'no_show_fee'),
      ),
    )
  const settled = existing.find(
    (p) => p.status === 'succeeded' || p.status === 'pending',
  )
  if (settled) {
    return { status: 'already_charged', paymentId: settled.id }
  }

  const applicationFeeCents = calcApplicationFeeCents(input.feeCents)

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: input.feeCents,
        currency: 'eur',
        customer: input.stripeCustomerId,
        payment_method: input.savedPaymentMethodId,
        // off_session + confirm = cobro merchant-initiated sin el cliente
        // presente. Stripe exige mandato MIT (lo da el SetupIntent al
        // guardar la tarjeta — parte de la propuesta de diseño).
        off_session: true,
        confirm: true,
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: input.connectAccountId },
        description:
          input.description ?? `Tarifa por no presentarse (otracita)`,
        metadata: {
          otracita_booking_id: input.bookingId,
          otracita_client_id: input.clientId,
          otracita_kind: 'no_show_fee',
        },
      },
      {
        // Estable por booking → marcar no_show 2 veces NO duplica el cobro.
        idempotencyKey: `otracita-noshow-${input.bookingId}`,
      },
    )
  } catch (err) {
    // Tarjeta rechazada / requiere autenticación / etc. NO es fatal para el
    // flujo de no_show — devolvemos failed describible y el caller sigue.
    const e = err as Stripe.errors.StripeError
    return {
      status: 'failed',
      error: e?.message ?? 'No se pudo cobrar la tarifa por no-show',
    }
  }

  const chargeId =
    typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id ?? null
  const succeeded = intent.status === 'succeeded'

  const [row] = await db
    .insert(payments)
    .values({
      clientId: input.clientId,
      bookingId: input.bookingId,
      stripePaymentIntentId: intent.id,
      stripeChargeId: chargeId,
      amountCents: input.feeCents,
      applicationFeeCents,
      currency: 'eur',
      type: 'no_show_fee',
      status: succeeded ? 'succeeded' : 'pending',
      description: 'Tarifa por no presentarse',
      paidAt: succeeded ? new Date() : null,
    })
    .returning()

  // Caja: la penalización es un INGRESO online del negocio. No bloquea la
  // respuesta; idempotente por sesión (no-op si no hay caja abierta — Stripe
  // ya está conciliado, igual criterio que el resto de cobros online).
  if (succeeded) {
    recordMovementInBackground({
      clientId: input.clientId,
      referenceType: 'booking',
      referenceId: input.bookingId,
      method: 'online',
      amountCents: input.feeCents,
    })
  }

  return { status: 'charged', paymentId: row.id, amountCents: input.feeCents }
}
