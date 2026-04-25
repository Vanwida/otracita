import { db } from '@/db'
import { appUsers, pushSubscriptions } from '@/db/schema'
import { and, eq, or, isNull } from 'drizzle-orm'
import { sendPushByPhone, type PushPayload } from '@/lib/app-auth/push'

// -----------------------------------------------------------------------------
// Notification dispatcher — one channel per outbound user event.
//
// Rule:
//   1. If the customer has at least one active push subscription for this
//      barbería (or a global one), send PUSH only.
//   2. Otherwise fall back to the WhatsApp closure provided by the caller.
//
// We intentionally don't double-send: paying for a WhatsApp template AND
// vibrating the phone twice for the same event is bad UX and burns money.
//
// Conversational replies in `whatsapp/engine.ts` are NOT routed through
// this — those are chat-thread replies, not push-able notifications.
// -----------------------------------------------------------------------------

export type DispatchChannel = 'push' | 'whatsapp' | 'none'

export interface DispatchResult {
  channel: DispatchChannel
  pushSent?: number
}

/**
 * Returns true if the given phone has at least one enabled push subscription
 * scoped to this client (or a global cross-barbería one).
 */
export async function hasActivePushSubscription(
  phone: string,
  clientId: string,
): Promise<boolean> {
  const [user] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.phone, phone))
  if (!user) return false

  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, user.id),
        eq(pushSubscriptions.enabled, true),
        or(eq(pushSubscriptions.clientId, clientId), isNull(pushSubscriptions.clientId)),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Dispatch a user notification — push first, WhatsApp as fallback.
 *
 * - If push is available AND at least one notification was delivered, the
 *   WhatsApp fallback is skipped.
 * - If push is not available (no subs, or all expired and the send returned
 *   `sent: 0`), the WhatsApp fallback runs.
 * - If `whatsappFallback` is omitted and push isn't available, returns
 *   `'none'` (caller decided WhatsApp wasn't applicable for this event).
 */
export async function dispatchUserNotification(opts: {
  phone: string
  clientId: string
  push: PushPayload
  whatsappFallback?: () => Promise<void>
}): Promise<DispatchResult> {
  const has = await hasActivePushSubscription(opts.phone, opts.clientId)

  if (has) {
    const result = await sendPushByPhone(opts.phone, opts.clientId, opts.push)
    if (result.sent > 0) return { channel: 'push', pushSent: result.sent }
    // All endpoints expired between the check and the send — fall through
    // so the user still gets the message via WhatsApp.
  }

  if (opts.whatsappFallback) {
    await opts.whatsappFallback()
    return { channel: 'whatsapp' }
  }

  return { channel: 'none' }
}
