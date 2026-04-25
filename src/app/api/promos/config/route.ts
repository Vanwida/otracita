import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// PATCH /api/promos/config
//
// Body: { promosEnabled: boolean }
//
// Activa/desactiva las promos contextuales para esta barbería. Es opt-in
// porque al activarlo el barbero declara que sus clientes han consentido
// recibir comunicaciones de marketing (lo que permite mandar mensajes
// promocionales fuera del estricto contexto transaccional).
// -----------------------------------------------------------------------------

interface Body {
  promosEnabled?: unknown
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

  const enabled = body.promosEnabled === true

  await db
    .update(clients)
    .set({ promosEnabled: enabled, updatedAt: new Date() })
    .where(eq(clients.id, client.id))

  return Response.json({ ok: true, promosEnabled: enabled })
}
