import { db } from '@/db'
import { clients, cashSessions } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// PATCH /api/cash/config — toggle del feature caja efectivo.
//
// Body: { enabled: boolean }
//
// Reglas de negocio:
//   · Activar (enabled=true): siempre permitido. No-op si ya está on.
//   · Desactivar (enabled=false): solo si NO hay sesión abierta. Si la
//     hay, devolvemos 409 — el barbero debe cerrarla primero. Esto evita
//     dejar movimientos huérfanos imposibles de cuadrar.
// -----------------------------------------------------------------------------

interface Body {
  enabled?: unknown
}

export async function PATCH(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (typeof body.enabled !== 'boolean') {
    return Response.json({ error: 'enabled debe ser boolean' }, { status: 400 })
  }

  // Si va a desactivarse, asegurar que no hay sesión abierta.
  if (body.enabled === false && client.cashRegisterEnabled) {
    const [open] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)))
    if (open) {
      return Response.json(
        { error: 'Cierra la caja del día antes de desactivar el control de efectivo.' },
        { status: 409 },
      )
    }
  }

  await db
    .update(clients)
    .set({ cashRegisterEnabled: body.enabled })
    .where(eq(clients.id, client.id))

  return Response.json({ enabled: body.enabled })
}
