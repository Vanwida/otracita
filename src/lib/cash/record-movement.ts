import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// recordMovementFromReference — inserta un cash_movement ligado a un booking
// completado o a una venta de producto, SI hay sesión activa.
//
// Pensado para llamarse desde:
//   - PATCH /api/bookings/[id] cuando se transiciona a `completed` con un
//     paymentMethod elegido por el barbero.
//   - POST /api/products/sales tras insertar la venta (con su paymentMethod).
//
// No-op si:
//   - El cliente no tiene cashRegisterEnabled (caller debe filtrar antes,
//     pero aquí también lo respetamos para defensa en profundidad)
//   - No hay sesión abierta (las ventas se registran pero no entran al
//     cuadre del día — patrón documentado en commit del schema)
//
// Fire-and-forget desde el caller — never throws.
// -----------------------------------------------------------------------------

export interface RecordMovementInput {
  clientId: string
  /** 'booking' o 'product_sale' — el origen de la venta. */
  referenceType: 'booking' | 'product_sale'
  referenceId: string
  /** Método de cobro elegido por el barbero o ya almacenado en la venta. */
  method: 'cash' | 'card' | 'online'
  /** Importe en céntimos (positivo). */
  amountCents: number
  /** Email del usuario que disparó el cobro. */
  createdByEmail?: string | null
}

/**
 * Inserta un movement enlazado si hay sesión activa. Devuelve el id del
 * movement insertado, o null si no había sesión abierta.
 */
export async function recordMovementFromReference(
  input: RecordMovementInput,
): Promise<string | null> {
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return null

  const [session] = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, input.clientId), isNull(cashSessions.closedAt)))

  if (!session) return null

  const kind = input.referenceType === 'booking' ? 'booking' : 'product_sale'

  const [movement] = await db
    .insert(cashMovements)
    .values({
      clientId: input.clientId,
      sessionId: session.id,
      kind,
      method: input.method,
      amountCents: input.amountCents,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      createdByEmail: input.createdByEmail ?? null,
    })
    .returning({ id: cashMovements.id })

  return movement?.id ?? null
}

/**
 * Variante fire-and-forget — usar desde flujos donde NO queremos bloquear
 * la respuesta principal (PATCH booking, POST product_sale) si la
 * inserción del movement falla por algún motivo transitorio.
 */
export function recordMovementInBackground(input: RecordMovementInput): void {
  recordMovementFromReference(input).catch((err) => {
    console.error('[cash] recordMovementInBackground failed:', err, {
      reference: `${input.referenceType}:${input.referenceId}`,
    })
  })
}
