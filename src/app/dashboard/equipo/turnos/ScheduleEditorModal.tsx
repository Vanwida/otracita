'use client'

import { useMemo, useState } from 'react'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
import {
  HOURS_DAYS,
  DAY_LABELS_LONG,
  HOURS_DAY_TO_WEEKDAY,
  type HoursDay,
  parseHoursValue,
  weekdayToHoursDay,
  HHMM_RE,
  toMinutes,
  formatRangeHours,
} from './weekdays'
import type { TurnosBarber } from './TurnosManager'

// -----------------------------------------------------------------------------
// ScheduleEditorModal — "Editar · Horario de trabajo · <barbero>"
// (screenshots 10.18.21 / 10.18.57).
//
// Por cada día de la semana:
//   · toggle on/off (off ⇒ "Cerrado" en `hours`)
//   · Inicio / Fin (HH:MM)
//   · "+ Añadir descanso" → filas indentadas con Inicio/Fin + papelera
//
// "Periodo de tiempo" del screenshot 10.18.57 (Inmediatamente / Semana que
// viene / A partir del día): **v1 solo Inmediatamente** — el brief lo limita
// explícitamente. Se deja el selector visible pero fijo para no mentir sobre
// scope futuro; los demás valores quedan deshabilitados.
//
// Guarda en DOS llamadas atómicas a APIs ya existentes:
//   1. PATCH /api/barbers/[id]  body { hours }   → ventana abierta por día
//   2. PUT   /api/barbers/[id]/breaks { breaks } → set completo de descansos
// El orden importa poco (son tablas distintas) pero hacemos hours primero;
// si breaks falla avisamos y NO cerramos para no perder ediciones.
// -----------------------------------------------------------------------------

interface DayState {
  open: boolean
  start: string
  end: string
  breaks: { start: string; end: string }[]
}

interface Props {
  barber: TurnosBarber
  shopHours: Record<string, string> | null
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_START = '11:00'
const DEFAULT_END = '20:00'
const DEFAULT_BREAK = { start: '13:00', end: '14:00' }

function buildInitial(
  barber: TurnosBarber,
  shopHours: Record<string, string> | null,
): Record<HoursDay, DayState> {
  // `hours` falls back to shop hours when the barber inherits — show the
  // effective schedule so the editor matches the timeline.
  const map = barber.hours ?? shopHours
  const out = {} as Record<HoursDay, DayState>
  for (const day of HOURS_DAYS) {
    const win = parseHoursValue(map?.[day])
    const dayBreaks = barber.breaks
      .filter((b) => weekdayToHoursDay(b.weekday) === day)
      .map((b) => ({ start: b.startTime, end: b.endTime }))
    out[day] = win
      ? { open: true, start: win.start, end: win.end, breaks: dayBreaks }
      : { open: false, start: DEFAULT_START, end: DEFAULT_END, breaks: dayBreaks }
  }
  return out
}

export default function ScheduleEditorModal({ barber, shopHours, onClose, onSaved }: Props) {
  const [days, setDays] = useState<Record<HoursDay, DayState>>(() =>
    buildInitial(barber, shopHours),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patchDay(day: HoursDay, next: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...next } }))
  }

  function addBreak(day: HoursDay) {
    setDays((prev) => ({
      ...prev,
      [day]: { ...prev[day], breaks: [...prev[day].breaks, { ...DEFAULT_BREAK }] },
    }))
  }

  function removeBreak(day: HoursDay, idx: number) {
    setDays((prev) => ({
      ...prev,
      [day]: { ...prev[day], breaks: prev[day].breaks.filter((_, i) => i !== idx) },
    }))
  }

  function patchBreak(day: HoursDay, idx: number, field: 'start' | 'end', value: string) {
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        breaks: prev[day].breaks.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
      },
    }))
  }

  // Client-side validation mirroring the API rules so errors surface before
  // a round-trip (the API still re-validates — never trust the client).
  const validationError = useMemo<string | null>(() => {
    for (const day of HOURS_DAYS) {
      const d = days[day]
      if (!d.open) continue
      if (!HHMM_RE.test(d.start) || !HHMM_RE.test(d.end)) {
        return `${DAY_LABELS_LONG[day]}: horas en formato HH:MM.`
      }
      if (toMinutes(d.start) >= toMinutes(d.end)) {
        return `${DAY_LABELS_LONG[day]}: el fin debe ser posterior al inicio.`
      }
      for (const br of d.breaks) {
        if (!HHMM_RE.test(br.start) || !HHMM_RE.test(br.end)) {
          return `${DAY_LABELS_LONG[day]}: descanso en formato HH:MM.`
        }
        if (toMinutes(br.start) >= toMinutes(br.end)) {
          return `${DAY_LABELS_LONG[day]}: el descanso debe terminar después de empezar.`
        }
      }
    }
    return null
  }, [days])

  async function save() {
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      // 1. hours map — Spanish keys, "Cerrado" for off days (matches HoursEditor).
      const hoursMap: Record<string, string> = {}
      for (const day of HOURS_DAYS) {
        const d = days[day]
        hoursMap[day] = d.open ? `${d.start}-${d.end}` : 'Cerrado'
      }
      const hoursRes = await fetch(`/api/barbers/${barber.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hoursMap }),
      })
      if (!hoursRes.ok) {
        const d = await hoursRes.json().catch(() => ({}))
        setError(d?.error || 'No se pudo guardar el horario.')
        return
      }

      // 2. breaks — flatten to the API shape (weekday integer per day).
      const breaks: { weekday: number; startTime: string; endTime: string }[] = []
      for (const day of HOURS_DAYS) {
        const d = days[day]
        if (!d.open) continue // breaks on a closed day are meaningless
        for (const br of d.breaks) {
          breaks.push({
            weekday: HOURS_DAY_TO_WEEKDAY[day],
            startTime: br.start,
            endTime: br.end,
          })
        }
      }
      const breaksRes = await fetch(`/api/barbers/${barber.id}/breaks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ breaks }),
      })
      if (!breaksRes.ok) {
        const d = await breaksRes.json().catch(() => ({}))
        setError(d?.error || 'Horario guardado, pero fallaron los descansos.')
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
        className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-2xl my-8 max-h-[calc(100vh-4rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold text-ink">Editar horario de trabajo</h2>
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

        {/* Day rows */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {HOURS_DAYS.map((day) => {
            const d = days[day]
            const win = d.open && HHMM_RE.test(d.start) && HHMM_RE.test(d.end)
              ? formatRangeHours({ start: d.start, end: d.end })
              : null
            return (
              <div key={day} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.open}
                      onChange={(e) => patchDay(day, { open: e.target.checked })}
                      className="h-4 w-4 accent-[var(--color-brand)]"
                    />
                    <span className="text-sm font-medium text-ink">
                      {DAY_LABELS_LONG[day]}
                    </span>
                  </label>

                  {d.open ? (
                    <>
                      <input
                        type="time"
                        value={d.start}
                        onChange={(e) => patchDay(day, { start: e.target.value })}
                        className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
                      />
                      <span className="text-ink-3 text-sm">-</span>
                      <input
                        type="time"
                        value={d.end}
                        onChange={(e) => patchDay(day, { end: e.target.value })}
                        className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
                      />
                      {win && (
                        <span className="text-xs text-ink-3 tabular-nums">{win}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => addBreak(day)}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-strong transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Añadir descanso
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-ink-3">Cerrado</span>
                  )}
                </div>

                {/* Descanso rows (indented) */}
                {d.open && d.breaks.length > 0 && (
                  <div className="mt-2 space-y-2 pl-7 border-l border-line ml-1">
                    {d.breaks.map((br, idx) => (
                      <div key={idx} className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-medium text-ink-2 w-20 shrink-0">
                          Descanso
                        </span>
                        <input
                          type="time"
                          value={br.start}
                          onChange={(e) => patchBreak(day, idx, 'start', e.target.value)}
                          className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
                        />
                        <span className="text-ink-3 text-sm">-</span>
                        <input
                          type="time"
                          value={br.end}
                          onChange={(e) => patchBreak(day, idx, 'end', e.target.value)}
                          className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => removeBreak(day, idx)}
                          aria-label="Eliminar descanso"
                          className="p-1.5 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Periodo de tiempo — v1: solo "Inmediatamente" (brief). */}
          <div className="flex items-center gap-3 pt-1">
            <label className="text-xs font-medium text-ink-2">Periodo de tiempo</label>
            <select
              value="inmediatamente"
              disabled
              className="bg-overlay border border-line rounded-lg px-2 py-1.5 text-sm text-ink-2 outline-none cursor-not-allowed"
            >
              <option value="inmediatamente">Inmediatamente</option>
            </select>
            <span className="text-[11px] text-ink-3">Programar a futuro: próximamente.</span>
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        {/* Sticky dark primary GUARDAR (UI0 #6) */}
        <div className="sticky bottom-0 bg-surface border-t border-line px-5 py-4 flex items-center justify-end gap-2 rounded-b-2xl">
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
