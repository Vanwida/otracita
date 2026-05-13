'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { captureFromCurrentLocation } from '@/lib/attribution/capture'

// -----------------------------------------------------------------------------
// AnalyticsBootstrap — orquesta tres responsabilidades en la PWA pública:
//
//   1. Captura de atribución (UTM/referrer) en localStorage al cargar la
//      página. No requiere consentimiento — es atribución INTERNA, no se
//      comparte con terceros. Solo determina el `referrer_source` del
//      booking que el cliente acabe haciendo.
//
//   2. Banner de cookies (CMP). Aparece la primera vez que un visitante
//      llega sin haber elegido. 3 opciones: Aceptar / Solo necesarias /
//      Personalizar (las dos primeras suficientes para la mayoría).
//
//   3. Inyección condicional de Google Tag Manager. Solo si el barbero
//      ha configurado un container ID en /dashboard/app (feature Pro).
//      Usa Consent Mode v2: GTM SIEMPRE carga con consent default=denied;
//      cuando el visitante acepta, se hace consent update y los tags
//      empiezan a disparar. Esto es lo que pide la AEPD: cargar el
//      contenedor está OK; disparar marketing tags sin consentimiento NO.
//
// El barbero NO ve esto desde su dashboard — vive en /b/[slug] para sus
// clientes finales.
// -----------------------------------------------------------------------------

const CONSENT_KEY = 'otracita_consent_v1'

interface ConsentChoice {
  v: 1
  necessary: true // siempre
  analytics: boolean
  marketing: boolean
  capturedAt: number
}

interface Props {
  /** GTM-XXXXX si el barbero lo tiene configurado. Si es null, no
   *  cargamos GTM pero seguimos capturando atribución + mostrando banner
   *  (legal, no opcional). */
  gtmContainerId: string | null
}

interface DataLayerWindow extends Window {
  dataLayer?: unknown[]
}

declare const window: DataLayerWindow

export default function AnalyticsBootstrap({ gtmContainerId }: Props) {
  const [consent, setConsent] = useState<ConsentChoice | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  // Captura de atribución (siempre, no requiere consent).
  // ESLint warning: setState en effect es necesario aquí — sincronizamos
  // con localStorage (external state) al montar.
  useEffect(() => {
    captureFromCurrentLocation()

    // Lee consent guardado y empuja defaults a dataLayer ANTES de GTM.
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CONSENT_KEY) : null
    let parsed: ConsentChoice | null = null
    if (raw) {
      try {
        const obj = JSON.parse(raw) as ConsentChoice
        if (obj.v === 1) parsed = obj
      } catch {
        /* fallthrough */
      }
    }

    // Inicializa dataLayer y consent defaults SIEMPRE antes de GTM.
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || []
      const granted = parsed?.analytics === true
      const marketing = parsed?.marketing === true
      window.dataLayer.push([
        'consent',
        'default',
        {
          ad_storage: marketing ? 'granted' : 'denied',
          analytics_storage: granted ? 'granted' : 'denied',
          ad_user_data: marketing ? 'granted' : 'denied',
          ad_personalization: marketing ? 'granted' : 'denied',
          functionality_storage: 'granted',
          security_storage: 'granted',
          wait_for_update: 500, // ms — espera por si el usuario decide rápido
        },
      ])
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(parsed)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowBanner(!parsed)
  }, [])

  function persistConsent(choice: { analytics: boolean; marketing: boolean }) {
    const value: ConsentChoice = {
      v: 1,
      necessary: true,
      analytics: choice.analytics,
      marketing: choice.marketing,
      capturedAt: Date.now(),
    }
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(value))
    } catch {
      /* QuotaExceeded — fallback in-memory only para esta sesión */
    }
    setConsent(value)
    setShowBanner(false)

    // Push consent update a GTM (los tags con consent gating ahora pueden
    // disparar si granted).
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push([
        'consent',
        'update',
        {
          ad_storage: choice.marketing ? 'granted' : 'denied',
          analytics_storage: choice.analytics ? 'granted' : 'denied',
          ad_user_data: choice.marketing ? 'granted' : 'denied',
          ad_personalization: choice.marketing ? 'granted' : 'denied',
        },
      ])
    }
  }

  // Validar formato GTM-XXXXX (entre 6 y 12 chars alfanuméricos)
  const validGtmId = gtmContainerId && /^GTM-[A-Z0-9]{6,12}$/i.test(gtmContainerId)

  return (
    <>
      {/* GTM head script — carga aunque no haya consent. Consent Mode v2
          se encarga de que los tags marketing no disparen hasta que el
          usuario acepte. */}
      {validGtmId && (
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmContainerId}');`,
          }}
        />
      )}
      {/* GTM noscript fallback */}
      {validGtmId && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmContainerId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
      )}

      {/* Cookie consent banner */}
      {showBanner && <CookieBanner showDetails={showDetails} setShowDetails={setShowDetails} onChoice={persistConsent} />}

      {/* Botón flotante para reabrir el banner si quiere cambiar preferencias.
          Aparece solo si ya eligió. Discreto. */}
      {consent && !showBanner && (
        <button
          type="button"
          onClick={() => setShowBanner(true)}
          aria-label="Preferencias de cookies"
          className="fixed bottom-3 left-3 z-30 h-9 px-3 rounded-full bg-black/60 text-white text-[11px] backdrop-blur-sm hover:bg-black/80 transition-colors"
        >
          Cookies
        </button>
      )}
    </>
  )
}

// -----------------------------------------------------------------------------
// CookieBanner — sub-componente para mantener AnalyticsBootstrap legible.
// Diseño: bottom sheet sobrio, ocupa ancho completo en móvil, max-width en
// desktop. Tres botones primarios; "Personalizar" expande detalle inline.
// -----------------------------------------------------------------------------

interface BannerProps {
  showDetails: boolean
  setShowDetails: (b: boolean) => void
  onChoice: (c: { analytics: boolean; marketing: boolean }) => void
}

function CookieBanner({ showDetails, setShowDetails, onChoice }: BannerProps) {
  const [analytics, setAnalytics] = useState(true)
  const [marketing, setMarketing] = useState(true)

  return (
    <div
      role="dialog"
      aria-label="Preferencias de cookies"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none"
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-black/10 bg-white shadow-2xl pointer-events-auto p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] text-gray-900 mb-1">Cookies en esta página</p>
            <p className="text-[13px] leading-relaxed text-gray-700">
              Usamos cookies para reservas (necesarias) y, si lo aceptas, también para análisis y
              personalización de anuncios del barbero. Puedes cambiar tu elección cuando quieras.
            </p>
          </div>
        </div>

        {showDetails && (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <label className="flex items-start gap-3 text-[13px] text-gray-700 cursor-not-allowed opacity-60">
              <input type="checkbox" checked disabled className="mt-0.5" />
              <span>
                <strong className="text-gray-900">Necesarias</strong> — esenciales para que la
                reserva funcione. Siempre activas.
              </span>
            </label>
            <label className="flex items-start gap-3 text-[13px] text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-gray-900">Análisis</strong> — ayuda al barbero a entender
                qué páginas funcionan.
              </span>
            </label>
            <label className="flex items-start gap-3 text-[13px] text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-gray-900">Marketing</strong> — permite al barbero medir si
                sus campañas en redes/Google traen reservas.
              </span>
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          {!showDetails && (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-2"
            >
              Personalizar
            </button>
          )}
          <button
            type="button"
            onClick={() => onChoice({ analytics: false, marketing: false })}
            className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-full border border-gray-200 hover:bg-gray-50"
          >
            Solo necesarias
          </button>
          <button
            type="button"
            onClick={() =>
              onChoice(
                showDetails ? { analytics, marketing } : { analytics: true, marketing: true },
              )
            }
            className="text-[13px] font-semibold text-white px-4 py-2 rounded-full bg-gray-900 hover:bg-gray-800"
          >
            {showDetails ? 'Guardar elección' : 'Aceptar todo'}
          </button>
        </div>
      </div>
    </div>
  )
}
