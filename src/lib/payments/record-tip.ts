// -----------------------------------------------------------------------------
// record-tip — helper compartido para registrar una propina en la misma
// transacción que un cobro (split o post-success).
//
// Refleja la lógica histórica de /api/tips/cash (cash) y /api/tips/sessions
// (card → Stripe Checkout) pero pensada para correr DENTRO de una transacción
// de Drizzle, junto con otros inserts (payments, cash_movements).
//
// Para tip.method='cash': insert directo en `tips` con status='paid' + (si
// hay sesión de caja abierta) un cash_movement kind='tip_cash'.
// Para tip.method='card': insert en `tips` con status='paid' y método 'card'
//   — el dinero ya está cobrado por el datáfono/online, NO se crea Stripe
//   Checkout aquí. La row queda atribuida al barbero igual y entra en
//   payroll-card pendiente (split cash/card del motor de nómina).
//
// El caller debe haber validado:
//   · barberId pertenece al tenant + activo.
//   · amountCents > 0.
//   · method ∈ {cash, card}.
// -----------------------------------------------------------------------------

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { tips, cashMovements, cashSessions } from '@/db/schema';

// La transacción de Drizzle expone una API casi idéntica a `db` (mismos
// `.insert/.select/.update`). Tomamos el tipo del primer argumento de
// `db.transaction` para que el helper acepte tanto `db` como `tx` sin tener
// que duplicar tipos.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RecordTipInput {
  /** Tenant. */
  clientId: string;
  /** Booking al que se atribuye la propina. */
  bookingId: string;
  /** customerPhone snapshot (booking.customerPhone). */
  customerPhone: string;
  /** Importe en céntimos (> 0). */
  amountCents: number;
  /** Método de pago de la propina. */
  method: 'cash' | 'card';
  /** Barbero al que se asigna (validado por el caller). */
  barberId: string;
  /** Nombre snapshot del barbero (validado por el caller). */
  barberName: string;
  /** ¿La barbería tiene caja efectivo activa? Si false, no se busca sesión. */
  cashRegisterEnabled: boolean;
  /** Email del usuario del dashboard que registra la propina. */
  createdByEmail: string | null;
}

export interface RecordTipResult {
  tipId: string;
  cashMovementId: string | null;
}

/**
 * Inserta tip + (si corresponde) cash_movement, todo dentro de la
 * transacción que recibe. Lanza si algo falla — el caller decide si revertir
 * la transacción completa.
 */
export async function recordTipInTx(
  tx: Tx,
  input: RecordTipInput,
): Promise<RecordTipResult> {
  const now = new Date();

  const [tipRow] = await tx
    .insert(tips)
    .values({
      clientId: input.clientId,
      bookingId: input.bookingId,
      amountCents: input.amountCents,
      status: 'paid',
      paymentMethod: input.method,
      barberId: input.barberId,
      barberName: input.barberName,
      customerPhone: input.customerPhone || '—',
      paidAt: now,
    })
    .returning({ id: tips.id });

  let cashMovementId: string | null = null;
  if (input.method === 'cash' && input.cashRegisterEnabled) {
    const [openSession] = await tx
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.clientId, input.clientId),
          isNull(cashSessions.closedAt),
        ),
      );
    if (openSession) {
      const [mov] = await tx
        .insert(cashMovements)
        .values({
          clientId: input.clientId,
          sessionId: openSession.id,
          kind: 'tip_cash',
          method: 'cash',
          amountCents: input.amountCents,
          barberId: input.barberId,
          referenceType: 'booking',
          referenceId: input.bookingId,
          createdByEmail: input.createdByEmail,
        })
        .returning({ id: cashMovements.id });
      cashMovementId = mov.id;
    }
  }

  return { tipId: tipRow.id, cashMovementId };
}
