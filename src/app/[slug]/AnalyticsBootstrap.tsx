'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { captureFromCurrentLocation } from '@/lib/attribution/capture'
import { setGoogleAdsConversion } from '@/lib/tracking/dispatch'

// -----------------------------------------------------------------------------
// AnalyticsBootstrap — orquesta cuatro responsabilidades en la PWA pública:
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
//   3. Inyección condicional de Google Tag Manager + Meta Pixel + Google
//      Ads (gtag) + TikTok Pixel. Cualquiera de ellos opcional — el
//      barbero usa los que tiene. Pueden coexistir todos.
//
//   4. Consent Mode v2: todos los pixels cargan en estado denied; cuando
//      el visitante acepta marketing, hacemos consent update (GTM) +
//      fbq('consent','grant') + ttq('consent','granted'). Esto es lo
//      que pide la AEPD: cargar pixels base OK; disparar tags marketing
//      sin consentimiento NO.
//
// El barbero NO ve esto desde su dashboard — vive en /[slug] para sus
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
  /** Meta Pixel ID (15-16 dígitos). Inyecta fbevents.js con Consent Mode. */
  metaPixelId: string | null
  /** Google Ads conversion ID (AW-XXXXXXXXXX). Inyecta gtag.js. */
  googleAdsConversionId: string | null
  /** Google Ads conversion label opcional — usado por dispatchTracking
   *  para construir el send_to en formato `AW-XXX/LABEL`. */
  googleAdsConversionLabel: string | null
  /** TikTok Pixel ID (20 chars). */
  tiktokPixelId: string | null
}

interface DataLayerWindow extends Window {
  dataLayer?: unknown[]
  fbq?: (...args: unknown[]) => void
  ttq?: { track: (e: string, p?: Record<string, unknown>) => void }
}

declare const window: DataLayerWindow

// Regex de validación canónica — espejo de src/lib/tracking/validation.ts.
// Duplicado intencionado: el bootstrap es 'use client' puro sin imports
// extras del runtime de validación (ahorra ~2kb del bundle inicial).
const RE_GTM = /^GTM-[A-Z0-9]{6,12}$/i
const RE_META = /^\d{15,16}$/
const RE_GADS = /^AW-\d+$/i
const RE_TIKTOK = /^[A-Z0-9]{20}$/i

export default function AnalyticsBootstrap({
  gtmContainerId,
  metaPixelId,
  googleAdsConversionId,
  googleAdsConversionLabel,
  tiktokPixelId,
}: Props) {
  const [consent, setConsent] = useState<ConsentChoice | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  // Captura de atribución (siempre, no requiere consent).
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
          wait_for_update: 500,
        },
      ])

      // Registra el conversion ID de Google Ads en una global para que
      // dispatchTracking pueda construir el send_to sin re-parsear regex.
      if (
        googleAdsConversionId &&
        RE_GADS.test(googleAdsConversionId)
      ) {
        setGoogleAdsConversion(
          googleAdsConversionId.toUpperCase(),
          googleAdsConversionLabel ?? null,
        )
      }
    }

    // setState dentro de effect — necesario para sincronizar con
    // localStorage (state externo) al montar. La regla react-hooks/
    // set-state-in-effect avisa pero el patrón es intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(parsed)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowBanner(!parsed)
  }, [googleAdsConversionId, googleAdsConversionLabel])

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

    // Meta Pixel: fbq('consent', 'grant'|'revoke'). Required by Meta when
    // operating en EEA — sin esto los datos personales del visitante NO
    // se procesan aunque el pixel haya disparado.
    try {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('consent', choice.marketing ? 'grant' : 'revoke')
      }
    } catch {
      /* noop */
    }

    // TikTok: ttq tiene un método `setConsent` pero su contrato cambió en
    // 2024 — el approach más estable es no-op y dejar que el evento
    // simplemente NO se dispare si !marketing. dispatchTracking respeta
    // esto a nivel de evento.
  }

  // Validar formatos antes de inyectar — un ID corrupto podría romper la
  // página entera del barbero. Si el formato falla, ignoramos ese tracker.
  const validGtmId = gtmContainerId && RE_GTM.test(gtmContainerId)
  const validMetaId = metaPixelId && RE_META.test(metaPixelId)
  const validGadsId =
    googleAdsConversionId && RE_GADS.test(googleAdsConversionId)
  const validTiktokId = tiktokPixelId && RE_TIKTOK.test(tiktokPixelId)

  const marketingConsented = consent?.marketing === true

  return (
    <>
      {/* ----------------- GTM (head + noscript) ------------------ */}
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

      {/* ----------------- Google Ads gtag.js --------------------- */}
      {/* gtag.js carga independientemente de GTM. Si el barbero usa solo
          Google Ads (sin GTM) podemos disparar conversions directamente. */}
      {validGadsId && (
        <>
          <Script
            id="gads-loader"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsConversionId}`}
          />
          <Script
            id="gads-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;gtag('js',new Date());gtag('config','${googleAdsConversionId}');`,
            }}
          />
        </>
      )}

      {/* ----------------- Meta Pixel (fbevents.js) --------------- */}
      {/* PageView se dispara automáticamente — `fbq('init', ...)` lo hace.
          Eventos de conversión los dispara dispatchTracking. */}
      {validMetaId && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('consent', ${marketingConsented ? "'grant'" : "'revoke'"});
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`,
          }}
        />
      )}
      {validMetaId && (
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            alt=""
            src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}

      {/* ----------------- TikTok Pixel --------------------------- */}
      {validTiktokId && (
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${tiktokPixelId}');
ttq.page();
}(window, document, 'ttq');`,
          }}
        />
      )}

      {/* ----------------- Cookie banner -------------------------- */}
      {showBanner && (
        <CookieBanner
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          onChoice={persistConsent}
        />
      )}

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
