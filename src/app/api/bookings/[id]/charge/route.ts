import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  bookings,
  barbers,
  payments,
  cashMovements,
  cashSessions,
} from '@/db/schema';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { bookingTotalCents } from '@/lib/bookings/total';
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup';
import {
  isPaymentMethod,
  CASH_MOVEMENT_METHOD_FROM_PAYMENT,
  MIXED_METHOD_TOKEN,
} from '@/lib/payments/methods';
import type {
  ChargeRequestBody,
  ChargeErrorResponse,
  ChargeSuccessResponse,
} from '@/lib/payments/charge-contract';
import { validateChargeBody } from '@/lib/payments/charge-validation';
import {
  createStripeCheckoutForBooking,
  StripeCheckoutError,
} from '@/lib/payments/stripe-checkout';
import { recordTipInTx } from '@/lib/payments/record-tip';
import { isNull } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// POST /api/bookings/[id]/charge
//
// Endpoint atómico de cobro unificado (épica Reni 2026-05-22 #26+#27).
// Reemplaza al combo histórico:
//   · PATCH /api/bookings/[id] { status: 'completed', paymentMethod }
//   · POST  /api/payments/create-link (Stripe Checkout aislado)
//
// Acepta N tramos en `payments[]` (pago fraccionado: cash + tarjeta físico +
// bizum + Stripe Checkout). Suma debe coincidir con `bookingTotalCents`. Si
// hay un tramo `card_online`, el booking se queda en `confirmed` hasta que
// el webhook `checkout.session.completed` lo cierre (ver
// src/app/api/webhooks/stripe/route.ts).
//
// Si TODOS los tramos son offline, cerramos el booking en la misma
// transacción + insertamos cash_movements + (opcional) tip + disparamos
// `tryRatingFollowupForCompletedBooking`.
//
// Multi-tenancy: la reserva debe pertenecer al cliente autenticado. NUNCA
// confiamos `clientId` del body — sale de `requireClientAccess`.
// -----------------------------------------------------------------------------

function errorResponse(error: ChargeErrorResponse, status = 400): Response {
  return Response.json(error, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { client, user } = access;
  const { id: bookingId } = await params;

  let body: ChargeRequestBody;
  try {
    body = (await req.json()) as ChargeRequestBody;
  } catch {
    return errorResponse(
      { error: 'JSON inválido.', code: 'sum_mismatch' },
      400,
    );
  }

  // ── Cargar booking + validar tenant + status ──────────────────────────
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)));
  if (!booking) {
    return errorResponse(
      { error: 'Reserva no encontrada.', code: 'booking_not_chargeable' },
      404,
    );
  }
  if (booking.status !== 'confirmed') {
    return errorResponse(
      { error: 'Solo se cobran reservas confirmadas.', code: 'booking_not_chargeable' },
      400,
    );
  }

  // ── Total esperado (cents). Foot-gun: bookings.price es EUROS. ────────
  const bookingTotal = await bookingTotalCents(bookingId);

  // ── Validación pura del body ──────────────────────────────────────────
  const validationError = validateChargeBody(body, bookingTotal);
  if (validationError) {
    return errorResponse(validationError, 400);
  }

  const onlineLine = body.payments.find((p) => p.method === 'card_online');

  // ── Connect activo (solo si hay tramo online) ─────────────────────────
  if (onlineLine) {
    if (client.stripeConnectStatus !== 'active' || !client.stripeConnectAccountId) {
      return errorResponse(
        {
          error: 'Activa cobros online antes de cobrar con Stripe.',
          code: 'online_not_active',
        },
        400,
      );
    }
  }

  // ── Validar barberId del tip (pertenece al tenant + activo) ──────────
  let resolvedBarber:
    | { id: string; name: string }
    | null = null;
  if (body.tip) {
    const [b] = await db
      .select({ id: barbers.id, name: barbers.name })
      .from(barbers)
      .where(
        and(
          eq(barbers.clientId, client.id),
          eq(barbers.id, body.tip.barberId),
          eq(barbers.active, true),
        ),
      );
    if (!b) {
      return errorResponse(
        { error: 'Barbero de la propina no válido.', code: 'tip_without_barber' },
        400,
      );
    }
    resolvedBarber = b;
  }

  // ── Online checkout PREVIO a la transacción ───────────────────────────
  // La Stripe Session se crea ANTES (network I/O), su insert de `payments`
  // pending vive separado. Si la transacción posterior falla, queda una
  // sesión Stripe pendiente — Stripe la expira sola tras 24h y nuestro
  // handler `checkout.session.expired` la flippa a 'cancelled'. Esto es
  // mejor que meter la llamada a Stripe DENTRO de db.transaction (el lock
  // sobre `payments` se haría eterno si Stripe es lento).
  let onlineCheckout:
    | {
        paymentId: string;
        paymentUrl: string;
        qrCodeDataUrl: string;
      }
    | undefined;
  if (onlineLine) {
    try {
      // booking.service es snapshot del servicio principal (texto libre).
      // Para tickets multi-servicio, el ticket completo se compone aparte.
      const description = booking.service
        ? String(booking.service).slice(0, 200)
        : `Servicio en ${client.businessName || 'la barbería'}`;
      const result = await createStripeCheckoutForBooking({
        client,
        booking,
        amountCents: onlineLine.amountCents,
        description,
        recordedByEmail: user.email,
      });
      onlineCheckout = {
        paymentId: result.paymentId,
        paymentUrl: result.paymentUrl,
        qrCodeDataUrl: result.qrCodeDataUrl,
      };
    } catch (err) {
      if (err instanceof StripeCheckoutError) {
        return errorResponse(
          { error: err.message, code: 'online_not_active' },
          err.status,
        );
      }
      throw err;
    }
  }

  // ── Transacción: payments offline + tip + (si todos offline) booking ─
  const offlineLines = body.payments.filter((p) => p.method !== 'card_online');
  const allOffline = !onlineLine;

  const result = await db.transaction(async (tx) => {
    const now = new Date();

    // 1. Insertar N payments offline.
    for (const line of offlineLines) {
      // El validateChargeBody ya bloqueó methods no whitelisted, pero
      // re-chequeo defensivo (TS-friendly).
      if (!isPaymentMethod(line.method)) {
        throw new Error(`Método inesperado: ${String(line.method)}`);
      }
      await tx.insert(payments).values({
        clientId: client.id,
        bookingId,
        amountCents: line.amountCents,
        applicationFeeCents: 0,
        currency: 'eur',
        type: 'full',
        status: 'succeeded',
        method: line.method,
        paidAt: now,
        recordedByEmail: user.email,
        sumupTransactionId: line.sumupTransactionId ?? null,
        notes: line.notes ?? null,
        description: booking.service ?? null,
      });
    }

    // 2. Si todo offline → cerrar booking.
    let bookingCompleted = false;
    if (allOffline) {
      const finalMethod =
        body.payments.length === 1
          ? body.payments[0].method
          : MIXED_METHOD_TOKEN;

      await tx
        .update(bookings)
        .set({
          status: 'completed',
          paymentMethod: finalMethod,
        })
        .where(eq(bookings.id, bookingId));
      bookingCompleted = true;
    }

    // 3. Insertar tip (si viene). Mismo flow que /api/tips/cash, encapsulado.
    let tipRecorded = false;
    if (body.tip && resolvedBarber) {
      await recordTipInTx(tx, {
        clientId: client.id,
        bookingId,
        customerPhone: booking.customerPhone ?? '—',
        amountCents: body.tip.amountCents,
        method: body.tip.method,
        barberId: resolvedBarber.id,
        barberName: resolvedBarber.name,
        cashRegisterEnabled: Boolean(client.cashRegisterEnabled),
        createdByEmail: user.email,
      });
      tipRecorded = true;
    }

    return { bookingCompleted, tipRecorded };
  });

  // ── Cash movements para los tramos offline (fire-and-forget) ─────────
  // Uno por tramo offline (1 booking → N rows en cash_movements si split).
  // No bloqueamos la respuesta — si falla queda log y el barbero puede
  // re-cuadrar manualmente. Solo si el booking quedó completed.
  if (result.bookingCompleted && client.cashRegisterEnabled) {
    void recordOfflineCashMovementsInBackground({
      clientId: client.id,
      bookingId,
      lines: offlineLines.map((l) => ({
        amountCents: l.amountCents,
        method: CASH_MOVEMENT_METHOD_FROM_PAYMENT[l.method],
      })),
      createdByEmail: user.email,
    });
  }

  // ── Followup rating (fire-and-forget) ────────────────────────────────
  // Solo si el booking quedó completed en esta llamada (todos offline).
  // Si hay tramo online, lo dispara el webhook cuando cierra.
  if (result.bookingCompleted) {
    tryRatingFollowupForCompletedBooking(bookingId);
  }

  // ── Respuesta ─────────────────────────────────────────────────────────
  const response: ChargeSuccessResponse = {
    bookingId,
    totalCents: bookingTotal,
    tipRecorded: result.tipRecorded,
  };
  if (onlineCheckout) {
    response.requiresOnlineCheckout = onlineCheckout;
  }

  console.log('[charge]', {
    bookingId,
    totalCents: bookingTotal,
    methods: body.payments.map((p) => p.method),
    tipCents: body.tip?.amountCents,
    hasOnline: Boolean(onlineCheckout),
  });

  return Response.json(response);
}

// -----------------------------------------------------------------------------
// recordOfflineCashMovementsInBackground — inserta N cash_movements (1 por
// tramo offline) si hay sesión de caja abierta. Fire-and-forget — nunca
// lanza.
//
// Justificación: el helper existente `recordMovementInBackground` solo
// soporta 1 movement por booking; aquí necesitamos N para un split. Esta
// variante itera y comparte la misma resolución de sesión.
// -----------------------------------------------------------------------------
interface BackgroundCashMovementInput {
  clientId: string;
  bookingId: string;
  lines: Array<{ amountCents: number; method: 'cash' | 'card' | 'online' }>;
  createdByEmail: string | null;
}

async function recordOfflineCashMovementsInBackground(
  input: BackgroundCashMovementInput,
): Promise<void> {
  try {
    if (input.lines.length === 0) return;
    const [session] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.clientId, input.clientId),
          isNull(cashSessions.closedAt),
        ),
      );
    if (!session) return;

    for (const line of input.lines) {
      if (!Number.isFinite(line.amountCents) || line.amountCents <= 0) continue;
      await db.insert(cashMovements).values({
        clientId: input.clientId,
        sessionId: session.id,
        kind: 'booking',
        method: line.method,
        amountCents: line.amountCents,
        referenceType: 'booking',
        referenceId: input.bookingId,
        createdByEmail: input.createdByEmail,
      });
    }
  } catch (err) {
    console.error('[charge] recordOfflineCashMovements failed:', err, {
      booking: input.bookingId,
    });
  }
}
