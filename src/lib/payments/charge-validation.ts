// -----------------------------------------------------------------------------
// charge-validation — pure functions used by POST /api/bookings/[id]/charge.
//
// Aisladas aquí para poder testearlas sin DB ni red. El handler corre primero
// estas reglas (cierran ~95% de los body inválidos) y solo si pasa la
// validación pura, toca DB para comprobar reglas que SÍ requieren contexto
// (tip.barberId pertenece al tenant, Connect activo, etc.).
// -----------------------------------------------------------------------------

import { isPaymentMethod } from './methods.ts';
import type {
  ChargeErrorResponse,
  ChargePaymentLine,
  ChargeRequestBody,
} from './charge-contract.ts';

/**
 * Devuelve null si el body es válido contra `bookingTotal`. Si no, un
 * `ChargeErrorResponse` con el código mapeable al contrato.
 *
 * Reglas:
 *  · `payments` no vacío, cada `amountCents` entero positivo > 0.
 *  · Cada `method` en la whitelist (cash, card_physical, bizum, card_online).
 *  · SUM(payments[].amountCents) === bookingTotal.
 *  · A lo sumo UN tramo `card_online` por charge.
 *  · `idempotencyKey` presente (no vacío).
 *  · Si `tip` viene: `tip.amountCents > 0` y `tip.method ∈ {cash, card}` y
 *    `tip.barberId` no vacío. (La pertenencia del barbero al tenant se valida
 *    en el handler con acceso a DB.)
 */
export function validateChargeBody(
  body: ChargeRequestBody,
  bookingTotal: number,
): ChargeErrorResponse | null {
  if (
    typeof body.idempotencyKey !== 'string' ||
    body.idempotencyKey.trim().length === 0
  ) {
    return {
      error: 'idempotencyKey requerido.',
      code: 'idempotency_replay',
    };
  }

  if (!Array.isArray(body.payments) || body.payments.length === 0) {
    return {
      error: 'payments[] no puede estar vacío.',
      code: 'sum_mismatch',
    };
  }

  let onlineCount = 0;
  let sum = 0;
  for (const line of body.payments) {
    if (!isPaymentLineShape(line)) {
      return {
        error: 'Cada payment debe tener method y amountCents.',
        code: 'invalid_method',
      };
    }
    if (!isPaymentMethod(line.method)) {
      return {
        error: `Método de pago no soportado: ${String(line.method)}.`,
        code: 'invalid_method',
      };
    }
    if (
      !Number.isFinite(line.amountCents) ||
      !Number.isInteger(line.amountCents) ||
      line.amountCents <= 0
    ) {
      return {
        error: 'amountCents debe ser un entero positivo en céntimos.',
        code: 'sum_mismatch',
      };
    }
    if (line.method === 'card_online') onlineCount += 1;
    sum += line.amountCents;
  }

  if (onlineCount > 1) {
    return {
      error: 'Solo se admite UN tramo online por cobro.',
      code: 'multiple_online',
    };
  }

  if (!Number.isFinite(bookingTotal) || bookingTotal <= 0) {
    return {
      error: 'La reserva no tiene importe asociado.',
      code: 'booking_not_chargeable',
    };
  }

  if (sum !== bookingTotal) {
    return {
      error: `La suma de los pagos (${sum}) no coincide con el total (${bookingTotal}).`,
      code: 'sum_mismatch',
    };
  }

  if (body.tip !== undefined) {
    if (
      typeof body.tip !== 'object' ||
      body.tip === null ||
      typeof body.tip.amountCents !== 'number' ||
      !Number.isInteger(body.tip.amountCents) ||
      body.tip.amountCents <= 0
    ) {
      return {
        error: 'La propina debe tener amountCents entero positivo.',
        code: 'tip_without_barber',
      };
    }
    if (body.tip.method !== 'cash' && body.tip.method !== 'card') {
      return {
        error: 'method de propina inválido (cash | card).',
        code: 'tip_without_barber',
      };
    }
    if (
      typeof body.tip.barberId !== 'string' ||
      body.tip.barberId.trim().length === 0
    ) {
      return {
        error: 'La propina exige barberId.',
        code: 'tip_without_barber',
      };
    }
  }

  return null;
}

function isPaymentLineShape(v: unknown): v is ChargePaymentLine {
  return (
    typeof v === 'object' &&
    v !== null &&
    'method' in v &&
    'amountCents' in v
  );
}
