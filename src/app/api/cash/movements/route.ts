import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/cash/movements — registra un movimiento manual en la sesión activa.
//
// Pensado para apuntes que NO vienen de un booking/sale automático:
//   - 'tip_cash'   propina recibida en mano
//   - 'expense'    gasto pagado en cash (proveedor, café, etc.)
//   - 'withdrawal' retirada de efectivo (al banco / al bolsillo)
//   - 'deposit'    aporte adicional de cambio durante el día
//   - 'adjustment' ajuste manual (raro, dejar nota)
//
// Los kinds 'booking' y 'product_sale' los inserta el flujo de
// "Marcar completado" / "vender producto" automáticamente — NO se aceptan
// aquí (el endpoint los rechaza para evitar dobles apuntes).
//
// Body:
//   {
//     kind: 'tip_cash' | 'expense' | 'withdrawal' | 'deposit' | 'adjustment',
//     method: 'cash' | 'card' | 'online',
//     amountCents: number (> 0),
//     notes?: string,
//   }
// -----------------------------------------------------------------------------

const ALLOWED_KINDS = ['tip_cash', 'expense', 'withdrawal', 'deposit', 'adjustment']
const ALLOWED_METHODS = ['cash', 'card', 'online']

interface Body {
  kind?: unknown
  method?: unknown
  amountCents?: unknown
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

  const kind = typeof body.kind === 'string' ? body.kind : ''
  if (!ALLOWED_KINDS.includes(kind)) {
    return Response.json(
      { error: `kind debe ser uno de: ${ALLOWED_KINDS.join(', ')}` },
      { status: 400 },
    )
  }

  const method = typeof body.method === 'string' ? body.method : ''
  if (!ALLOWED_METHODS.includes(method)) {
    return Response.json({ error: 'Método inválido' }, { status: 400 })
  }

  const amountCents =
    typeof body.amountCents === 'number'
      ? body.amountCents
      : Number.parseInt(String(body.amountCents ?? ''), 10)
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 1_000_000_000) {
    return Response.json({ error: 'Importe inválido' }, { status: 400 })
  }

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null

  // Sesión activa
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)))
  if (!session) {
    return Response.json(
      { error: 'No hay caja abierta. Abre una sesión antes de registrar movimientos.' },
      { status: 409 },
    )
  }

  const [movement] = await db
    .insert(cashMovements)
    .values({
      clientId: client.id,
      sessionId: session.id,
      kind,
      method,
      amountCents,
      notes,
      createdByEmail: user.email,
    })
    .returning()

  return Response.json({ movement }, { status: 201 })
}
