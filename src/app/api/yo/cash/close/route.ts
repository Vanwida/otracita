import { db } from '@/db';
import { cashSessions, cashMovements, clients } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
  requireManagerPermission,
  managerPermissionErrorResponse,
} from '@/lib/manager-permissions/guard';
import {
  computeExpectedClosing,
  computeDescuadre,
  type MovementForCompute,
} from '@/lib/cash/compute';
import { loadBreakdownForSession } from '@/lib/cash/load-breakdown';
import type { CashClosingSnapshot } from '@/lib/cash/breakdown';

// -----------------------------------------------------------------------------
// POST /api/yo/cash/close (#72) — variante de /api/cash/close que un
// barbero Manager con `close_register` puede llamar desde /yo/ventas.
//
// Misma lógica que el endpoint admin: cuadre + snapshot inmutable. Sólo
// cambia el guard: `requireManagerPermission('close_register')` en vez de
// `requireClientAccess`. El user.email del snapshot queda como "cierre por
// [nombre del barbero]" para auditoría.
// -----------------------------------------------------------------------------

interface Body {
  closingCentsCounted?: unknown;
  cardTerminalCountedCents?: unknown;
  notes?: unknown;
}

export async function POST(req: Request) {
  const access = await requireManagerPermission(req, 'close_register');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client: clientRow, barber, user } = access;

  // Re-cargar el client (necesitamos cashRegisterEnabled — no viene en
  // el shape mínimo de requireBarberRole).
  const [client] = await db.select().from(clients).where(eq(clients.id, clientRow.id));
  if (!client) {
    return Response.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }
  if (!client.cashRegisterEnabled) {
    return Response.json(
      { error: 'La caja efectivo no está activa para este negocio.' },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const countedCash =
    typeof body.closingCentsCounted === 'number'
      ? body.closingCentsCounted
      : Number.parseInt(String(body.closingCentsCounted ?? ''), 10);
  if (!Number.isFinite(countedCash) || countedCash < 0 || countedCash > 1_000_000_000) {
    return Response.json({ error: 'Importe contado inválido' }, { status: 400 });
  }

  let countedCard: number | null = null;
  if (body.cardTerminalCountedCents !== undefined && body.cardTerminalCountedCents !== null) {
    const parsed =
      typeof body.cardTerminalCountedCents === 'number'
        ? body.cardTerminalCountedCents
        : Number.parseInt(String(body.cardTerminalCountedCents), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) {
      return Response.json({ error: 'Total datáfono inválido' }, { status: 400 });
    }
    countedCard = parsed;
  }

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

  const [session] = await db
    .select()
    .from(cashSessions)
    .where(
      and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)),
    );
  if (!session) {
    return Response.json({ error: 'No hay caja abierta.' }, { status: 404 });
  }

  const movements = await db
    .select({
      kind: cashMovements.kind,
      method: cashMovements.method,
      amountCents: cashMovements.amountCents,
    })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, session.id));

  const expected = computeExpectedClosing(
    session.openingCents,
    movements as MovementForCompute[],
  );
  const cashDescuadre = computeDescuadre(expected.cashExpectedCents, countedCash);
  const cardDescuadre = computeDescuadre(expected.cardExpectedCents, countedCard);

  const breakdown = await loadBreakdownForSession(client.id, session.id);
  if (breakdown.unknownMethodCount > 0) {
    return Response.json(
      {
        error: `Hay ${breakdown.unknownMethodCount} movimientos sin método de pago. Pide al jefe que los corrija antes de cerrar.`,
      },
      { status: 409 },
    );
  }

  const closedByEmail = `${barber.name} <${user.email}>`;
  const closedAtIso = new Date().toISOString();
  const snapshot: CashClosingSnapshot = {
    version: 1,
    openingCents: session.openingCents,
    cashExpectedCents: expected.cashExpectedCents,
    cardExpectedCents: expected.cardExpectedCents,
    onlineExpectedCents: expected.onlineExpectedCents,
    totalExpectedCents:
      expected.cashExpectedCents +
      expected.cardExpectedCents +
      expected.onlineExpectedCents,
    byMethod: breakdown.byMethod,
    byKind: breakdown.byKind,
    byBarber: breakdown.byBarber,
    byPaymentDetail: breakdown.byPaymentDetail,
    movements: breakdown.movements,
    totals: breakdown.totals,
    cashCountedCents: countedCash,
    cardCountedCents: countedCard,
    cashDescuadreCents: cashDescuadre,
    cardDescuadreCents: cardDescuadre,
    closedByEmail,
    closedAt: closedAtIso,
  };

  const [closed] = await db
    .update(cashSessions)
    .set({
      closedAt: new Date(closedAtIso),
      closedByEmail,
      closingCentsExpected: expected.cashExpectedCents,
      closingCentsCounted: countedCash,
      cashDescuadreCents: cashDescuadre,
      cardTerminalExpectedCents: expected.cardExpectedCents,
      cardTerminalCountedCents: countedCard,
      cardDescuadreCents: cardDescuadre,
      notes,
      closingSnapshot: snapshot,
    })
    .where(eq(cashSessions.id, session.id))
    .returning();

  return Response.json({
    session: closed,
    summary: {
      cashExpectedCents: expected.cashExpectedCents,
      cashCountedCents: countedCash,
      cashDescuadreCents: cashDescuadre,
      cardExpectedCents: expected.cardExpectedCents,
      cardCountedCents: countedCard,
      cardDescuadreCents: cardDescuadre,
      onlineExpectedCents: expected.onlineExpectedCents,
    },
  });
}
