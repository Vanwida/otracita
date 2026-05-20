'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Loader2, Check } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// CashRegisterToggle — switch opt-in del control de caja efectivo.
//
// Vive en /dashboard/caja al final, junto a Cobros online (Connect) y
// Facturación. Cuando el barbero activa el toggle:
//   · Aparece la sección "Caja del día" en la cabecera de /dashboard/caja
//   · Al "Marcar completada" cita se le pide método de pago
//   · Al vender producto se alimenta el cuadre del día
//
// Desactivar requiere cerrar primero la caja abierta (lo enforce el
// endpoint con un 409 amistoso).
// -----------------------------------------------------------------------------

interface Props {
  initialEnabled: boolean
}

export default function CashRegisterToggle({ initialEnabled }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  async function toggle(next: boolean) {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/cash/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'No se pudo actualizar')
        return
      }
      setEnabled(next)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), FEEDBACK_MS.copied)
      startTransition(() => router.refresh())
    } catch {
      setError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-softer/40 border border-line flex items-center justify-center shrink-0">
          <Banknote className="h-5 w-5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
                Control de caja
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {enabled
                  ? 'Activo. Abre y cierra caja con cuadre de efectivo y datáfono.'
                  : 'Apertura/cierre del día con efectivo y datáfono.'}
              </p>
            </div>
            <Switch enabled={enabled} onChange={toggle} disabled={saving} />
          </div>

          {!enabled && (
            <ul className="mt-3 text-xs text-ink-2 space-y-1 leading-relaxed">
              <li>· Apertura del día con saldo inicial de cambio.</li>
              <li>· Cada venta y propina se registra en su método (efectivo, tarjeta, online).</li>
              <li>· Al cerrar, comparas el cajón y el datáfono con lo esperado por el sistema.</li>
              <li>· Pensado para locales con efectivo o TPV físico que necesitan conciliar al final del día.</li>
            </ul>
          )}

          {enabled && (
            <p className="mt-3 text-xs text-ink-3 leading-relaxed">
              Para verla, sube al inicio de esta página. Para desactivarla, cierra primero la caja del día si está abierta.
            </p>
          )}

          {savedFlash && (
            <p className="mt-2 text-xs text-success inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              Guardado
            </p>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </section>
  )
}

function Switch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait ${
        enabled ? 'bg-brand' : 'bg-overlay border border-line'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-surface shadow transform transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
      {disabled && (
        <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-ink-3" />
      )}
    </button>
  )
}
