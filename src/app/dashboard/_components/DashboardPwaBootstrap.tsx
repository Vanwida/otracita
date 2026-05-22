'use client'

import { useEffect, useState } from 'react'
import { Download, Smartphone, X } from 'lucide-react'

// -----------------------------------------------------------------------------
// DashboardPwaBootstrap
//
// Registra el service worker del dashboard (`/dashboard/sw.js`, scope
// `/dashboard`) y muestra un banner discreto invitando a "Instalar app"
// cuando el navegador dispara `beforeinstallprompt` (Chrome/Edge Android,
// Chrome Desktop).
//
// En iOS Safari NO existe `beforeinstallprompt`. Para iPad/iPhone mostramos
// instrucciones manuales ("Compartir → Añadir a pantalla de inicio") solo
// si detectamos Safari iOS y la app NO está ya en modo standalone.
//
// Pensado para montarse UNA vez en `src/app/dashboard/layout.tsx`. No
// renderiza nada visible si ya está instalada o si el usuario descartó
// la invitación (persistencia 30 días en localStorage).
//
// Las decisiones de aspecto siguen los tokens del theme (`bg-surface`,
// `border-line`, `bg-brand`, etc.). Cero hex inline.
// -----------------------------------------------------------------------------

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'otracita-dashboard-pwa-install-dismissed'
const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

export default function DashboardPwaBootstrap() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [iosBrowser, setIosBrowser] = useState<'safari' | 'chrome' | 'firefox' | 'other' | null>(
    null,
  )
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // SW: registrar solo en producción para no entorpecer HMR en dev.
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/dashboard/sw.js', { scope: '/dashboard' })
        .catch(() => {
          /* silent — SW puede fallar en modo privado, no es crítico */
        })
    }

    // Detección iOS — solo Safari iOS puede instalar PWAs (restricción
    // de Apple). Si Alex abre /dashboard en Chrome iOS no aparecerá el
    // botón "Añadir a pantalla de inicio" en el share sheet.
    const ua = navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
    if (isIOS) {
      let next: 'chrome' | 'firefox' | 'safari' | 'other'
      if (/CriOS\//.test(ua)) next = 'chrome'
      else if (/FxiOS\//.test(ua)) next = 'firefox'
      else if (/EdgiOS\//.test(ua)) next = 'other'
      else if (/Safari\//.test(ua)) next = 'safari'
      else next = 'other'
      // UA detection se ejecuta solo una vez al montar — sincronización
      // controlada de estado externo (navigator.userAgent).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIosBrowser(next)
    }

    const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    setIsStandalone(standaloneMedia || iosStandalone === true)

    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw) {
        const ts = parseInt(raw, 10)
        if (!Number.isNaN(ts) && Date.now() - ts < DISMISS_WINDOW_MS) {
          setDismissed(true)
        }
      }
    } catch {
      /* localStorage puede estar deshabilitado */
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Hint iOS: no spammear al entrar — esperar 10s en la página antes
  // de aparecer.
  useEffect(() => {
    if (!iosBrowser || isStandalone || dismissed) return
    const t = setTimeout(() => setShowIosHint(true), 10000)
    return () => clearTimeout(t)
  }, [iosBrowser, isStandalone, dismissed])

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
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">Instala otracita en este dispositivo</p>
          <p className="text-xs text-ink-2">Acceso directo desde tu pantalla de inicio.</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-strong"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-ink-3 hover:text-ink-2"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (showIosHint && iosBrowser) {
    const isSafari = iosBrowser === 'safari'
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-line bg-surface p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1 text-sm">
            {isSafari ? (
              <>
                <p className="font-semibold text-ink">Instala otracita en tu iPad</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                  Pulsa <strong>Compartir</strong> y luego{' '}
                  <strong>Añadir a pantalla de inicio</strong>.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-ink">Abre esta página en Safari</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                  En iOS solo se puede instalar desde Safari. Ábrelo allí →{' '}
                  <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>.
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 text-ink-3 hover:text-ink-2"
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
