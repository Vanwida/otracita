'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { HHMM_RE, toMinutes } from './weekdays'
import type { TurnosBarber } from './TurnosManager'

// -----------------------------------------------------------------------------
// BlockModal — "Añadir falta de disponibilidad" (screenshot 09.39.52).
//
// Falta de disponibilidad = bloqueo AD-HOC de una franja concreta de un día
// (ej. 16:00–16:15), SIN motivo de catálogo — campo Nota libre. A diferencia
// de la ausencia (día completo + motivo), aquí siempre hay rango horario.
//
// Escribe vía POST /api/barbers/[id]/blocks con kind:'block'. El motor de
// disponibilidad y bookings/create ya restan / rechazan esta franja.
// -----------------------------------------------------------------------------

interface Props {
  barber: TurnosBarber
  defaultDate: string
  onClose: () => void
  onSaved: () => void
}

export default function BlockModal({ barber, defaultDate, onClose, onSaved }: Props) {
  const [date, setDate] = useState(defaultDate)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('16:15')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecciona una fecha válida.')
      return
    }
    if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) {
      setError('Horas en formato HH:MM.')
      return
    }
    if (toMinutes(start) >= toMinutes(end)) {
      setError('El fin debe ser posterior al inicio.')
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
          startTime: start,
          endTime: end,
          kind: 'block',
          note: note.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error || 'No se pudo guardar.')
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
            <h2 className="text-lg font-semibold text-ink">Añadir falta de disponibilidad</h2>
            <p className="text-xs text-ink-3 mt-0.5">{barber.name}</p>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1.5">Inicio</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1.5">Fin</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1.5">
              Nota <span className="font-normal text-ink-3">(opcional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Motivo interno…"
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors resize-none"
            />
          </div>

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
