import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  computeExpectedClosing,
  computeDescuadre,
  type MovementForCompute,
} from '@/lib/cash/compute'

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

  const [closed] = await db
    .update(cashSessions)
    .set({
      closedAt: new Date(),
      closedByEmail: user.email,
      closingCentsExpected: expected.cashExpectedCents,
      closingCentsCounted: countedCash,
      cashDescuadreCents: cashDescuadre,
      cardTerminalExpectedCents: expected.cardExpectedCents,
      cardTerminalCountedCents: countedCard,
      cardDescuadreCents: cardDescuadre,
      notes,
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
