'use client'

import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '../../_components/Modal'
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
// viene / A partir del día): se muestran las 3 opciones para paridad visual
// con Booksy, pero `barbers.hours` es un único mapa actual sin fecha-efectiva
// (FLAG a team-lead). Solo "Inmediatamente" persiste; las otras dos quedan
// deshabilitadas con motivo explícito — no mentimos sobre scope y, en cuanto
// haya schema de programación, se activan sin tocar el layout.
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

function buildInitial(barber: TurnosBarber): Record<HoursDay, DayState> {
  // Mostramos el horario PROPIO del barbero (cero fallback a shop hours,
  // commit 405a15d). Si hereda, todos los días aparecen cerrados — el
  // banner explica la situación y el dirty-tracking en save() impide que
  // pulsar Guardar sin tocar nada rompa la herencia con un mapa explícito.
  const map = barber.hours ?? {}
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

/** Snapshot del estado actual en la misma shape que persiste `barber.hours`. */
function computeHoursMap(state: Record<HoursDay, DayState>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const day of HOURS_DAYS) {
    const d = state[day]
    out[day] = d.open ? `${d.start}-${d.end}` : 'Cerrado'
  }
  return out
}

// `shopHours` se mantiene en Props (lo pasa TurnosManager) pero ya no se
// usa: el editor muestra el horario PROPIO del barbero (commit 405a15d).
// Lo dejamos en la interfaz por si una iteración futura quiere mostrarlo
// como referencia en el banner de "hereda el horario del local".
export default function ScheduleEditorModal({ barber, onClose, onSaved }: Props) {
  const inherited = barber.hours == null
  const [days, setDays] = useState<Record<HoursDay, DayState>>(() =>
    buildInitial(barber),
  )
  // Baseline para detectar cambios reales del horario. Si el usuario abre
  // el modal y guarda sin tocar nada, `save()` NO escribe `hours` y el
  // barbero conserva su `null` (sigue heredando). Antes guardábamos siempre
  // el mapa de 7 días → un click en Guardar bake-in-eaba la herencia.
  const initialHoursRef = useRef<Record<string, string>>(computeHoursMap(days))
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
  // Convención: los descansos con campos VACÍOS (usuario añadió uno y no
  // rellenó) NO son error — los filtramos en el submit. Solo es error
  // cuando hay valor pero está mal formado o end<=start. Feedback Reni
  // 2026-05-20: "Fallaron los descansos" venía típicamente de un break
  // recién añadido con DEFAULT_BREAK editado a campo vacío.
  const validationError = useMemo<string | null>(() => {
    for (const day of HOURS_DAYS) {
      const d = days[day]
      if (!d.open) continue
      if (!HHMM_RE.test(d.start) || !HHMM_RE.test(d.end)) {
        return `${DAY_LABELS_LONG[day]}: pon horas válidas (formato HH:MM).`
      }
      if (toMinutes(d.start) >= toMinutes(d.end)) {
        return `${DAY_LABELS_LONG[day]}: la hora de cierre tiene que ser después de la de apertura.`
      }
      for (const br of d.breaks) {
        // Break "vacío" (al menos un campo sin rellenar) → no es error,
        // se omite en el submit. Solo validamos breaks con AMBOS campos
        // puestos pero mal formados.
        if (!br.start && !br.end) continue
        if (!br.start || !br.end) {
          return `${DAY_LABELS_LONG[day]}: rellena la hora de inicio y fin del descanso (o elimínalo).`
        }
        if (!HHMM_RE.test(br.start) || !HHMM_RE.test(br.end)) {
          return `${DAY_LABELS_LONG[day]}: el descanso tiene horas en formato raro (${br.start || '?'} – ${br.end || '?'}).`
        }
        if (toMinutes(br.start) >= toMinutes(br.end)) {
          return `${DAY_LABELS_LONG[day]}: el descanso ${br.start}–${br.end} no es válido (fin debe ser posterior al inicio).`
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
      // 1. hours map — sólo PATCH si cambió respecto al baseline. Esto
      //    preserva la herencia (`barber.hours = null`) cuando el usuario
      //    abre el modal para mirar y le da a Guardar sin tocar nada. Si
      //    hubo cambios, persistimos el mapa COMPLETO de 7 días (Spanish
      //    keys, "Cerrado" para los off) — el barbero pasa a tener horario
      //    propio explícito.
      const currentMap = computeHoursMap(days)
      const hoursChanged = HOURS_DAYS.some(
        (day) => currentMap[day] !== initialHoursRef.current[day],
      )
      if (hoursChanged) {
        const hoursRes = await fetch(`/api/barbers/${barber.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours: currentMap }),
        })
        if (!hoursRes.ok) {
          const d = await hoursRes.json().catch(() => ({}))
          const msg = d?.error || 'No se pudo guardar el horario.'
          setError(msg)
          toast.error(msg)
          return
        }
        initialHoursRef.current = currentMap
      }

      // 2. breaks — flatten to the API shape (weekday integer per day).
      // Filtra silenciosamente breaks vacíos (campos sin rellenar) — la
      // validación cliente ya rechazó los a-medio-rellenar; los TOTALMENTE
      // vacíos son inputs huérfanos que el usuario añadió y no rellenó:
      // no son error, simplemente no existen. Antes el editor los enviaba
      // como `startTime: ""` y la API respondía 400 → mensaje genérico
      // "Fallaron los descansos" (feedback Reni 2026-05-20).
      const breaks: { weekday: number; startTime: string; endTime: string }[] = []
      for (const day of HOURS_DAYS) {
        const d = days[day]
        if (!d.open) continue // breaks on a closed day are meaningless
        for (const br of d.breaks) {
          if (!br.start && !br.end) continue // silently skip fully-empty orphan breaks
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
        // El error de la API ahora se muestra tal cual (ya son copy de
        // barbero — ver /api/barbers/[id]/breaks). El fallback solo aplica
        // a fallos de red / 500.
        const msg = d?.error || 'Se guardó el horario pero los descansos no. Inténtalo otra vez.'
        setError(msg)
        toast.error(msg)
        return
      }

      toast.success('Horario guardado')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  /** Quita el horario propio del barbero y vuelve a heredar el del local. */
  async function resetToInherit() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/barbers/${barber.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        const msg = d?.error || 'No se pudo volver al horario del local.'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Vuelto al horario del local')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar horario de trabajo"
      subtitle={barber.name}
      size="xl"
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
        {/* Day rows */}
        <div className="px-5 py-4 space-y-3">
          {/* Estado de herencia — el modal muestra el horario PROPIO del
              barbero (no el efectivo). Sin este banner, un editor vacío en
              un barbero que hereda parecería un bug. */}
          {inherited ? (
            <div className="rounded-lg border border-line bg-overlay/50 px-3 py-2 text-xs text-ink-2">
              Este barbero <span className="font-medium text-ink">hereda el horario del local</span>.
              Configura los días aquí solo si quieres darle un horario propio
              (sin afectar al resto del equipo).
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-overlay/50 px-3 py-2 text-xs text-ink-2">
              <span>Este barbero tiene un horario propio (no hereda el del local).</span>
              <button
                type="button"
                onClick={resetToInherit}
                disabled={saving}
                className="font-medium text-brand hover:text-brand-strong disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Volver al horario del local
              </button>
            </div>
          )}

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

          {/* Periodo de tiempo (Booksy 10.18.57). `barbers.hours` es un
              único mapa actual, sin fecha-efectiva — las opciones futuras
              necesitan schema (FLAG a team-lead). Mostramos las 3 opciones
              para paridad visual con Booksy; solo "Inmediatamente" persiste,
              las demás deshabilitadas con motivo claro (no mentimos sobre
              scope: en cuanto haya schema se activan sin tocar el layout). */}
          <div className="flex items-center gap-3 pt-1">
            <label htmlFor="periodo-tiempo" className="text-xs font-medium text-ink-2">
              Periodo de tiempo
            </label>
            <select
              id="periodo-tiempo"
              value="inmediatamente"
              onChange={() => {
                /* solo "Inmediatamente" es seleccionable hoy */
              }}
              className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand transition-colors"
            >
              <option value="inmediatamente">Inmediatamente</option>
              <option value="semana-que-viene" disabled>
                La semana que viene (próximamente)
              </option>
              <option value="a-partir-del-dia" disabled>
                A partir del día… (próximamente)
              </option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
    </Modal>
  )
}
