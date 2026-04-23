import { db } from '@/db'
import { clients, pushSubscriptions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'

// -----------------------------------------------------------------------------
// POST /api/app/push/subscribe
// Body: {
//   subscription: { endpoint, keys: { p256dh, auth } },
//   slug?: "barberia-slug"
// }
//
// Persists a Web Push subscription for the logged-in app user, scoped to a
// specific barbería when a slug is provided. Idempotent on endpoint: same
// device re-subscribing just updates the keys + re-enables. Called by the
// PWA right after the browser's permission grant.
// -----------------------------------------------------------------------------

interface IncomingSubscription {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export async function POST(req: Request) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 })

  let body: { subscription?: IncomingSubscription; slug?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const sub = body.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: 'Subscription incompleta' }, { status: 400 })
  }

  let clientId: string | null = null
  if (body.slug) {
    const [client] = await db.select().from(clients).where(eq(clients.publicSlug, body.slug))
    clientId = client?.id ?? null
  }

  // Upsert on endpoint (unique). On conflict, refresh keys + re-enable.
  await db
    .insert(pushSubscriptions)
    .values({
      userId: session.userId,
      clientId,
      endpoint,
      p256dh,
      authKey: auth,
      userAgent: req.headers.get('user-agent'),
      enabled: true,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: session.userId,
        clientId,
        p256dh,
        authKey: auth,
        userAgent: req.headers.get('user-agent'),
        enabled: true,
        lastUsedAt: new Date(),
      },
    })

  return Response.json({ ok: true })
}
