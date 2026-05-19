'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../../_components/Modal'
import type { TurnosBarber } from './TurnosManager'

// -----------------------------------------------------------------------------
// AbsenceModal — "Añadir ausencia · <barbero>" (screenshot 10.22.23).
//
// Estructura espejo de Booksy:
//   · "Todo el día" (toggle) + recuento de días.
//   · "Seleccionar fecha": Fecha (sin "Repetir" — ver TODO abajo).
//   · Franja horaria SI "Todo el día" está desmarcado (la API y el motor de
//     disponibilidad ya soportan ausencias parciales vía startTime/endTime).
//   · "Seleccionar motivo": catálogo cerrado (personal/enfermedad/
//     vacaciones/formacion — los 4 que valida la API).
//   · "Aprobado" (toggle).
//
// Escribe vía POST /api/barbers/[id]/blocks con kind:'absence'. "Todo el día"
// ⇒ startTime/endTime omitidos (la API los trata como null = día completo);
// franja ⇒ se envían HH:MM.
//
// "Repetir": `barber_blocks` NO tiene columna de recurrencia (FLAG a
// team-lead). El control se muestra para paridad visual pero deshabilitado
// con motivo explícito — no mentimos sobre scope; cuando haya schema se
// activa sin tocar el layout.
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

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export default function AbsenceModal({ barber, defaultDate, onClose, onSaved }: Props) {
  const [allDay, setAllDay] = useState(true)
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('14:00')
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
    if (!allDay) {
      if (!HHMM_RE.test(startTime) || !HHMM_RE.test(endTime)) {
        setError('Las horas deben tener formato HH:MM.')
        return
      }
      if (startTime >= endTime) {
        setError('La hora de fin debe ser posterior a la de inicio.')
        return
      }
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
          ...(allDay ? {} : { startTime, endTime }),
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
    <Modal
      open
      onClose={onClose}
      title="Añadir ausencia"
      subtitle={barber.name}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
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
      }
    >
      <div className="px-5 py-4 space-y-5">
          {/* Todo el día */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              <span className="text-sm font-medium text-ink">Todo el día</span>
            </label>
            <span className="text-xs text-ink-3">{allDay ? '1 día completo' : 'Franja parcial'}</span>
          </div>

          {/* Seleccionar fecha */}
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">
              Seleccionar fecha
            </span>
            {/* TODO(turnos): "Repetir" de Booksy (10.22.23) omitido a
                propósito — `barber_blocks` no tiene columna de recurrencia.
                Un control que no funciona engaña al ex-Booksy que espera
                que funcione, así que no se pinta hasta tener el schema. */}
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Fecha de la ausencia"
                className="flex-1 bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand transition-colors"
              />
            </div>
            {!allDay && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  aria-label="Hora de inicio"
                  className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
                />
                <span className="text-ink-3 text-sm">-</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  aria-label="Hora de fin"
                  className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
                />
              </div>
            )}
          </div>

          {/* Seleccionar motivo */}
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">
              Seleccionar motivo
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Motivo de la ausencia"
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">
              Nota <span className="font-normal normal-case text-ink-3">(opcional)</span>
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
    </Modal>
  )
}
