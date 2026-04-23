// -----------------------------------------------------------------------------
// Client-side push helpers. Keeps the subscription dance out of the UI
// component so it's easy to test and reuse.
// -----------------------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const cleaned = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(cleaned)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied'

export function getPushStatus(): PushStatus {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushStatus
}

/**
 * Ask the browser for notification permission and, if granted, subscribe
 * with the Push Manager and POST the subscription to the server.
 * Returns the final permission state so the UI can render correctly.
 */
export async function subscribeToPush(slug: string): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as PushStatus

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) {
    console.error('NEXT_PUBLIC_VAPID_PUBLIC_KEY missing')
    return permission as PushStatus
  }

  // TS 5 tightened the PushManager types; Uint8Array<ArrayBufferLike> isn't
  // assignable to the expected ArrayBuffer-backed view. Copy into an
  // ArrayBuffer-backed Uint8Array explicitly to satisfy the DOM types.
  const keyBytes = urlBase64ToUint8Array(vapid)
  const buffer = new ArrayBuffer(keyBytes.byteLength)
  new Uint8Array(buffer).set(keyBytes)
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: buffer,
    }))

  await fetch('/api/app/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), slug }),
  })

  return 'granted'
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/app/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  await sub.unsubscribe().catch(() => {})
}
