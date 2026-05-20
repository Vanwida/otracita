'use client'

import { useState } from 'react'
import { Tag, Check, Loader2, X, ExternalLink } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// GtmSettings — input para configurar el Google Tag Manager container ID
// del barbero. Auto-save al perder foco / pulsar Enter (mismo patrón que
// TipsSettings / LoyaltySettings — coherente con el resto del dashboard).
//
// Validación local: regex GTM-XXXXXX (entre 6 y 12 alfanuméricos). Si pasa,
// PATCH a /api/clients/gtm. Si no, mensaje inline sin enviar.
//
// Borrar: input vacío + guardar elimina el container ID. El barbero puede
// pausar el tracking en cualquier momento sin desinstalar la integración.
// -----------------------------------------------------------------------------

const GTM_REGEX = /^GTM-[A-Z0-9]{6,12}$/i

interface Props {
  initial: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function GtmSettings({ initial }: Props) {
  const [value, setValue] = useState(initial ?? '')
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim().toUpperCase()
    setError(null)

    if (trimmed && !GTM_REGEX.test(trimmed)) {
      setError('Formato no válido. Debe empezar por GTM- seguido de 6-12 caracteres (ej. GTM-ABC1234).')
      return
    }

    setState('saving')
    try {
      const res = await fetch('/api/clients/gtm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtmContainerId: trimmed || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo guardar.')
        setState('error')
        return
      }
      setValue(trimmed)
      setState('saved')
      setTimeout(() => setState('idle'), FEEDBACK_MS.idleFlash)
    } catch {
      setError('Error de red. Inténtalo otra vez.')
      setState('error')
    }
  }

  function clear() {
    setValue('')
    setState('idle')
    setError(null)
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-medium text-ink mb-1.5">
          ID del contenedor (GTM-XXXXXXX)
        </span>
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder="GTM-ABC1234"
            spellCheck={false}
            className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 pr-10 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {value && (
            <button
              type="button"
              onClick={clear}
              aria-label="Quitar"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2 text-xs text-ink-3 h-4" aria-live="polite">
        {state === 'saving' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando…
          </>
        )}
        {state === 'saved' && (
          <>
            <Check className="h-3.5 w-3.5 text-success" />
            <span className="text-success">Guardado</span>
          </>
        )}
      </div>

      <div className="bg-overlay border border-line rounded-lg p-3 mt-2">
        <p className="text-xs text-ink-2 leading-relaxed">
          <Tag className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-ink-3" />
          Pega tu container ID y se inyecta automáticamente en tu app pública.
          Cuando un cliente confirma una reserva, lanzamos un evento{' '}
          <code className="text-brand">booking_confirmed</code> con el valor del servicio.
          Tú decides desde GTM qué tags lo escuchan (Meta Pixel, Google Ads, GA4, TikTok…).
        </p>
        <a
          href="https://tagmanager.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-strong mt-2"
        >
          Abrir Google Tag Manager
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
