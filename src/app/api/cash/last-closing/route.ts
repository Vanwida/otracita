import { db } from '@/db'
import { cashSessions } from '@/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/cash/last-closing — devuelve el último cierre del cliente para
// usarlo como sugerencia de apertura en la próxima sesión (task #91).
//
// Respuesta:
//   { carryover: { sessionId, closedAt, closingCents } | null }
//
//   · `closingCents` es `closing_cents_counted` (efectivo contado en cajón
//     por el barbero), NO `closing_cents_expected`. El físico manda — si
//     había descuadre, el saldo real en el cajón es lo que contó.
//   · Sólo se devuelven sesiones con `closed_at IS NOT NULL` (es decir
//     cerradas formalmente; ignora sesiones huérfanas en estado "abierta").
//   · Si no hay cierres previos (primera apertura del cliente) ⇒ carryover: null.
//
// La UI usa este endpoint al abrir el modal de "Abrir caja" para pre-llenar
// el input y mostrar el badge "Saldo arrastrado del cierre del DD/MM".
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

  const [last] = await db
    .select({
      sessionId: cashSessions.id,
      closedAt: cashSessions.closedAt,
      closingCentsCounted: cashSessions.closingCentsCounted,
    })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.clientId, client.id),
        isNotNull(cashSessions.closedAt),
      ),
    )
    .orderBy(desc(cashSessions.closedAt))
    .limit(1)

  if (!last || last.closingCentsCounted === null || last.closedAt === null) {
    return Response.json({ carryover: null })
  }

  return Response.json({
    carryover: {
      sessionId: last.sessionId,
      closedAt: last.closedAt.toISOString(),
      closingCents: last.closingCentsCounted,
    },
  })
}
