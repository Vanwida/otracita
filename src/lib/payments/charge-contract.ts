// -----------------------------------------------------------------------------
// Contract — POST /api/bookings/[id]/charge (épica Reni 2026-05-22 #26+#27)
//
// Endpoint atómico que reemplaza al combo histórico:
//   · PATCH /api/bookings/[id] { status: 'completed', paymentMethod }
//   · POST  /api/payments/create-link (Stripe Checkout aislado)
//
// Un mismo cobro puede partirse entre N métodos (pago fraccionado). La suma
// de `payments[].amountCents` DEBE ser igual al `bookingTotalCents(bookingId)`
// — el endpoint lo valida antes de tocar nada.
//
// El tip (propina) es opcional, se procesa en la misma transacción, queda
// atribuido a un barbero concreto y NUNCA se suma al total facturado del
// servicio (es liberalidad, fuera de base IVA — ley ES).
//
// Este archivo es la single source of truth del shape request/response. Lo
// consumen:
//   · Backend handler en src/app/api/bookings/[id]/charge/route.ts
//   · Frontend ChargeFlow + SplitPaymentBuilder
//   · Tests unitarios charge-validation.test.ts
// -----------------------------------------------------------------------------

import type { PaymentMethod } from './methods';

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

export interface ChargePaymentLine {
  /** Método de este tramo. Whitelist en `methods.ts`. */
  method: PaymentMethod;
  /** Importe en céntimos. Debe ser > 0. */
  amountCents: number;
  /**
   * Idempotencia para tramos cobrados con SumUp (datáfono físico). Si el
   * front ya completó el cobro SumUp y obtuvo este id, lo manda aquí para
   * que el endpoint NO vuelva a invocar SumUp y para evitar dobles cargos
   * vía UNIQUE en `payments.sumup_transaction_id`. Solo válido cuando
   * `method === 'card_physical'`.
   */
  sumupTransactionId?: string;
  /** Nota opcional para audit ("Bizum 600 123 456", "Datáfono manual", etc.). */
  notes?: string;
}

export interface ChargeTipPayload {
  /** Importe en céntimos. Debe ser > 0 (si "sin propina", omitir el campo entero). */
  amountCents: number;
  /**
   * Método de la propina, en el dominio histórico de `tips.paymentMethod`
   * ('cash' | 'card') — NO el dominio extendido de PaymentMethod. El motor
   * de payroll separa estos dos para liquidación mensual:
   *   · cash → ya en bolsillo del barbero, informativo.
   *   · card → pendiente de pagar en nómina.
   */
  method: 'cash' | 'card';
  /** Barbero al que se atribuye. OBLIGATORIO — no se aceptan tips sin barbero. */
  barberId: string;
}

export interface ChargeRequestBody {
  /** 1..N tramos. Suma debe coincidir con `bookingTotalCents`. */
  payments: ChargePaymentLine[];
  /** Tip opcional. Si se omite o `amountCents === 0`, no se registra propina. */
  tip?: ChargeTipPayload;
  /**
   * UUID generado en el cliente al abrir el modal de cobro. Retenido para
   * evitar dobles cobros si el barbero pulsa "Cobrar" más de una vez o si
   * la red reintenta. En V1 el endpoint puede ignorarlo (botón disabled +
   * spinner mientras pending es suficiente); documentado para que el
   * frontend lo envíe ya y migrar a tabla en V2 sin breaking change.
   */
  idempotencyKey: string;
}

// -----------------------------------------------------------------------------
// Response
// -----------------------------------------------------------------------------

export interface ChargeOnlineCheckout {
  paymentId: string;
  paymentUrl: string;
  /**
   * Data URL PNG del QR code. El front lo muestra en pantalla "Esperando
   * pago" para que el cliente escanee con su móvil. Se genera con la misma
   * lib que `/api/payments/create-link` usa hoy.
   */
  qrCodeDataUrl: string;
}

export interface ChargeSuccessResponse {
  bookingId: string;
  /** Total facturado del booking en céntimos (NO incluye tip). */
  totalCents: number;
  /**
   * Si el cobro incluyó un tramo `card_online`, este campo viene poblado y el
   * booking queda en estado intermedio (status='confirmed' aún) hasta que el
   * webhook Stripe confirme el pago. El front muestra la pantalla de espera
   * con el QR y poll a `/api/payments/[id]` cada 4s, igual que el flow
   * histórico de `create-link`.
   *
   * Si el cobro fue 100% offline (cash/card_physical/bizum), este campo es
   * `undefined` y el booking ya está completado.
   */
  requiresOnlineCheckout?: ChargeOnlineCheckout;
  /** `true` si se registró propina en este charge. */
  tipRecorded: boolean;
}

export interface ChargeErrorResponse {
  error: string;
  /**
   * Código machine-readable para que el front decida cómo recuperar:
   *   · 'sum_mismatch'   → la suma de payments no coincide con el total
   *   · 'invalid_method' → algún `method` no está en la whitelist
   *   · 'multiple_online'→ más de un tramo `card_online` en el mismo charge
   *   · 'online_not_active' → cliente sin Stripe Connect activo
   *   · 'booking_not_chargeable' → status != 'confirmed' o booking inexistente
   *   · 'tip_without_barber' → tip con barberId inválido para el tenant
   *   · 'idempotency_replay' → idempotencyKey ya usado con body distinto
   */
  code:
    | 'sum_mismatch'
    | 'invalid_method'
    | 'multiple_online'
    | 'online_not_active'
    | 'booking_not_chargeable'
    | 'tip_without_barber'
    | 'idempotency_replay';
}

export type ChargeResponse = ChargeSuccessResponse | ChargeErrorResponse;
