'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  CalendarOff,
  Ban,
  Clock,
} from 'lucide-react'
import {
  HOURS_DAYS,
  DAY_LABELS,
  type HoursDay,
  hoursDayForDate,
  parseHoursValue,
  toMinutes,
  formatRangeHours,
  weekdayToHoursDay,
} from './weekdays'
import ScheduleEditorModal from './ScheduleEditorModal'
import AbsenceModal from './AbsenceModal'
import BlockModal from './BlockModal'

// -----------------------------------------------------------------------------
// TurnosManager — timeline de turnos del equipo (R12 horario/descansos, R2
// faltas de disponibilidad + ausencias). Mirror del Booksy "Turnos"
// (screenshots 10.17.35 día / 10.17.56 semana).
//
//  · Día   → filas empleado × eje de horas; bloque verde = ventana abierta,
//            inset gris "Descanso" = barber_breaks de ese weekday, banda
//            roja = barber_block puntual de ESA fecha.
//  · Semana→ grid empleado × 7 días; cada celda resume horas + descanso.
//
// Click en fila/celda → chooser (EDITAR HORARIO / AÑADIR AUSENCIA / AÑADIR
// FALTA DE DISPONIBILIDAD, screenshots 10.18.07 + 10.22.09) → abre el modal
// correspondiente. Los modales escriben vía las APIs tenant-scoped ya
// existentes; al cerrar con éxito hacemos router.refresh() para repintar
// con datos frescos del server (sin estado duplicado en cliente).
// -----------------------------------------------------------------------------

export interface TurnosBreak {
  id: string
  weekday: number
  startTime: string
  endTime: string
}

export interface TurnosBlock {
  id: string
  date: string
  startTime: string | null
  endTime: string | null
  kind: 'block' | 'absence'
  reason: string | null
  note: string | null
  approved: boolean
}

export interface TurnosBarber {
  id: string
  name: string
  photoUrl: string | null
  hours: Record<string, string> | null
  breaks: TurnosBreak[]
  blocks: TurnosBlock[]
}

interface Props {
  barbers: TurnosBarber[]
  shopHours: Record<string, string> | null
}

type ViewMode = 'dia' | 'semana'

// Timeline axis: 8:00–22:00 covers any realistic barbershop day and matches
// the Booksy axis density. One source for both the header ticks and the
// block geometry.
const AXIS_START_MIN = 8 * 60
const AXIS_END_MIN = 22 * 60
const AXIS_SPAN = AXIS_END_MIN - AXIS_START_MIN

function madridToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Monday of the ISO week containing `date`. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun
  const delta = dow === 0 ? -6 : 1 - dow
  return addDays(date, delta)
}

function formatDayHeader(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

function pctLeft(min: number): number {
  return ((min - AXIS_START_MIN) / AXIS_SPAN) * 100
}

function pctWidth(startMin: number, endMin: number): number {
  return ((endMin - startMin) / AXIS_SPAN) * 100
}

interface ChooserState {
  barber: TurnosBarber
  date: string
}

export default function TurnosManager({ barbers, shopHours }: Props) {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('dia')
  const [anchor, setAnchor] = useState<string>(madridToday())

  const [chooser, setChooser] = useState<ChooserState | null>(null)
  const [scheduleFor, setScheduleFor] = useState<TurnosBarber | null>(null)
  const [absenceFor, setAbsenceFor] = useState<{ barber: TurnosBarber; date: string } | null>(null)
  const [blockFor, setBlockFor] = useState<{ barber: TurnosBarber; date: string } | null>(null)

  const weekStart = useMemo(() => mondayOf(anchor), [anchor])
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const hourTicks = useMemo(() => {
    const ticks: number[] = []
    for (let m = AXIS_START_MIN; m <= AXIS_END_MIN; m += 60) ticks.push(m)
    return ticks
  }, [])

  function onSaved() {
    setScheduleFor(null)
    setAbsenceFor(null)
    setBlockFor(null)
    router.refresh()
  }

  function step(dir: -1 | 1) {
    setAnchor((a) => addDays(a, view === 'dia' ? dir : dir * 7))
  }

  if (barbers.length === 0) {
    return (
      <div className="rounded-control border border-line bg-surface p-8 text-center">
        <Clock className="h-6 w-6 text-ink-3 mx-auto mb-3" />
        <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
          Sin barberos activos
        </h2>
        <p className="text-ink-2 mt-1 max-w-md mx-auto" style={{ fontSize: 'var(--text-meta)' }}>
          Añade barberos en la pestaña Empleados para gestionar sus turnos aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: Día/Semana + navegación de fecha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Vista"
          className="inline-flex items-center gap-1 bg-overlay border border-line rounded-control p-1"
        >
          {(['dia', 'semana'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === v ? 'bg-surface shadow-sm text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {v === 'dia' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Anterior"
            className="p-1.5 rounded-md border border-line bg-surface text-ink-2 hover:text-ink hover:border-line-strong transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-ink capitalize min-w-[12rem] text-center">
            {view === 'dia'
              ? formatDayHeader(anchor)
              : `${formatDayHeader(weekStart)} – ${formatDayHeader(addDays(weekStart, 6))}`}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Siguiente"
            className="p-1.5 rounded-md border border-line bg-surface text-ink-2 hover:text-ink hover:border-line-strong transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(madridToday())}
            className="ml-1 px-3 py-1.5 rounded-md border border-line bg-surface text-xs font-medium text-ink-2 hover:text-ink hover:border-line-strong transition-colors"
          >
            Hoy
          </button>
        </div>
      </div>

      {view === 'dia' ? (
        <DayTimeline
          barbers={barbers}
          shopHours={shopHours}
          date={anchor}
          hourTicks={hourTicks}
          onPickRow={(barber) => setChooser({ barber, date: anchor })}
        />
      ) : (
        <WeekGrid
          barbers={barbers}
          shopHours={shopHours}
          weekDates={weekDates}
          onPickCell={(barber, date) => setChooser({ barber, date })}
        />
      )}

      {chooser && (
        <ActionChooser
          barberName={chooser.barber.name}
          onClose={() => setChooser(null)}
          onEditSchedule={() => {
            setScheduleFor(chooser.barber)
            setChooser(null)
          }}
          onAddAbsence={() => {
            setAbsenceFor({ barber: chooser.barber, date: chooser.date })
            setChooser(null)
          }}
          onAddBlock={() => {
            setBlockFor({ barber: chooser.barber, date: chooser.date })
            setChooser(null)
          }}
        />
      )}

      {scheduleFor && (
        <ScheduleEditorModal
          barber={scheduleFor}
          shopHours={shopHours}
          onClose={() => setScheduleFor(null)}
          onSaved={onSaved}
        />
      )}

      {absenceFor && (
        <AbsenceModal
          barber={absenceFor.barber}
          defaultDate={absenceFor.date}
          onClose={() => setAbsenceFor(null)}
          onSaved={onSaved}
        />
      )}

      {blockFor && (
        <BlockModal
          barber={blockFor.barber}
          defaultDate={blockFor.date}
          onClose={() => setBlockFor(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Resolve the open window for a barber on a given date: their own `hours`,
// falling back to shop hours (same inheritance rule as the engine).
// -----------------------------------------------------------------------------
function openWindowFor(
  barber: TurnosBarber,
  hoursDay: HoursDay,
  shopHours: Record<string, string> | null,
) {
  const map = barber.hours ?? shopHours
  return parseHoursValue(map?.[hoursDay])
}

function Avatar({ barber }: { barber: TurnosBarber }) {
  if (barber.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={barber.photoUrl}
        alt=""
        className="h-7 w-7 rounded-full object-cover border border-line shrink-0"
      />
    )
  }
  return (
    <span className="h-7 w-7 rounded-full bg-overlay border border-line flex items-center justify-center text-[11px] font-semibold text-ink-2 shrink-0">
      {barber.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

// -----------------------------------------------------------------------------
// DayTimeline — filas empleado × eje horario (screenshot 10.17.35).
// -----------------------------------------------------------------------------
function DayTimeline({
  barbers,
  shopHours,
  date,
  hourTicks,
  onPickRow,
}: {
  barbers: TurnosBarber[]
  shopHours: Record<string, string> | null
  date: string
  hourTicks: number[]
  onPickRow: (barber: TurnosBarber) => void
}) {
  const hoursDay = hoursDayForDate(date)

  return (
    <div className="rounded-control border border-line bg-surface overflow-hidden">
      {/* Hour axis header */}
      <div className="flex items-stretch border-b border-line bg-overlay/60">
        <div className="w-44 shrink-0 border-r border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Empleado
        </div>
        <div className="relative flex-1 h-8">
          {hourTicks.map((m) => (
            <span
              key={m}
              className="absolute top-1.5 -translate-x-1/2 text-[10px] tabular-nums text-ink-3"
              style={{ left: `${pctLeft(m)}%` }}
            >
              {String(Math.floor(m / 60)).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

      <div className="divide-y divide-line">
        {barbers.map((barber) => {
          const win = openWindowFor(barber, hoursDay, shopHours)
          const breaks = barber.breaks.filter(
            (b) => weekdayToHoursDay(b.weekday) === hoursDay,
          )
          const blocks = barber.blocks.filter((b) => b.date === date)
          const fullDayBlock = blocks.find((b) => !b.startTime || !b.endTime)

          return (
            <button
              key={barber.id}
              type="button"
              onClick={() => onPickRow(barber)}
              className="group flex items-stretch w-full text-left hover:bg-overlay/40 transition-colors"
            >
              <div className="w-44 shrink-0 border-r border-line px-3 py-3 flex items-center gap-2">
                <Avatar barber={barber} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{barber.name}</p>
                  <p className="text-[11px] text-ink-3 truncate">
                    {fullDayBlock
                      ? fullDayBlock.kind === 'absence'
                        ? 'Ausente todo el día'
                        : 'No disponible'
                      : win
                        ? `${win.start}–${win.end} · ${formatRangeHours(win)}`
                        : 'Sin turno'}
                  </p>
                </div>
              </div>

              <div className="relative flex-1 h-16">
                {/* Hour gridlines */}
                {hourTicks.map((m) => (
                  <span
                    key={m}
                    className="absolute top-0 bottom-0 w-px bg-line/60"
                    style={{ left: `${pctLeft(m)}%` }}
                  />
                ))}

                {fullDayBlock ? (
                  <div className="absolute inset-2 rounded-md bg-danger/10 border border-danger/30 flex items-center justify-center">
                    <span className="text-[11px] font-medium text-danger flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      {fullDayBlock.kind === 'absence' ? 'Ausencia' : 'No disponible'}
                    </span>
                  </div>
                ) : win ? (
                  <WorkBlock win={win} breaks={breaks} blocks={blocks} />
                ) : (
                  <span className="absolute inset-0 flex items-center pl-3 text-[11px] text-ink-3">
                    No hay turno
                  </span>
                )}

                <Pencil className="absolute top-2 right-2 h-3.5 w-3.5 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WorkBlock({
  win,
  breaks,
  blocks,
}: {
  win: { start: string; end: string }
  breaks: TurnosBreak[]
  blocks: TurnosBlock[]
}) {
  const ws = toMinutes(win.start)
  const we = toMinutes(win.end)

  return (
    <div
      className="absolute top-2 bottom-2 rounded-md bg-success/15 border border-success/30"
      style={{
        left: `${pctLeft(ws)}%`,
        width: `${pctWidth(ws, we)}%`,
      }}
    >
      <span className="absolute top-1.5 left-2 text-[11px] font-medium text-success tabular-nums">
        {win.start}–{win.end}
      </span>

      {/* Inset descansos recurrentes (barber_breaks) */}
      {breaks.map((br) => {
        const bs = Math.max(toMinutes(br.startTime), ws)
        const be = Math.min(toMinutes(br.endTime), we)
        if (be <= bs) return null
        return (
          <div
            key={br.id}
            className="absolute top-1/2 -translate-y-1/2 h-7 rounded bg-overlay border border-line-strong flex items-center justify-center"
            style={{
              left: `${((bs - ws) / (we - ws)) * 100}%`,
              width: `${((be - bs) / (we - ws)) * 100}%`,
            }}
            title={`Descanso ${br.startTime}–${br.endTime}`}
          >
            <span className="text-[10px] font-medium text-ink-2 px-1 truncate">Descanso</span>
          </div>
        )
      })}

      {/* Faltas de disponibilidad parciales de ESTA fecha (barber_blocks) */}
      {blocks
        .filter((b) => b.startTime && b.endTime)
        .map((b) => {
          const bs = Math.max(toMinutes(b.startTime as string), ws)
          const be = Math.min(toMinutes(b.endTime as string), we)
          if (be <= bs) return null
          return (
            <div
              key={b.id}
              className="absolute top-1 bottom-1 rounded bg-danger/15 border border-danger/40"
              style={{
                left: `${((bs - ws) / (we - ws)) * 100}%`,
                width: `${((be - bs) / (we - ws)) * 100}%`,
              }}
              title={`${b.kind === 'absence' ? 'Ausencia' : 'No disponible'} ${b.startTime}–${b.endTime}`}
            />
          )
        })}
    </div>
  )
}

// -----------------------------------------------------------------------------
// WeekGrid — empleado × 7 días (screenshot 10.17.56).
// -----------------------------------------------------------------------------
function WeekGrid({
  barbers,
  shopHours,
  weekDates,
  onPickCell,
}: {
  barbers: TurnosBarber[]
  shopHours: Record<string, string> | null
  weekDates: string[]
  onPickCell: (barber: TurnosBarber, date: string) => void
}) {
  return (
    <div className="rounded-control border border-line bg-surface overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-overlay/60 border-b border-line">
            <th className="sticky left-0 z-10 bg-overlay w-44 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Empleado
            </th>
            {weekDates.map((d, i) => (
              <th
                key={d}
                className="px-2 py-2 text-center text-[11px] font-semibold text-ink-2 min-w-[7rem]"
              >
                <span className="block uppercase tracking-wide">
                  {DAY_LABELS[HOURS_DAYS[i]]}
                </span>
                <span className="block text-[10px] text-ink-3 tabular-nums">
                  {new Date(`${d}T00:00:00Z`).getUTCDate()}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {barbers.map((barber) => (
            <tr key={barber.id}>
              <td className="sticky left-0 z-10 bg-surface w-44 px-3 py-3 border-r border-line">
                <div className="flex items-center gap-2">
                  <Avatar barber={barber} />
                  <span className="text-sm font-medium text-ink truncate">{barber.name}</span>
                </div>
              </td>
              {weekDates.map((d, i) => {
                const hoursDay = HOURS_DAYS[i]
                const win = openWindowFor(barber, hoursDay, shopHours)
                const dayBreaks = barber.breaks.filter(
                  (b) => weekdayToHoursDay(b.weekday) === hoursDay,
                )
                const dayBlocks = barber.blocks.filter((b) => b.date === d)
                const fullDay = dayBlocks.find((b) => !b.startTime || !b.endTime)
                return (
                  <td key={d} className="p-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => onPickCell(barber, d)}
                      className="w-full rounded-md border px-2 py-2 text-left transition-colors min-h-[3.5rem] group hover:border-line-strong"
                      style={{
                        backgroundColor: fullDay
                          ? 'color-mix(in srgb, var(--color-danger) 10%, transparent)'
                          : win
                            ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                            : 'var(--color-overlay)',
                        borderColor: fullDay
                          ? 'color-mix(in srgb, var(--color-danger) 30%, transparent)'
                          : win
                            ? 'color-mix(in srgb, var(--color-success) 30%, transparent)'
                            : 'var(--color-line)',
                      }}
                    >
                      {fullDay ? (
                        <span className="text-[11px] font-medium text-danger flex items-center gap-1">
                          <Ban className="h-3 w-3" />
                          {fullDay.kind === 'absence' ? 'Ausencia' : 'Bloqueado'}
                        </span>
                      ) : win ? (
                        <>
                          <span className="block text-[11px] font-medium text-success tabular-nums">
                            {win.start}–{win.end}
                          </span>
                          {dayBreaks.length > 0 && (
                            <span className="block text-[10px] text-ink-3 mt-0.5">
                              {dayBreaks.length} descanso{dayBreaks.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-ink-3">No hay turno</span>
                      )}
                      <Pencil className="h-3 w-3 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity float-right -mt-3" />
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// -----------------------------------------------------------------------------
// ActionChooser — popup tras click en fila/celda (screenshots 10.18.07,
// 10.22.09): EDITAR HORARIO / AÑADIR AUSENCIA / AÑADIR FALTA DE DISPONIBILIDAD.
// -----------------------------------------------------------------------------
function ActionChooser({
  barberName,
  onClose,
  onEditSchedule,
  onAddAbsence,
  onAddBlock,
}: {
  barberName: string
  onClose: () => void
  onEditSchedule: () => void
  onAddAbsence: () => void
  onAddBlock: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-xs overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-line">
          <p className="text-sm font-semibold text-ink truncate">{barberName}</p>
          <p className="text-[11px] text-ink-3">¿Qué quieres hacer?</p>
        </div>
        <div className="divide-y divide-line">
          {[
            { label: 'Editar horario de trabajo', icon: Pencil, fn: onEditSchedule },
            { label: 'Añadir ausencia', icon: CalendarOff, fn: onAddAbsence },
            { label: 'Añadir falta de disponibilidad', icon: Ban, fn: onAddBlock },
          ].map(({ label, icon: Icon, fn }) => (
            <button
              key={label}
              type="button"
              onClick={fn}
              className="w-full px-4 py-3 flex items-center gap-3 text-left text-sm text-ink hover:bg-overlay/60 transition-colors"
            >
              <Icon className="h-4 w-4 text-ink-3 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
