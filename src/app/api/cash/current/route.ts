import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull, asc } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  computeExpectedClosing,
  type MovementForCompute,
} from '@/lib/cash/compute'
import { loadBreakdownForSession } from '@/lib/cash/load-breakdown'

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
      breakdown: null,
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

  // Desglose enriquecido por método/kind/barbero — lo que ve el barbero en
  // el panel "Resumen" y en el modal de cierre. Se calcula en paralelo
  // (otra query) porque resuelve barberId via subquery a bookings/sales.
  // Coste OK en V1 (decenas de filas por sesión).
  const breakdown = await loadBreakdownForSession(client.id, session.id)

  return Response.json({ session, movements, expected, breakdown })
}
