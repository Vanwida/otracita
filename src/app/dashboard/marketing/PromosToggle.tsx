'use client'

import { useState, useTransition } from 'react'
import { Megaphone } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  initialEnabled: boolean
}

// -----------------------------------------------------------------------------
// Toggle de "Promos contextuales" en /dashboard/app. Cuando se activa, aparece
// el botón "Llenar huecos" en la cabecera de /dashboard/agenda. Al desactivar
// el botón desaparece pero los promo_pushes históricos se conservan.
// -----------------------------------------------------------------------------
export default function PromosToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()

  const toggle = () => {
    const next = !enabled
    startTransition(async () => {
      try {
        const r = await fetch('/api/promos/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promosEnabled: next }),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          toast.error(d?.error ?? 'No se pudo guardar')
          return
        }
        setEnabled(next)
        toast.success('Guardado')
      } catch {
        toast.error('Error de red')
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
          <Megaphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Promos contextuales</h2>
              <p className="text-sm text-ink-2 mt-1 max-w-2xl">
                Cuando tengas huecos, manda una promo a tus clientes habituales con un
                descuento. Aparece un botón <strong>&ldquo;Llenar huecos&rdquo;</strong> en la agenda.
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
          {enabled && (
            <ul className="mt-3 space-y-1 text-xs text-ink-2">
              <li>• Solo se notifica a clientes con ≥3 visitas en últimos 90 días.</li>
              <li>• Máx 1 promo / cliente / 7 días, no se satura a nadie.</li>
              <li>• Push si tienen la app instalada, WhatsApp si no.</li>
              <li>• Tú aplicas el descuento manualmente al cobrar.</li>
            </ul>
          )}
          {!enabled && (
            <p className="text-xs text-ink-3 mt-3">
              Al activarlo declaras que tus clientes consienten recibir comunicaciones promocionales.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
