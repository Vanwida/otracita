// -----------------------------------------------------------------------------
// Availability — PURE hours/parsing helpers. Client-safe.
//
// This file has ZERO `@/db`, `@/db/schema`, `drizzle-orm` or `@/lib/
// unavailability-db` imports on purpose: client components (the agenda grid)
// need `hoursForDate` to draw the "fuera de horario" overlay, and pulling the
// db-backed `@/lib/availability` into the browser bundle crashes with
// "No database connection string was provided to neon()".
//
// `@/lib/availability` re-exports everything here so server callers keep their
// existing import path — the logic below is byte-identical to what used to
// live there, only relocated.
// -----------------------------------------------------------------------------

export interface TimeSlot {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export interface HoursForDay {
  start: string; // HH:MM
  end: string;   // HH:MM
}

/** Full-week hours map; keys: 'monday'..'sunday' or 'lunes'..'domingo'. */
export type WeeklyHours = Record<string, string>;

/**
 * Mapa de overrides puntuales por fecha (YYYY-MM-DD) → valor del horario para
 * ese día concreto. Valor "HH:MM-HH:MM" reemplaza al rango del semanal;
 * "Cerrado" lo cierra. La presencia de la clave anula el recurrente para esa
 * fecha (incluso si el valor es vacío/inválido — en ese caso el motor lo
 * trata como cerrado, igual que el comportamiento existente para "Cerrado").
 */
export type DayHourOverrides = Record<string, string>;

export function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Parsea un valor de horario de un día concreto ("HH:MM-HH:MM" o "Cerrado").
 * Devuelve `null` si está cerrado o si el formato es inválido.
 */
function parseDayHourValue(value: string): HoursForDay | null {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned || cleaned === 'closed' || cleaned === 'cerrado') return null;
  // Accept "10:00-20:00" or "10:00 - 20:00"
  const parts = cleaned.split('-').map((p) => p.trim());
  if (parts.length !== 2) return null;
  return { start: parts[0], end: parts[1] };
}

/**
 * Resolve the open-close window for a given date from a WeeklyHours map.
 * Returns `null` when the day is closed. Accepts both English and Spanish
 * weekday keys so existing configs keep working either way.
 *
 * Si se pasa `overrides`, una entrada cuya clave sea exactamente `date`
 * (YYYY-MM-DD) GANA al recurrente. Esto permite "extender 1h el martes 28"
 * sin tocar el semanal: el dueño guarda un override puntual y el motor lo
 * aplica solo ese día. Si el override está presente pero el valor es
 * "Cerrado" / inválido, el día queda cerrado (consistente con la regla
 * habitual de hoursForDate).
 */
export function hoursForDate(
  date: string,
  hours: WeeklyHours | null,
  overrides?: DayHourOverrides | null,
): HoursForDay | null {
  // 1) Override puntual gana al recurrente, si existe entrada para ESA fecha.
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, date)) {
    const ov = overrides[date];
    if (typeof ov === 'string') return parseDayHourValue(ov);
    return null;
  }
  // 2) Fallback al semanal recurrente (lunes-domingo / monday-sunday).
  if (!hours) return null;
  const d = new Date(`${date}T00:00:00Z`);
  const weekdayIndex = d.getUTCDay(); // 0 = Sunday
  const keysEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const keysEs = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const value = hours[keysEn[weekdayIndex]] ?? hours[keysEs[weekdayIndex]];
  if (!value || typeof value !== 'string') return null;
  return parseDayHourValue(value);
}
