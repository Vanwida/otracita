'use client'

import { useState, useTransition } from 'react'
import { Heart, Check, AlertCircle, Loader2 } from 'lucide-react'

export interface TipsInitial {
  tipsEnabled: boolean
  tipsSuggestedCents: number[]
  /** Whether the tenant has a Connect account ready to receive tips. Disables
   *  the toggle otherwise, so the barber can't activate something that would
   *  silently fail. */
  connectActive: boolean
}

interface Props {
  initial: TipsInitial
}

// -----------------------------------------------------------------------------
// TipsSettings — panel de propinas online en /dashboard/resenas. Maneja:
//   · toggle `tipsEnabled`
//   · 3 importes sugeridos (en euros, persistidos como cents)
//
// El TIMING (followupMinutesAfter) NO vive aquí — lo controla RatingsToggle
// porque es timing del flow post-servicio completo (rating + tip), no
// específico de tip. Ver feedback_map_full_field_surface en memoria.
// -----------------------------------------------------------------------------
export default function TipsSettings({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.tipsEnabled)
  const [amounts, setAmounts] = useState<string[]>(
    (initial.tipsSuggestedCents || [200, 300, 500]).slice(0, 3).map((c) => (c / 100).toFixed(2)),
  )
  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFiscalNote, setShowFiscalNote] = useState(false)

  const onToggle = (next: boolean) => {
    if (next && !initial.connectActive) {
      setError('Para activar propinas primero activa "Cobros online" arriba.')
      return
    }
    setError(null)
    if (next && !initial.tipsEnabled) setShowFiscalNote(true)
    setEnabled(next)
  }

  const onSave = () => {
    setError(null)
    setSaved(false)

    // Parse amounts. Accept empty rows — sanitizer server-side fills defaults.
    const cents = amounts
      .map((s) => s.replace(',', '.').trim())
      .filter((s) => s.length > 0)
      .map((s) => Math.round(Number.parseFloat(s) * 100))
      .filter((n) => Number.isInteger(n) && n >= 100 && n <= 10_000)
      .slice(0, 3)

    if (enabled && cents.length === 0) {
      setError('Añade al menos un importe válido (mínimo 1 €).')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/tips/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipsEnabled: enabled,
            tipsSuggestedCents: cents.length > 0 ? cents : [200, 300, 500],
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error || 'No se pudo guardar')
          return
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch {
        setError('Error de red')
      }
    })
  }

  const updateAmount = (i: number, v: string) => {
    setAmounts((prev) => prev.map((x, idx) => (idx === i ? v : x)))
  }

  return (
    <div className="space-y-5 border-t border-line pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Heart className="h-4 w-4 text-brand" />
            Propinas y rating
          </h2>
          <p className="text-sm text-ink-2 mt-1">
            30 min después de cada corte, el bot pregunta al cliente qué tal ha ido y, si
            quiere, le ofrece dejar propina por tarjeta. Tú recibes ambas cosas: la valoración
            (anónima para el cliente) y la propina al 100 % — sin comisión de otracita.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4"
            disabled={!initial.connectActive && !enabled}
          />
          <span className="text-sm text-ink">{enabled ? 'Activo' : 'Inactivo'}</span>
        </label>
      </div>

      {!initial.connectActive && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-ink-2 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <span>
            Para recibir propinas por tarjeta, primero activa "Cobros online" arriba. Es el
            mismo Stripe — una sola verificación cubre ambas cosas.
          </span>
        </div>
      )}

      {showFiscalNote && enabled && (
        <div className="rounded-lg border border-line bg-overlay px-3 py-2 text-xs text-ink-2 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-ink-2 mt-0.5 shrink-0" />
          <span>
            Las propinas son renta del negocio. Aparecerán en tu banco y tributan como IRPF.
            No emitimos factura por ellas (son liberalidad del cliente). En el export mensual
            para tu gestor aparecen en una sección separada.
          </span>
        </div>
      )}

      <div className={enabled ? '' : 'opacity-60 pointer-events-none'}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-2">Importe sugerido {i + 1} (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={amounts[i] ?? ''}
                onChange={(e) => updateAmount(i, e.target.value)}
                placeholder={i === 0 ? '2' : i === 1 ? '3' : '5'}
                className="bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Guardado
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar propinas
        </button>
      </div>
    </div>
  )
}
