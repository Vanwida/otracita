// -----------------------------------------------------------------------------
// otracita Service Worker — shared across /b/<slug>/* installations.
//
// Responsibilities:
//   · Handle incoming Web Push notifications (appointment reminders,
//     promo nudges when the barber has free slots, booking confirmations).
//   · Route notification clicks to the right in-app page — usually the
//     barbería profile or "My bookings".
//   · Keep a minimal offline shell so the PWA opens even without network.
//
// Purposefully does NOT precache per-barbería assets: the manifest + page
// are always fetched fresh (cache-busted by brand updates), so barbers can
// tweak their page and see it next visit.
// -----------------------------------------------------------------------------

const CACHE_NAME = 'otracita-pwa-v1'

self.addEventListener('install', () => {
  // Take over immediately on first install — no reason to keep an old SW
  // around for a page that hadn't been installed yet.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

// Network-first for document navigations: barber edits (colors/services)
// should land on the user's next visit without waiting for SW update.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Only intercept our own origin.
  if (url.origin !== self.location.origin) return
  // Don't intercept API calls or manifests — always fresh from network.
  if (url.pathname.startsWith('/api/') || url.pathname.includes('manifest.webmanifest')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((cached) => cached || new Response('Offline', { status: 503 }))),
    )
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'otracita', body: event.data.text() }
  }
  const {
    title = 'otracita',
    body = '',
    icon,
    badge,
    url,
    tag,
    image,
    data,
  } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icon.svg',
      badge: badge || '/icon.svg',
      image,
      tag: tag || 'otracita-default',
      data: { url: url || '/', ...(data || {}) },
      vibrate: [80, 40, 80],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // If an existing tab for the same barbería is open, focus it.
      for (const client of all) {
        try {
          const clientUrl = new URL(client.url)
          const desired = new URL(targetUrl, self.location.origin)
          if (clientUrl.origin === desired.origin && clientUrl.pathname.startsWith(desired.pathname.split('?')[0])) {
            await client.focus()
            if ('navigate' in client) {
              await client.navigate(targetUrl)
            }
            return
          }
        } catch {
          /* ignore parse errors */
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
