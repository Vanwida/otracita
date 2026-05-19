import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// recordRefundMovement — inserta UN cash_movement kind='refund' (el signo lo
// pone compute.ts/NEGATIVE_KINDS → RESTA del cajón/datáfono/online).
//
// Lo dispara cualquier reembolso confirmado:
//   · Stripe Connect (POST /api/payments/[id]/refund + webhook charge.refunded)
//   · SumUp           (POST /api/sumup/refund)
//
// Idempotencia — DOBLE candado para que un reembolso NUNCA se cuente dos veces
// (la acción del barbero + el webhook async de Stripe describen el MISMO
// hecho económico):
//
//   1. `dedupeKey` → se escribe en cash_movements.sumup_transaction_id, que
//      es UNIQUE. Reutilizamos esa columna como "external settlement id"
//      genérico (Stripe refund id `re_…` o SumUp tx id) porque ya es el
//      candado de unicidad físico de la tabla y evita añadir esquema. El
//      INSERT usa onConflictDoNothing → segundo intento = no-op.
//   2. Antes del INSERT, SELECT por ese mismo id → corto-circuito explícito
//      con outcome 'duplicate' para que el caller no reporte doble.
//
// Sesión: un cash_movement EXIGE sesión abierta (sessionId NOT NULL). Si NO
// hay caja abierta devolvemos 'no_session' SIN error: el reembolso ya ocurrió
// en Stripe/SumUp (eso es la verdad económica), y el efecto online de Stripe
// no se cuadra físicamente contra nada (compute.ts: "Stripe ya está
// conciliado"). El caller decide si avisar al barbero. NUNCA inventamos un
// movimiento sin sesión ni lo perdemos en silencio: lo reportamos.
//
// Nunca lanza — los callers (route + webhook) son money-paths y deben seguir
// aunque la conciliación de caja falle por algo transitorio.
// -----------------------------------------------------------------------------

export interface RecordRefundInput {
  clientId: string
  /** Importe REEMBOLSADO en céntimos (positivo). amount_cents siempre > 0; el
   *  signo negativo lo aplica compute.ts vía NEGATIVE_KINDS. */
  amountCents: number
  /** Cómo se cobró originalmente → a qué columna del cuadre resta el
   *  reembolso. 'online' = Stripe, 'card' = datáfono SumUp, 'cash' = mano. */
  method: 'cash' | 'card' | 'online'
  /** Identificador externo ÚNICO del reembolso (Stripe `re_…` o SumUp tx id).
   *  Es el candado de idempotencia — el MISMO valor desde la acción del
   *  barbero y desde el webhook colapsa a un único apunte. */
  dedupeKey: string
  /** Booking ligado (para auditoría inversa en el cierre). */
  bookingId?: string | null
  notes?: string | null
  createdByEmail?: string | null
}

export type RecordRefundOutcome =
  | { outcome: 'inserted'; cashMovementId: string }
  | { outcome: 'duplicate'; cashMovementId?: string }
  | { outcome: 'no_session' }
  | { outcome: 'error' }

export async function recordRefundMovement(
  input: RecordRefundInput,
): Promise<RecordRefundOutcome> {
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { outcome: 'error' }
  }
  if (!input.dedupeKey) return { outcome: 'error' }

  try {
    // Candado 1: ¿ya hay un movement con este external id?
    const [existing] = await db
      .select({ id: cashMovements.id })
      .from(cashMovements)
      .where(eq(cashMovements.sumupTransactionId, input.dedupeKey))
    if (existing) {
      return { outcome: 'duplicate', cashMovementId: existing.id }
    }

    const [session] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.clientId, input.clientId),
          isNull(cashSessions.closedAt),
        ),
      )

    if (!session) {
      // El reembolso ya ocurrió en el PSP; sin caja abierta no hay cuadre
      // físico que tocar. Reportamos para que el caller lo registre/avise.
      return { outcome: 'no_session' }
    }

    // Candado 2: INSERT con onConflictDoNothing sobre el UNIQUE
    // (sumup_transaction_id). Si dos requests corren a la vez, una gana y la
    // otra recibe [] → la tratamos como duplicado.
    const inserted = await db
      .insert(cashMovements)
      .values({
        clientId: input.clientId,
        sessionId: session.id,
        kind: 'refund',
        method: input.method,
        amountCents: input.amountCents,
        sumupTransactionId: input.dedupeKey,
        referenceType: input.bookingId ? 'booking' : null,
        referenceId: input.bookingId ?? null,
        notes: input.notes ?? null,
        createdByEmail: input.createdByEmail ?? null,
      })
      .onConflictDoNothing({ target: cashMovements.sumupTransactionId })
      .returning({ id: cashMovements.id })

    if (inserted.length === 0) {
      const [raced] = await db
        .select({ id: cashMovements.id })
        .from(cashMovements)
        .where(eq(cashMovements.sumupTransactionId, input.dedupeKey))
      return { outcome: 'duplicate', cashMovementId: raced?.id }
    }

    return { outcome: 'inserted', cashMovementId: inserted[0].id }
  } catch (err) {
    console.error('[cash] recordRefundMovement failed:', err, {
      dedupeKey: input.dedupeKey,
      clientId: input.clientId,
    })
    return { outcome: 'error' }
  }
}
