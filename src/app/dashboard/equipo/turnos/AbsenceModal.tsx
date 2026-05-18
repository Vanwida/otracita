'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { TurnosBarber } from './TurnosManager'

// -----------------------------------------------------------------------------
// AbsenceModal — "Añadir ausencia · <barbero>" (screenshot 10.22.23).
//
// Ausencia = bloqueo con MOTIVO. v1: "Todo el día" / un día concreto, motivo
// de un catálogo cerrado (los 4 que valida la API: personal/enfermedad/
// vacaciones/formacion) y toggle "Aprobado". "Repetir" del screenshot queda
// fuera de v1 (no hay backend de recurrencia para blocks) — no se pinta para
// no prometer scope inexistente.
//
// Escribe vía POST /api/barbers/[id]/blocks con kind:'absence'. Día completo
// ⇒ startTime/endTime omitidos (la API los interpreta como null = todo el
// día). El motor de disponibilidad ya resta estos bloqueos.
// -----------------------------------------------------------------------------

interface Props {
  barber: TurnosBarber
  defaultDate: string
  onClose: () => void
  onSaved: () => void
}

const REASONS = [
  { value: 'personal', label: 'Día personal' },
  { value: 'enfermedad', label: 'Enfermedad' },
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'formacion', label: 'Formación' },
] as const

export default function AbsenceModal({ barber, defaultDate, onClose, onSaved }: Props) {
  const [date, setDate] = useState(defaultDate)
  const [reason, setReason] = useState<string>('personal')
  const [note, setNote] = useState('')
  const [approved, setApproved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecciona una fecha válida.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/barbers/${barber.id}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          kind: 'absence',
          reason,
          note: note.trim() || undefined,
          approved,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error || 'No se pudo guardar la ausencia.')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-[var(--color-scrim-strong)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-md my-8 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Añadir ausencia</h2>
            <p className="text-xs text-ink-3 mt-0.5">{barber.name} · todo el día</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-overlay text-ink-3 hover:text-ink transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1.5">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1.5">Motivo</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1.5">
              Nota <span className="font-normal text-ink-3">(opcional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Detalle interno…"
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors resize-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            <span className="text-sm text-ink">Aprobada</span>
          </label>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-line px-5 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-ink-2 hover:text-ink hover:bg-overlay transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-[var(--color-cream-high)] bg-[var(--color-espresso)] hover:bg-[var(--color-espresso-2)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
