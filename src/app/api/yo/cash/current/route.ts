import { db } from '@/db';
import { cashSessions, cashMovements, clients } from '@/db/schema';
import { and, eq, isNull, asc } from 'drizzle-orm';
import {
  requireManagerPermission,
  managerPermissionErrorResponse,
} from '@/lib/manager-permissions/guard';
import {
  computeExpectedClosing,
  type MovementForCompute,
} from '@/lib/cash/compute';
import { loadBreakdownForSession } from '@/lib/cash/load-breakdown';

// -----------------------------------------------------------------------------
// GET /api/yo/cash/current — sesión activa + saldos esperados, gated por
// `close_register`. Mismo shape que /api/cash/current; sólo cambia el guard.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireManagerPermission(req, 'close_register');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client: clientStub } = access;

  const [client] = await db.select().from(clients).where(eq(clients.id, clientStub.id));
  if (!client) {
    return Response.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }
  if (!client.cashRegisterEnabled) {
    return Response.json({
      session: null,
      movements: [],
      expected: null,
      breakdown: null,
      cashRegisterEnabled: false,
    });
  }

  const [session] = await db
    .select()
    .from(cashSessions)
    .where(
      and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)),
    );

  if (!session) {
    return Response.json({
      session: null,
      movements: [],
      expected: null,
      breakdown: null,
      cashRegisterEnabled: true,
    });
  }

  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, session.id))
    .orderBy(asc(cashMovements.createdAt));

  const expected = computeExpectedClosing(
    session.openingCents,
    movements as unknown as MovementForCompute[],
  );

  const breakdown = await loadBreakdownForSession(client.id, session.id);

  return Response.json({
    session,
    movements,
    expected,
    breakdown,
    cashRegisterEnabled: true,
  });
}
