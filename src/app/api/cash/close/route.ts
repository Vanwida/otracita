import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  computeExpectedClosing,
  computeDescuadre,
  type MovementForCompute,
} from '@/lib/cash/compute'
import { loadBreakdownForSession } from '@/lib/cash/load-breakdown'
import type { CashClosingSnapshot } from '@/lib/cash/breakdown'

// -----------------------------------------------------------------------------
// POST /api/cash/close — cierra la sesión activa con cuadre.
//
// Body:
//   {
//     closingCentsCounted:        number,        // efectivo contado en el cajón
//     cardTerminalCountedCents?:  number | null, // total que muestra el TPV físico
//     notes?:                     string,        // observaciones del cierre
//   }
//
// Cálculos al cierre (snapshot inmutable):
//   - cashExpected     = opening + Σ signed(cash movements)
//   - cardExpected     = Σ signed(card movements)
//   - onlineExpected   = Σ signed(online movements)  // informativo
//   - cashDescuadre    = countedCash - cashExpected
//   - cardDescuadre    = countedCard - cardExpected (null si no se contó)
//
// Tras este endpoint la sesión queda inmutable (closed_at != null) y el
// UNIQUE partial idx libera el slot para abrir otra.
// -----------------------------------------------------------------------------

interface Body {
  closingCentsCounted?: unknown
  cardTerminalCountedCents?: unknown
  notes?: unknown
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, user } = access

  if (!client.cashRegisterEnabled) {
    return Response.json(
      { error: 'La caja efectivo no está activa para este negocio.' },
      { status: 403 },
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const countedCash =
    typeof body.closingCentsCounted === 'number'
      ? body.closingCentsCounted
      : Number.parseInt(String(body.closingCentsCounted ?? ''), 10)
  if (!Number.isFinite(countedCash) || countedCash < 0 || countedCash > 1_000_000_000) {
    return Response.json({ error: 'Importe contado inválido' }, { status: 400 })
  }

  let countedCard: number | null = null
  if (body.cardTerminalCountedCents !== undefined && body.cardTerminalCountedCents !== null) {
    const parsed =
      typeof body.cardTerminalCountedCents === 'number'
        ? body.cardTerminalCountedCents
        : Number.parseInt(String(body.cardTerminalCountedCents), 10)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) {
      return Response.json({ error: 'Total datáfono inválido' }, { status: 400 })
    }
    countedCard = parsed
  }

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null

  // Sesión activa
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)))
  if (!session) {
    return Response.json({ error: 'No hay caja abierta.' }, { status: 404 })
  }

  // Movimientos de la sesión para calcular expected
  const movements = await db
    .select({
      kind: cashMovements.kind,
      method: cashMovements.method,
      amountCents: cashMovements.amountCents,
    })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, session.id))

  const expected = computeExpectedClosing(
    session.openingCents,
    movements as MovementForCompute[],
  )
  const cashDescuadre = computeDescuadre(expected.cashExpectedCents, countedCash)
  const cardDescuadre = computeDescuadre(expected.cardExpectedCents, countedCard)

  // Foto del desglose JUSTO antes de cerrar — la persistimos en
  // closing_snapshot para histórico y para reconstruir el reporte tal cual
  // lo vio el barbero. Reusa el mismo loader que la UI live.
  const breakdown = await loadBreakdownForSession(client.id, session.id)

  // Blindaje server-side contra movimientos con method legacy/NULL. Sin
  // esto el cuadre que persistimos sería inconsistente (cash_movements
  // huérfanos sin entrar en byMethod). La UI ya lo bloquea, esto es
  // defensa en profundidad.
  if (breakdown.unknownMethodCount > 0) {
    return Response.json(
      {
        error: `Hay ${breakdown.unknownMethodCount} movimientos sin método de pago. Corrígelos antes de cerrar.`,
      },
      { status: 409 },
    )
  }
  const closedAtIso = new Date().toISOString()
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
    closedByEmail: user.email,
    closedAt: closedAtIso,
  }

  const [closed] = await db
    .update(cashSessions)
    .set({
      closedAt: new Date(closedAtIso),
      closedByEmail: user.email,
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
    .returning()

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
  })
}
