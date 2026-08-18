// -----------------------------------------------------------------------------
// dispatchTracking — front-only helper. Propaga eventos de conversión a
// TODOS los trackers cargados en window (GTM/GA4, Meta, Google Ads, TikTok)
// en su formato canónico:
//
//   booking_confirmed  → Purchase (Meta/TikTok) + conversion (Google Ads)
//                        + booking_confirmed (GA4 / GTM dataLayer)
//   tip_paid           → Purchase (Meta/TikTok, content_type=tip)
//                        + tip_paid (GTM dataLayer)
//   no_show_charged    → Purchase (Meta/TikTok, content_type=no_show_fee)
//                        + no_show_charged (GTM dataLayer)
//
// Silencioso si el tracker correspondiente no está cargado — el barbero
// puede tener solo Meta, solo Google Ads, los 4, o ninguno. Sin throws.
//
// SOLO se llama desde código cliente ('use client'). En SSR/server hace
// noop porque `window` no existe.
// -----------------------------------------------------------------------------

export type TrackingEvent =
  | 'booking_confirmed'
  | 'tip_paid'
  | 'no_show_charged'

export interface DispatchPayload {
  event: TrackingEvent
  /** Valor en CÉNTIMOS (mismo convenio que el resto del backend, salvo
   *  el catálogo jsonb de servicios, que sí está en euros). */
  valueCents?: number
  currency?: string
  /** Para de-dupe en Meta/Google Ads — normalmente el bookingId o tipId. */
  transactionId?: string
  /** Datos opcionales adicionales (nombre servicio, barbero, etc.). */
  metadata?: Record<string, unknown>
}

interface TrackingWindow extends Window {
  dataLayer?: unknown[]
  // Meta Pixel
  fbq?: (
    cmd: string,
    arg1?: string,
    arg2?: Record<string, unknown>,
    arg3?: Record<string, unknown>,
  ) => void
  // Google Ads / GA4 gtag
  gtag?: (...args: unknown[]) => void
  // TikTok Pixel
  ttq?: {
    track: (event: string, params?: Record<string, unknown>) => void
  }
  // Tags inyectados por nuestro AnalyticsBootstrap — IDs para google_ads.
  __otc_google_ads_conversion?: {
    id: string
    label: string | null
  }
}

declare const window: TrackingWindow

/** Convierte valueCents → euros (para los pixels que esperan unidades
 *  fraccionarias, que son todos). */
function toEuros(valueCents: number | undefined): number {
  if (typeof valueCents !== 'number' || !Number.isFinite(valueCents)) return 0
  return Math.max(0, valueCents) / 100
}

/** Mapping de evento interno → nombres canónicos por plataforma. */
const META_EVENT: Record<TrackingEvent, string> = {
  booking_confirmed: 'Purchase',
  tip_paid: 'Purchase',
  no_show_charged: 'Purchase',
}

const TIKTOK_EVENT: Record<TrackingEvent, string> = {
  booking_confirmed: 'CompletePayment',
  tip_paid: 'CompletePayment',
  no_show_charged: 'CompletePayment',
}

const META_CONTENT_TYPE: Record<TrackingEvent, string> = {
  booking_confirmed: 'service',
  tip_paid: 'tip',
  no_show_charged: 'no_show_fee',
}

export function dispatchTracking(payload: DispatchPayload): void {
  if (typeof window === 'undefined') return
  const value = toEuros(payload.valueCents)
  const currency = payload.currency ?? 'EUR'
  const eventId = payload.transactionId

  // -------------------- GTM dataLayer + GA4 ---------------------------
  // Mantenemos el contrato existente: push del evento con ecommerce
  // payload. Si el barbero solo usa GTM, ya lo escucha desde aquí.
  try {
    window.dataLayer = window.dataLayer ?? []
    window.dataLayer.push({
      event: payload.event,
      ecommerce: {
        currency,
        value,
        transaction_id: eventId,
        ...(payload.metadata ?? {}),
      },
    })
  } catch {
    /* noop */
  }

  // -------------------- Google Ads conversion -------------------------
  // gtag('event', 'conversion', { send_to: 'AW-XXX/LABEL', value, currency })
  // Solo si gtag está cargado Y tenemos el conversion ID en window.
  try {
    if (
      typeof window.gtag === 'function' &&
      window.__otc_google_ads_conversion?.id
    ) {
      const { id, label } = window.__otc_google_ads_conversion
      const sendTo = label ? `${id}/${label}` : id
      window.gtag('event', 'conversion', {
        send_to: sendTo,
        value,
        currency,
        transaction_id: eventId,
      })
    }
  } catch {
    /* noop */
  }

  // -------------------- Meta Pixel ------------------------------------
  // fbq('track', 'Purchase', { value, currency, content_type, content_ids })
  // eventID como cuarto arg = deduplication contra Conversions API (que
  // hoy NO usamos, pero el barbero puede activarla server-side luego).
  try {
    if (typeof window.fbq === 'function') {
      const fbParams: Record<string, unknown> = {
        value,
        currency,
        content_type: META_CONTENT_TYPE[payload.event],
      }
      if (eventId) fbParams.content_ids = [eventId]
      const opts = eventId ? { eventID: eventId } : undefined
      window.fbq('track', META_EVENT[payload.event], fbParams, opts)
    }
  } catch {
    /* noop */
  }

  // -------------------- TikTok Pixel ----------------------------------
  // ttq.track('CompletePayment', { value, currency, content_id, content_type })
  try {
    if (window.ttq && typeof window.ttq.track === 'function') {
      const ttkParams: Record<string, unknown> = {
        value,
        currency,
        content_type: META_CONTENT_TYPE[payload.event],
      }
      if (eventId) ttkParams.content_id = eventId
      window.ttq.track(TIKTOK_EVENT[payload.event], ttkParams)
    }
  } catch {
    /* noop */
  }
}

/** Helper para que el bootstrap registre el conversion ID/label de
 *  Google Ads en una propiedad global única — evita parsear regex en
 *  cada dispatch. */
export function setGoogleAdsConversion(id: string, label: string | null): void {
  if (typeof window === 'undefined') return
  window.__otc_google_ads_conversion = { id, label }
}
