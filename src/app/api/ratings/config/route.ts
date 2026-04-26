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
  /** Minutos entre fin del servicio y envío de la solicitud. 15..240. */
  followupMinutesAfter?: unknown
}

const MIN_DELAY = 15
const MAX_DELAY = 240
const DEFAULT_DELAY = 30

function sanitizeDelay(input: unknown): number {
  const n = typeof input === 'number' ? input : Number.parseInt(String(input), 10)
  if (!Number.isFinite(n)) return DEFAULT_DELAY
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(n)))
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
  // followupMinutesAfter es OPCIONAL — si el caller solo flipea el toggle no
  // toca la delay; si manda valor lo sanitizamos y lo aplicamos.
  const updates: { ratingsEnabled: boolean; followupMinutesAfter?: number; updatedAt: Date } = {
    ratingsEnabled: enabled,
    updatedAt: new Date(),
  }
  if (body.followupMinutesAfter !== undefined) {
    updates.followupMinutesAfter = sanitizeDelay(body.followupMinutesAfter)
  }

  await db.update(clients).set(updates).where(eq(clients.id, client.id))

  return Response.json({
    ok: true,
    ratingsEnabled: enabled,
    followupMinutesAfter: updates.followupMinutesAfter,
  })
}
