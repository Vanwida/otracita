'use client'

import { useState, useTransition } from 'react'
import { Star, Check, Loader2 } from 'lucide-react'
import NumberInput from '../_components/NumberInput'

// -----------------------------------------------------------------------------
// Card de configuración del flow post-servicio:
//
//   1. Toggle on/off (ratingsEnabled). Auto-save al hacer click.
//   2. Delay en minutos tras el fin de la cita (followupMinutesAfter,
//      15..240, default 30). Save explícito al cambiar.
//
// La delay vive aquí — NO en el card de propinas — porque controla el
// momento en que se manda el mensaje POST-SERVICIO completo. La propina
// es un step opcional dentro de ese flujo; el timing es del rating.
// Antes había contradicción: copy "30 min" hardcoded aquí + input
// editable en TipsSettings que cambiaba el mismo `followup_minutes_after`.
// -----------------------------------------------------------------------------

interface Props {
  initialEnabled: boolean
  initialDelayMinutes: number
}

export default function RatingsToggle({ initialEnabled, initialDelayMinutes }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [delay, setDelay] = useState(String(initialDelayMinutes))
  const [savedDelay, setSavedDelay] = useState(initialDelayMinutes)
  const [savedTag, setSavedTag] = useState<'toggle' | 'delay' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const persist = (
    payload: { ratingsEnabled: boolean; followupMinutesAfter?: number },
    tag: 'toggle' | 'delay',
  ) => {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fetch('/api/ratings/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo guardar')
          return
        }
        if (typeof payload.followupMinutesAfter === 'number') {
          setSavedDelay(payload.followupMinutesAfter)
        }
        setSavedTag(tag)
        setTimeout(() => setSavedTag(null), 2000)
      } catch {
        setError('Error de red')
      }
    })
  }

  const onToggle = () => {
    const next = !enabled
    setEnabled(next)
    persist({ ratingsEnabled: next }, 'toggle')
  }

  const onSaveDelay = () => {
    const minutes = Number.parseInt(delay, 10)
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 240) {
      setError('Usa un valor entre 15 y 240 minutos.')
      return
    }
    persist({ ratingsEnabled: enabled, followupMinutesAfter: minutes }, 'delay')
  }

  const delayChanged = delay.trim() !== String(savedDelay)

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            enabled ? 'bg-brand-softer text-brand-strong' : 'bg-overlay text-ink-3'
          }`}
        >
          <Star className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Solicitud automática</h2>
              <p className="text-sm text-ink-2 mt-1 max-w-xl">
                Tras cada cita, el cliente recibirá una notificación en su app
                (o WhatsApp si no la tiene) para valorarte de 1 a 5 estrellas.
                Tú eliges cuántos minutos después se envía.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              role="switch"
              aria-checked={enabled}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                enabled ? 'bg-brand' : 'bg-line'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {enabled && (
            <>
              <div className="mt-4 pt-4 border-t border-line">
                <label className="text-xs font-semibold uppercase tracking-widest text-ink-2 block mb-2">
                  Cuándo enviar tras el fin del servicio
                </label>
                <div className="flex items-center gap-2 max-w-md flex-wrap">
                  {/* min/max NO se pasan a NumberInput a propósito: la
                      validación 15–240 vive en onSaveDelay (muestra error
                      explícito). Clamp en blur ocultaría ese mensaje y
                      cambiaría el comportamiento observable. */}
                  <NumberInput
                    value={delay === '' ? null : Number(delay)}
                    onValueChange={(n) => setDelay(n === null ? '' : String(n))}
                    decimals={0}
                    step={5}
                    aria-label="Minutos tras el fin del servicio"
                    className="bg-surface border border-line rounded-lg px-3 py-2 text-sm w-24 focus:border-brand outline-none"
                  />
                  <span className="text-sm text-ink-2">minutos</span>
                  <button
                    type="button"
                    onClick={onSaveDelay}
                    disabled={pending || !delayChanged}
                    className="btn-primary btn-sm ml-auto"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                  </button>
                </div>
                <p className="text-[11px] text-ink-3 mt-1.5">
                  Recomendado: 30 min. Margen para que el cliente salga de la barbería antes del aviso. Rango 15–240.
                </p>
              </div>

              <ul className="mt-3 space-y-1 text-xs text-ink-2">
                <li>• Se omiten clientes con tu propio número (anti-fraude).</li>
                <li>• Cada reserva se valora una sola vez (no spam).</li>
                <li>• Si tienes propinas online activas, el cliente puede dejar tip al valorar 4-5★ (configura abajo).</li>
              </ul>
            </>
          )}

          {!enabled && (
            <p className="text-xs text-ink-3 mt-3">
              Activa para empezar a recopilar opiniones de tus clientes.
            </p>
          )}

          {savedTag && (
            <span className="mt-3 inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              {savedTag === 'toggle' ? 'Estado guardado' : 'Tiempo guardado'}
            </span>
          )}
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </section>
  )
}
