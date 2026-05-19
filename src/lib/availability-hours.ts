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
 * Resolve the open-close window for a given date from a WeeklyHours map.
 * Returns `null` when the day is closed. Accepts both English and Spanish
 * weekday keys so existing configs keep working either way.
 */
export function hoursForDate(date: string, hours: WeeklyHours | null): HoursForDay | null {
  if (!hours) return null;
  const d = new Date(`${date}T00:00:00Z`);
  const weekdayIndex = d.getUTCDay(); // 0 = Sunday
  const keysEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const keysEs = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const value = hours[keysEn[weekdayIndex]] ?? hours[keysEs[weekdayIndex]];
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned || cleaned === 'closed' || cleaned === 'cerrado') return null;
  // Accept "10:00-20:00" or "10:00 - 20:00"
  const parts = cleaned.split('-').map((p) => p.trim());
  if (parts.length !== 2) return null;
  return { start: parts[0], end: parts[1] };
}
