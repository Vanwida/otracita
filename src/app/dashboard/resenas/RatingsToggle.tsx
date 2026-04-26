'use client'

import { useState, useTransition } from 'react'
import { Star, Check } from 'lucide-react'

// -----------------------------------------------------------------------------
// Toggle on/off para la solicitud automática de reseñas tras cada servicio.
// Independiente de propinas: el barbero puede pedir reseñas sin Stripe
// Connect ni propinas online configuradas.
// -----------------------------------------------------------------------------

interface Props {
  initialEnabled: boolean
}

export default function RatingsToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = () => {
    const next = !enabled
    setError(null)
    startTransition(async () => {
      try {
        const r = await fetch('/api/ratings/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ratingsEnabled: next }),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo guardar')
          return
        }
        setEnabled(next)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch {
        setError('Error de red')
      }
    })
  }

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
                Cuando se active, ~30 min tras el fin de cada cita el cliente
                recibirá una notificación en su app (o WhatsApp si no la tiene)
                para valorarte de 1 a 5 estrellas.
              </p>
            </div>
            <button
              type="button"
              onClick={toggle}
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
          {enabled ? (
            <ul className="mt-3 space-y-1 text-xs text-ink-2">
              <li>• Se omiten clientes con tu propio número (anti-fraude).</li>
              <li>• Cada reserva se valora una sola vez (no spam).</li>
              <li>• Si tienes propinas online activas, el cliente puede dejar tip al valorar 4-5★.</li>
            </ul>
          ) : (
            <p className="text-xs text-ink-3 mt-3">
              Activa para empezar a recopilar opiniones de tus clientes.
            </p>
          )}
          {saved && (
            <span className="mt-3 inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              Guardado
            </span>
          )}
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </section>
  )
}
