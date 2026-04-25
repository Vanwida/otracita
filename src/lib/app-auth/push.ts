import webpush from 'web-push'
import { db } from '@/db'
import { pushSubscriptions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// Web Push sender — thin wrapper around `web-push` with VAPID keys loaded
// once from env. Handles endpoint-expiry cleanup automatically: if the
// push service returns 404 / 410, we mark that subscription disabled so we
// don't keep retrying a dead phone.
//
// All subscription writes are idempotent on (endpoint) — the same phone
// re-subscribing just updates the keys and flips enabled=true.
// -----------------------------------------------------------------------------

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_CONTACT = process.env.VAPID_CONTACT ?? 'mailto:soporte@otracita.es'

let configured = false
function ensureConfigured() {
  if (configured) return
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing')
  }
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  icon?: string
  tag?: string
  data?: Record<string, unknown>
}

/**
 * Push a payload to every enabled subscription of the given user. Optional
 * `clientId` scopes to notifications from a specific barbería (e.g. reminder
 * from Private Studio only). Returns how many notifications were delivered
 * vs silently dropped (expired endpoints).
 */
export async function sendPushToUser(opts: {
  userId: string
  clientId?: string | null
  payload: PushPayload
}): Promise<{ sent: number; expired: number; failed: number }> {
  ensureConfigured()

  const baseFilter = [
    eq(pushSubscriptions.userId, opts.userId),
    eq(pushSubscriptions.enabled, true),
  ]
  const filter = opts.clientId
    ? and(...baseFilter, eq(pushSubscriptions.clientId, opts.clientId))
    : and(...baseFilter)

  const subs = await db.select().from(pushSubscriptions).where(filter)
  if (subs.length === 0) return { sent: 0, expired: 0, failed: 0 }

  const body = JSON.stringify(opts.payload)
  let sent = 0
  let expired = 0
  let failed = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        // Apple silently retains/drops Urgency: normal pushes on iOS until
        // the device is "active" — for user-visible notifications we want
        // them to land immediately, so always send with high urgency. TTL
        // 1h is enough; if the device is offline longer the notification
        // is stale anyway (reminder = today, promo = now).
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } },
          body,
          { urgency: 'high', TTL: 3600 },
        )
        sent++
        // Fire-and-forget lastUsed update.
        db.update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, s.id))
          .catch(() => {})
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          expired++
          await db
            .update(pushSubscriptions)
            .set({ enabled: false })
            .where(eq(pushSubscriptions.id, s.id))
        } else {
          failed++
          console.error('[push] send failed:', statusCode, err)
        }
      }
    }),
  )

  return { sent, expired, failed }
}

/**
 * Same but by customerPhone → useful for triggers that don't have an
 * app_user row handy (e.g. the reminder cron just has the booking row).
 * Returns zero sends if the phone isn't tied to any app_user.
 */
export async function sendPushByPhone(
  phone: string,
  clientId: string | null | undefined,
  payload: PushPayload,
): Promise<{ sent: number; expired: number; failed: number }> {
  const { appUsers } = await import('@/db/schema')
  const [user] = await db.select().from(appUsers).where(eq(appUsers.phone, phone))
  if (!user) return { sent: 0, expired: 0, failed: 0 }
  return sendPushToUser({ userId: user.id, clientId, payload })
}
