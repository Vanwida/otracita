'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

// -----------------------------------------------------------------------------
// PwaBootstrap — registers the shared service worker (/sw.js) and shows a
// small "Instalar app" banner when the browser signals the PWA is eligible
// for install (beforeinstallprompt — Chrome/Edge/Samsung on Android).
//
// On iOS Safari there's no beforeinstallprompt event; users must add to Home
// Screen manually via the share sheet. We show an "Añadir a Pantalla de
// Inicio" hint only for iOS so they know it's possible.
//
// `brand` colors the prompt so it matches the barbería's identity.
// -----------------------------------------------------------------------------

interface Props {
  businessName: string
  brand: string
}

// Minimal subset of the experimental BeforeInstallPromptEvent shape.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'otracita-pwa-install-dismissed'

export default function PwaBootstrap({ businessName, brand }: Props) {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Register the service worker (once, scoped to the whole domain).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW fails silently in dev/private mode — not critical */
      })
    }

    // Detect iOS + standalone mode. Standalone = already installed,
    // no need to nag.
    const ua = navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(ua)
    setIsIOS(ios)

    const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches
    // Safari-specific non-standard flag for home-screen apps.
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    setIsStandalone(standaloneMedia || iosStandalone === true)

    // Previously dismissed by this user? Respect for 30 days.
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw) {
        const ts = parseInt(raw, 10)
        if (!Number.isNaN(ts) && Date.now() - ts < 30 * 24 * 60 * 60 * 1000) {
          setDismissed(true)
        }
      }
    } catch {
      /* no-op: localStorage may be disabled */
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Show iOS hint after 8 seconds on the page to not annoy on first bounce.
  useEffect(() => {
    if (!isIOS || isStandalone || dismissed) return
    const timer = setTimeout(() => setShowIosHint(true), 8000)
    return () => clearTimeout(timer)
  }, [isIOS, isStandalone, dismissed])

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
    setDismissed(true)
    setInstallEvent(null)
    setShowIosHint(false)
  }

  if (dismissed || isStandalone) return null

  if (installEvent) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto rounded-2xl shadow-lg border bg-white border-[var(--color-line)] p-4 flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold"
          style={{ background: brand }}
        >
          {businessName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">Instalar app de {businessName}</p>
          <p className="text-xs text-[var(--color-ink-2)]">Reserva en un toque desde tu pantalla de inicio.</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white shrink-0"
          style={{ background: brand }}
        >
          <Download className="h-3.5 w-3.5" />
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] shrink-0"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (showIosHint) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto rounded-2xl shadow-lg border bg-white border-[var(--color-line)] p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold"
            style={{ background: brand }}
          >
            {businessName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold">Instala {businessName} en tu móvil</p>
            <p className="text-xs text-[var(--color-ink-2)] mt-0.5 leading-relaxed">
              Pulsa <span aria-label="compartir">⎋</span> <strong>Compartir</strong> en Safari y luego{' '}
              <strong>Añadir a pantalla de inicio</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return null
}
