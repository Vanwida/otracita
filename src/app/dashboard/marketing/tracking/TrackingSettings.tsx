'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  Loader2,
  ExternalLink,
  AlertCircle,
  PlayCircle,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import {
  TRACKING_FIELDS,
  TRACKING_LABELS,
  TRACKING_PLACEHOLDERS,
  TRACKING_FORMAT_ERROR,
  validateTrackingField,
  normalizeTrackingValue,
  type TrackingField,
} from '@/lib/tracking/validation'

// -----------------------------------------------------------------------------
// TrackingSettings — formulario monkey-proof para los 5 IDs de tracking:
// GTM container, Meta Pixel, Google Ads conversion ID, Google Ads label,
// TikTok Pixel.
//
// Layout: grid 2-col en desktop, stack en móvil. Cada slot es independiente
// con auto-save al blur (mismo patrón que GtmSettings / TipsSettings /
// LoyaltySettings). Validación inline contra los regex canónicos (mismos
// que el server action). Detección de duplicados en el guardado server-side
// — la respuesta 400 con `conflict` se muestra como banner global.
//
// "Vista previa" lista qué scripts cargarán al publicar; "Enviar evento de
// prueba" abre /[slug] en pestaña nueva con ?test=1 — la PWA reconoce el
// flag y dispara dispatchTracking('booking_confirmed', test) para que el
// barbero vea el evento llegando a Meta/Google/TikTok en tiempo real.
// -----------------------------------------------------------------------------

interface Initial {
  gtmContainerId: string | null
  metaPixelId: string | null
  googleAdsConversionId: string | null
  googleAdsConversionLabel: string | null
  tiktokPixelId: string | null
}

interface Props {
  initial: Initial
  /** Slug público del barbero — necesario para el botón "Enviar evento de
   *  prueba" (abre /[slug]?tracking_test=1). */
  publicSlug: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface HelpItem {
  title: string
  body: string
  href: string
  hrefLabel: string
}

const HELP: Record<TrackingField, HelpItem> = {
  gtmContainerId: {
    title: '¿Cómo encuentro mi GTM?',
    body: 'En tagmanager.google.com, esquina superior derecha, junto al nombre del workspace. Empieza por GTM-',
    href: 'https://tagmanager.google.com/',
    hrefLabel: 'Abrir Google Tag Manager',
  },
  metaPixelId: {
    title: '¿Cómo encuentro mi Meta Pixel?',
    body: 'En business.facebook.com → Events Manager → tu pixel → arriba a la izquierda aparece el ID (15-16 dígitos).',
    href: 'https://business.facebook.com/events_manager2',
    hrefLabel: 'Abrir Events Manager',
  },
  googleAdsConversionId: {
    title: '¿Cómo encuentro mi Google Ads ID?',
    body: 'En Google Ads → Herramientas y configuración → Conversiones → click en tu conversión → "Configuración de la etiqueta". El ID empieza por AW-.',
    href: 'https://ads.google.com/aw/conversions',
    hrefLabel: 'Abrir Conversiones',
  },
  googleAdsConversionLabel: {
    title: '¿Y el label?',
    body: 'En la misma página de la conversión, junto al ID, hay una cadena tipo "AbCdEf-GhIjKlMn". Eso es el label (opcional pero recomendado).',
    href: 'https://ads.google.com/aw/conversions',
    hrefLabel: 'Abrir Conversiones',
  },
  tiktokPixelId: {
    title: '¿Cómo encuentro mi TikTok Pixel?',
    body: 'En business.tiktok.com → Assets → Events → Web Events. El Pixel ID son 20 caracteres alfanuméricos.',
    href: 'https://business.tiktok.com/',
    hrefLabel: 'Abrir TikTok Ads Manager',
  },
}

export default function TrackingSettings({ initial, publicSlug }: Props) {
  const [values, setValues] = useState<Record<TrackingField, string>>({
    gtmContainerId: initial.gtmContainerId ?? '',
    metaPixelId: initial.metaPixelId ?? '',
    googleAdsConversionId: initial.googleAdsConversionId ?? '',
    googleAdsConversionLabel: initial.googleAdsConversionLabel ?? '',
    tiktokPixelId: initial.tiktokPixelId ?? '',
  })
  const [savedValues, setSavedValues] = useState<Record<TrackingField, string>>({
    ...values,
  })
  const [errors, setErrors] = useState<Partial<Record<TrackingField, string>>>({})
  const [state, setState] = useState<Record<TrackingField, SaveState>>({
    gtmContainerId: 'idle',
    metaPixelId: 'idle',
    googleAdsConversionId: 'idle',
    googleAdsConversionLabel: 'idle',
    tiktokPixelId: 'idle',
  })
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [expandedHelp, setExpandedHelp] = useState<TrackingField | null>(null)

  // Detección client-side de duplicados (excluye label, que puede coincidir
  // por accidente y no es problema). Da feedback INSTANTÁNEO mientras
  // tipean — el server hace la misma comprobación al guardar.
  const duplicateField = useMemo<TrackingField | null>(() => {
    const seen = new Map<string, TrackingField>()
    for (const f of TRACKING_FIELDS) {
      if (f === 'googleAdsConversionLabel') continue
      const v = values[f].trim().toUpperCase()
      if (!v) continue
      if (seen.has(v)) return f
      seen.set(v, f)
    }
    return null
  }, [values])

  // ¿Qué scripts cargarán al publicar? Calculado para la "Vista previa".
  const willInject = useMemo(() => {
    const out: string[] = []
    if (values.gtmContainerId.trim()) out.push('Google Tag Manager (gtm.js)')
    if (values.metaPixelId.trim()) out.push('Meta Pixel (fbevents.js)')
    if (values.googleAdsConversionId.trim())
      out.push('Google Ads gtag.js')
    if (values.tiktokPixelId.trim()) out.push('TikTok Pixel (events.js)')
    return out
  }, [values])

  async function saveField(field: TrackingField) {
    const raw = values[field]
    const normalized = normalizeTrackingValue(field, raw)
    const localError = validateTrackingField(field, normalized)
    setErrors((prev) => ({ ...prev, [field]: localError ?? undefined }))
    setGlobalError(null)

    if (localError) {
      setState((s) => ({ ...s, [field]: 'error' }))
      return
    }
    // Si no cambió respecto al guardado, no hace falta request.
    if (normalized === (savedValues[field] ?? '')) {
      setState((s) => ({ ...s, [field]: 'idle' }))
      return
    }

    setState((s) => ({ ...s, [field]: 'saving' }))
    try {
      const res = await fetch('/api/clients/tracking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: normalized || null }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        field?: string
        conflict?: { a: string; b: string }
      }
      if (!res.ok) {
        if (data.conflict) {
          const msg = data.error ?? 'Conflicto de IDs duplicados.'
          setGlobalError(msg)
          toast.error(msg)
        } else {
          setErrors((prev) => ({
            ...prev,
            [field]: data.error ?? 'No se pudo guardar.',
          }))
          toast.error(data.error ?? 'No se pudo guardar')
        }
        setState((s) => ({ ...s, [field]: 'error' }))
        return
      }
      setSavedValues((sv) => ({ ...sv, [field]: normalized }))
      // Refresca el valor local con el normalizado (uppercase para campos
      // case-insensitive) — el usuario ve lo que se guardó realmente.
      setValues((v) => ({ ...v, [field]: normalized }))
      setState((s) => ({ ...s, [field]: 'saved' }))
      toast.success('Guardado')
      setTimeout(
        () =>
          setState((s) => ({
            ...s,
            [field]: s[field] === 'saved' ? 'idle' : s[field],
          })),
        FEEDBACK_MS.idleFlash,
      )
    } catch {
      setErrors((prev) => ({
        ...prev,
        [field]: 'Error de red. Inténtalo otra vez.',
      }))
      setState((s) => ({ ...s, [field]: 'error' }))
      toast.error('Error de red')
    }
  }

  function onChange(field: TrackingField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw }))
    // Limpia errores antiguos al editar.
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
    if (state[field] === 'error') {
      setState((s) => ({ ...s, [field]: 'idle' }))
    }
  }

  function sendTestEvent() {
    if (!publicSlug) return
    const url = `/${publicSlug}?tracking_test=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      {globalError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}
      {duplicateField && !globalError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-warning"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Has pegado el mismo ID en dos slots distintos ({TRACKING_LABELS[duplicateField]}).
            Revisa antes de guardar.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
        {TRACKING_FIELDS.map((field) => (
          <Field
            key={field}
            field={field}
            value={values[field]}
            error={errors[field]}
            state={state[field]}
            onChange={(v) => onChange(field, v)}
            onSave={() => saveField(field)}
            showHelp={expandedHelp === field}
            onToggleHelp={() =>
              setExpandedHelp((cur) => (cur === field ? null : field))
            }
          />
        ))}
      </div>

      {/* ----------------- Vista previa + Test ------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-overlay px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-ink-3" />
            <p className="text-sm font-semibold text-ink">Vista previa</p>
          </div>
          {willInject.length === 0 ? (
            <p className="text-xs text-ink-3">
              Sin tracking activo. Tu app pública carga solo lo esencial.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-2 mb-2">
                Esto se inyectará en tu PWA cuando un visitante acepte cookies:
              </p>
              <ul className="space-y-1 text-xs text-ink-2">
                {willInject.map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-success" />
                    <code className="font-mono">{s}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="rounded-xl border border-line bg-overlay px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <PlayCircle className="h-4 w-4 text-ink-3" />
            <p className="text-sm font-semibold text-ink">Probar tracking</p>
          </div>
          <p className="text-xs text-ink-2 mb-3">
            Abre tu app pública con un flag de test — disparará un evento{' '}
            <code className="font-mono text-brand">booking_confirmed</code> de
            prueba. Comprueba en Meta Events Manager, Google Ads → Diagnóstico
            de etiquetas, TikTok Events Manager que el evento llegó.
          </p>
          <button
            type="button"
            onClick={sendTestEvent}
            disabled={!publicSlug || willInject.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-canvas hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Enviar evento de prueba
          </button>
          {!publicSlug && (
            <p className="mt-2 text-[11px] text-ink-3">
              Configura tu slug público primero en Ajustes → Reservas online.
            </p>
          )}
        </div>
      </div>

      {/* ----------------- Notas legales ------------------------ */}
      <div className="rounded-xl border border-line bg-overlay px-4 py-3.5 text-xs leading-relaxed text-ink-2">
        <BarChart3 className="inline h-3.5 w-3.5 -mt-0.5 mr-1 text-ink-3" />
        Todos los pixels cargan con <strong>Consent Mode v2</strong>: si el
        visitante no acepta cookies de marketing, los pixels están instalados
        pero los eventos NO se procesan con datos personales (cumple AEPD/RGPD).
        Cuando un cliente confirma reserva o paga una propina, disparamos los
        eventos <code className="font-mono text-brand">booking_confirmed</code>{' '}
        y <code className="font-mono text-brand">tip_paid</code> en todos los
        destinos configurados a la vez.
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Field — input individual con label, validación, status indicator, help.
// -----------------------------------------------------------------------------

interface FieldProps {
  field: TrackingField
  value: string
  error: string | undefined
  state: SaveState
  onChange: (v: string) => void
  onSave: () => void
  showHelp: boolean
  onToggleHelp: () => void
}

function Field({
  field,
  value,
  error,
  state,
  onChange,
  onSave,
  showHelp,
  onToggleHelp,
}: FieldProps) {
  const help = HELP[field]
  const label = TRACKING_LABELS[field]
  const placeholder = TRACKING_PLACEHOLDERS[field]
  const isLabel = field === 'googleAdsConversionLabel'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label
          htmlFor={field}
          className="text-sm font-medium text-ink"
        >
          {label}
          {isLabel && (
            <span className="ml-1 text-[10px] uppercase tracking-widest font-bold text-ink-3">
              opcional
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={onToggleHelp}
          className="text-[11px] font-medium text-ink-3 hover:text-ink-2 transition-colors"
        >
          {showHelp ? 'Ocultar ayuda' : '¿Cómo lo encuentro?'}
        </button>
      </div>
      <div className="relative">
        <input
          id={field}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className={`w-full rounded-lg border bg-surface px-3 py-2 pr-9 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 transition-colors ${
            error ? 'border-danger focus:border-danger' : 'border-line focus:border-brand'
          }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          {state === 'saving' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />
          )}
          {state === 'saved' && <Check className="h-3.5 w-3.5 text-success" />}
          {error && <AlertCircle className="h-3.5 w-3.5 text-danger" />}
        </div>
      </div>

      {error && (
        <p className="mt-1 text-[11px] text-danger flex items-start gap-1">
          <span>{error}</span>
        </p>
      )}
      {!error && (
        <p className="mt-1 text-[11px] text-ink-3">
          {TRACKING_FORMAT_ERROR[field]}
        </p>
      )}

      {showHelp && (
        <div className="mt-2 rounded-lg border border-line bg-overlay px-3 py-2.5">
          <p className="text-xs font-semibold text-ink mb-1">{help.title}</p>
          <p className="text-xs text-ink-2 leading-relaxed mb-2">{help.body}</p>
          <a
            href={help.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-strong"
          >
            {help.hrefLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}
