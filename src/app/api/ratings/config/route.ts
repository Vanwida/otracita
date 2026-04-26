import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// PATCH /api/ratings/config
//
// Body: { ratingsEnabled: boolean }
//
// Toggle on/off para que la barbería pida reseñas a sus clientes tras cada
// servicio. Independiente de propinas (Stripe Connect) — un barbero puede
// pedir reseñas sin Connect, pero si ADEMÁS tiene tipsEnabled + Connect
// activo, el flow de propina se inserta dentro del de rating cuando la
// nota es ≥ 4.
// -----------------------------------------------------------------------------

interface Body {
  ratingsEnabled?: unknown
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

  const enabled = body.ratingsEnabled === true

  await db
    .update(clients)
    .set({ ratingsEnabled: enabled, updatedAt: new Date() })
    .where(eq(clients.id, client.id))

  return Response.json({ ok: true, ratingsEnabled: enabled })
}
