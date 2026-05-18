'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  CalendarOff,
  Ban,
  Clock,
  Check,
  Coffee,
  ArrowRight,
} from 'lucide-react'
import {
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
// faltas de disponibilidad + ausencias). Densidad estilo Booksy "Turnos"
// (screenshot 10.17.35), estética del proyecto (tokens, sin glass/gradient).
//
// v1 = vista DÍA solamente (la vista Semana + "Copiar" es follow-up, fuera
// de scope por shape brief aprobado). Filas = barberos activos, eje x =
// horas. Bloque verde = ventana abierta (desde `hours`, propio o heredado
// del local), inset gris "Descanso" = barber_breaks de ese weekday, banda
// danger = barber_block puntual de ESA fecha.
//
// Click en fila → chooser (Editar horario · Añadir ausencia · Falta de
// disponibilidad, screenshot 10.18.07) → abre el modal correspondiente.
// Los modales escriben vía las APIs tenant-scoped ya existentes; al cerrar
// con éxito hacemos router.refresh() para repintar con datos frescos del
// server (success optimista + revalidate, sin estado duplicado).
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
  /** null = el barbero hereda el horario del local (clients.chatbotHours). */
  hours: Record<string, string> | null
  breaks: TurnosBreak[]
  blocks: TurnosBlock[]
}

interface Props {
  barbers: TurnosBarber[]
  shopHours: Record<string, string> | null
}

// Eje 8:00-22:00 cubre cualquier jornada real de barbería y casa con la
// densidad del eje Booksy. Una sola fuente para los ticks y la geometría.
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
}

export default function TurnosManager({ barbers, shopHours }: Props) {
  const router = useRouter()
  const [anchor, setAnchor] = useState<string>(madridToday())

  const [chooser, setChooser] = useState<ChooserState | null>(null)
  const [scheduleFor, setScheduleFor] = useState<TurnosBarber | null>(null)
  const [absenceFor, setAbsenceFor] = useState<{ barber: TurnosBarber; date: string } | null>(null)
  const [blockFor, setBlockFor] = useState<{ barber: TurnosBarber; date: string } | null>(null)

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
    setAnchor((a) => addDays(a, dir))
  }

  // Empty: sin barberos activos → manda a Empleados (no hay nada que editar).
  if (barbers.length === 0) {
    return (
      <div className="rounded-control border border-line bg-surface p-8 text-center">
        <Clock className="h-6 w-6 text-ink-3 mx-auto mb-3" />
        <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
          Todavía no hay barberos
        </h2>
        <p className="text-ink-2 mt-1 max-w-md mx-auto" style={{ fontSize: 'var(--text-meta)' }}>
          Añade a tu equipo en Empleados y luego vuelve aquí para ajustar sus turnos.
        </p>
        <Link
          href="/dashboard/equipo"
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-cream-high)] bg-[var(--color-espresso)] hover:bg-[var(--color-espresso-2)] transition-colors"
        >
          Ir a Empleados
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: navegación de día */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Día anterior"
            className="p-1.5 rounded-md border border-line bg-surface text-ink-2 hover:text-ink hover:border-line-strong transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-ink capitalize min-w-[12rem] text-center">
            {formatDayHeader(anchor)}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Día siguiente"
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

        <p className="text-xs text-ink-3">
          Toca un barbero para editar su horario, añadir una ausencia o bloquear una franja.
        </p>
      </div>

      <DayTimeline
        barbers={barbers}
        shopHours={shopHours}
        date={anchor}
        hourTicks={hourTicks}
        onPickRow={(barber) => setChooser({ barber })}
      />

      {chooser && (
        <ActionChooser
          barberName={chooser.barber.name}
          onClose={() => setChooser(null)}
          onEditSchedule={() => {
            setScheduleFor(chooser.barber)
            setChooser(null)
          }}
          onAddAbsence={() => {
            setAbsenceFor({ barber: chooser.barber, date: anchor })
            setChooser(null)
          }}
          onAddBlock={() => {
            setBlockFor({ barber: chooser.barber, date: anchor })
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
// Resuelve la ventana abierta de un barbero en una fecha: su `hours` propio,
// o el del local si lo hereda (misma regla de herencia que el motor). El
// segundo valor indica si está heredando, para pintar "Horario del local".
// -----------------------------------------------------------------------------
function openWindowFor(
  barber: TurnosBarber,
  hoursDay: HoursDay,
  shopHours: Record<string, string> | null,
): { win: ReturnType<typeof parseHoursValue>; inherited: boolean } {
  const inherited = barber.hours == null
  const map = barber.hours ?? shopHours
  return { win: parseHoursValue(map?.[hoursDay]), inherited }
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
// DayTimeline — filas empleado x eje horario (screenshot 10.17.35).
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
      {/* Cabecera eje horario */}
      <div className="flex items-stretch border-b border-line bg-overlay/60">
        <div className="w-48 shrink-0 border-r border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
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
          const { win, inherited } = openWindowFor(barber, hoursDay, shopHours)
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
              <div className="w-48 shrink-0 border-r border-line px-3 py-3 flex items-center gap-2">
                <Avatar barber={barber} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{barber.name}</p>
                  <p className="text-[11px] text-ink-3 truncate flex items-center gap-1">
                    {fullDayBlock ? (
                      <>
                        <Ban className="h-3 w-3 shrink-0" />
                        {fullDayBlock.kind === 'absence'
                          ? 'Ausente todo el día'
                          : 'No disponible'}
                      </>
                    ) : win ? (
                      <>
                        {`${win.start}-${win.end} · ${formatRangeHours(win)}`}
                        {inherited && (
                          <span className="text-ink-3">· horario del local</span>
                        )}
                      </>
                    ) : (
                      'Sin turno'
                    )}
                  </p>
                </div>
              </div>

              <div className="relative flex-1 h-16">
                {/* Líneas guía por hora */}
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
      {/* color nunca como señal única → icono + texto (DESIGN.md) */}
      <span className="absolute top-1.5 left-2 text-[11px] font-medium text-success tabular-nums flex items-center gap-1">
        <Check className="h-3 w-3 shrink-0" />
        {win.start}-{win.end}
      </span>

      {/* Descansos recurrentes inset (barber_breaks) */}
      {breaks.map((br) => {
        const bs = Math.max(toMinutes(br.startTime), ws)
        const be = Math.min(toMinutes(br.endTime), we)
        if (be <= bs) return null
        return (
          <div
            key={br.id}
            className="absolute top-1/2 -translate-y-1/2 h-7 rounded bg-overlay border border-line-strong flex items-center justify-center gap-1 px-1"
            style={{
              left: `${((bs - ws) / (we - ws)) * 100}%`,
              width: `${((be - bs) / (we - ws)) * 100}%`,
            }}
            title={`Descanso ${br.startTime}-${br.endTime}`}
          >
            <Coffee className="h-3 w-3 text-ink-2 shrink-0" />
            <span className="text-[10px] font-medium text-ink-2 truncate">Descanso</span>
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
          const label = `${b.kind === 'absence' ? 'Ausencia' : 'No disponible'} ${b.startTime}-${b.endTime}`
          return (
            <div
              key={b.id}
              role="img"
              aria-label={label}
              className="absolute top-1 bottom-1 rounded bg-danger/15 border border-danger/40 flex items-center justify-center"
              style={{
                left: `${((bs - ws) / (we - ws)) * 100}%`,
                width: `${((be - bs) / (we - ws)) * 100}%`,
              }}
              title={label}
            >
              <Ban className="h-3 w-3 text-danger shrink-0" aria-hidden="true" />
            </div>
          )
        })}
    </div>
  )
}

// -----------------------------------------------------------------------------
// ActionChooser — popup tras click en fila (screenshot 10.18.07):
// Editar horario · Añadir ausencia · Falta de disponibilidad.
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim-strong)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-xs overflow-hidden"
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
            { label: 'Falta de disponibilidad', icon: Ban, fn: onAddBlock },
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
