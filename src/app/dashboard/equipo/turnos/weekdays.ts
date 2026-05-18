// -----------------------------------------------------------------------------
// Weekday conventions — single source of truth for the Turnos UI.
//
// Two systems meet here and MUST NOT be confused:
//
//  · `barbers.hours` (PATCH /api/barbers/[id]) is a map keyed by Spanish day
//    names `lunes..domingo` with values "HH:MM-HH:MM" or "Cerrado". This is
//    what HoursEditor already writes — we stay compatible with it.
//
//  · `barber_breaks` (PUT /api/barbers/[id]/breaks) keys descansos by an
//    integer `weekday` where 0=domingo … 6=sábado (same index as
//    Date.getUTCDay(), the convention the availability engine uses).
//
// Everything in the Turnos UI iterates weeks Monday-first (how a barbershop
// reads its calendar), so the display order is its own list. Keep all three
// mappings here so a future edit can't drift one without the others.
// -----------------------------------------------------------------------------

/** Spanish `hours`-map keys, in barbershop reading order (Monday first). */
export const HOURS_DAYS = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const

export type HoursDay = (typeof HOURS_DAYS)[number]

export const DAY_LABELS_LONG: Record<HoursDay, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
}

/** `barber_breaks.weekday` integer for each Spanish key (0=dom … 6=sáb). */
export const HOURS_DAY_TO_WEEKDAY: Record<HoursDay, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

const WEEKDAY_TO_HOURS_DAY: Record<number, HoursDay> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
}

export function weekdayToHoursDay(weekday: number): HoursDay | null {
  return WEEKDAY_TO_HOURS_DAY[weekday] ?? null
}

/** Spanish key for a YYYY-MM-DD date (UTC, same basis as the engine). */
export function hoursDayForDate(date: string): HoursDay {
  const idx = new Date(`${date}T00:00:00Z`).getUTCDay()
  return WEEKDAY_TO_HOURS_DAY[idx]
}

export interface OpenWindow {
  start: string // "HH:MM"
  end: string // "HH:MM"
}

/**
 * Parse a single `hours` value ("11:00-20:00" / "10:00 - 20:00" / "Cerrado").
 * Mirrors `hoursForDate` in availability.ts so the timeline shows exactly the
 * window the booking engine treats as open. Returns null when closed.
 */
export function parseHoursValue(value: string | undefined | null): OpenWindow | null {
  if (!value || typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase()
  if (!cleaned || cleaned === 'closed' || cleaned === 'cerrado') return null
  const parts = cleaned.split('-').map((p) => p.trim())
  if (parts.length !== 2) return null
  if (!HHMM_RE.test(parts[0]) || !HHMM_RE.test(parts[1])) return null
  return { start: parts[0], end: parts[1] }
}

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function formatRangeHours(win: OpenWindow): string {
  const mins = toMinutes(win.end) - toMinutes(win.start)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (mins <= 0) return '0h'
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
