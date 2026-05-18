// -----------------------------------------------------------------------------
// Unavailability — pure interval math for recurring breaks (descansos) + ad-hoc
// blocks/absences that SUBTRACT from a barber's open window.
//
// This file has ZERO `@/` imports on purpose: it must run under
// `node --test` like the other pure-logic modules (loyalty/compute.ts,
// payroll/compute.ts). The DB loader lives in `unavailability-db.ts`.
//
// Additive on top of the existing availability engine: the `barbers.hours`
// string (legacy "10:00-20:00") and `barbers.blockedDates` (whole-day legacy)
// are NEVER read or modified. `availability.ts` resolves the open window
// exactly as before, then asks this module for the busy intervals to remove.
// A barber with zero breaks/blocks yields zero extra intervals ⇒ identical
// slots to before (no-regression; asserted in unavailability.test.ts).
//
//   breaks  → recurring weekly (R12). Applies on every matching weekday.
//   blocks  → one specific date (R2). Partial range OR full-day absence
//             (start/end null ⇒ the whole working day is removed).
// -----------------------------------------------------------------------------

/** A half-open busy interval in minutes-from-midnight: [start, end). */
export interface BusyInterval {
  start: number;
  end: number;
}

/** Recurring weekly break for a barber. `weekday`: 0=Sunday … 6=Saturday. */
export interface RecurringBreak {
  weekday: number;
  start: string; // HH:MM
  end: string; // HH:MM
}

/** Ad-hoc one-off block/absence for a barber on a specific date. */
export interface DatedBlock {
  /** HH:MM, or null for a full-day absence (whole working day removed). */
  start: string | null;
  end: string | null;
}

/** All unavailability inputs for ONE barber on ONE date. */
export interface BarberUnavailability {
  /** Recurring weekly breaks (any weekday — filtered by date's weekday here). */
  breaks: RecurringBreak[];
  /** Blocks/absences already filtered to the target date. */
  blocks: DatedBlock[];
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * UTC weekday index for a YYYY-MM-DD string. Mirrors `hoursForDate` in
 * availability.ts (same `getUTCDay()` convention) so breaks line up with the
 * day the open-window is computed for — one weekday convention across the
 * whole engine.
 */
export function weekdayForDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Turn a barber's unavailability into busy intervals for `date`, clamped to
 * the barber's open window [openStart, openEnd) in minutes. A full-day block
 * (start/end null) removes the entire window. Pure — no I/O, unit-tested.
 *
 * Returns [] when the barber has no breaks/blocks (the common case) so the
 * caller's slot loop behaves byte-for-byte as it did before this feature.
 */
export function unavailabilityIntervals(
  date: string,
  openStart: number,
  openEnd: number,
  u: BarberUnavailability,
): BusyInterval[] {
  if (openEnd <= openStart) return [];
  const out: BusyInterval[] = [];
  const weekday = weekdayForDate(date);

  for (const b of u.breaks) {
    if (b.weekday !== weekday) continue;
    const s = Math.max(openStart, parseMinutes(b.start));
    const e = Math.min(openEnd, parseMinutes(b.end));
    if (e > s) out.push({ start: s, end: e });
  }

  for (const blk of u.blocks) {
    if (blk.start == null || blk.end == null) {
      // Full-day absence → the entire working window is unavailable.
      out.push({ start: openStart, end: openEnd });
      continue;
    }
    const s = Math.max(openStart, parseMinutes(blk.start));
    const e = Math.min(openEnd, parseMinutes(blk.end));
    if (e > s) out.push({ start: s, end: e });
  }

  return out;
}

const EMPTY: BarberUnavailability = { breaks: [], blocks: [] };

/** Safe lookup — a barber with no rows behaves exactly as pre-feature. */
export function unavailabilityFor(
  map: Map<string, BarberUnavailability>,
  barberId: string,
): BarberUnavailability {
  return map.get(barberId) ?? EMPTY;
}
