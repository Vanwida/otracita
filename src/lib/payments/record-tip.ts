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

// Driver neon-http NO soporta `db.transaction` real (lanza "No transactions
// support in neon-http driver" en runtime). Ejecutamos secuencial sobre `db`
// — mismo patrón que /api/tips/cash en producción. El riesgo de
// inconsistencia parcial si una query intermedia falla es aceptado como
// baseline del adapter.
type DbClient = typeof db;

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
 * Inserta tip + (si corresponde) cash_movement de forma secuencial. Lanza
 * si algo falla. Sin transacción real (limitación del driver neon-http);
 * el caller asume el mismo riesgo de inconsistencia parcial que el resto
 * del codebase.
 */
export async function recordTipSequential(
  tx: DbClient,
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
