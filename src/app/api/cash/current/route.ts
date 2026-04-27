import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull, asc } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  computeExpectedClosing,
  type MovementForCompute,
} from '@/lib/cash/compute'

// -----------------------------------------------------------------------------
// GET /api/cash/current — sesión activa + movimientos + saldos esperados.
//
// Útil para refrescar la UI de /dashboard/caja en tiempo real (poll cada
// pocos segundos o tras una acción). Si no hay sesión abierta devuelve
// `session: null` con array de movimientos vacío.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  if (!client.cashRegisterEnabled) {
    return Response.json(
      { error: 'La caja efectivo no está activa para este negocio.' },
      { status: 403 },
    )
  }

  const [session] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)))

  if (!session) {
    return Response.json({
      session: null,
      movements: [],
      expected: null,
    })
  }

  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, session.id))
    .orderBy(asc(cashMovements.createdAt))

  const expected = computeExpectedClosing(
    session.openingCents,
    movements as unknown as MovementForCompute[],
  )

  return Response.json({ session, movements, expected })
}
