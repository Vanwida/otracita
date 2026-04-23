import { db } from '@/db'
import { pushSubscriptions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'

// -----------------------------------------------------------------------------
// POST /api/app/push/unsubscribe
// Body: { endpoint: "https://..." }
//
// Disables the given subscription for the current user (soft delete —
// flip enabled=false). Called either when the browser's permission flips
// to denied, or when the user taps "Desactivar notificaciones" in the app.
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 })

  let body: { endpoint?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const endpoint = body.endpoint?.trim()
  if (!endpoint) return Response.json({ error: 'endpoint requerido' }, { status: 400 })

  await db
    .update(pushSubscriptions)
    .set({ enabled: false })
    .where(and(eq(pushSubscriptions.userId, session.userId), eq(pushSubscriptions.endpoint, endpoint)))

  return Response.json({ ok: true })
}
