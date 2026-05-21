// -----------------------------------------------------------------------------
// Periodo de KPIs del dashboard — single source of truth.
//
// Antes vivía duplicado en `/dashboard/page.tsx` y `/dashboard/caja/page.tsx`
// (PERIODS array + computePreviousPeriod). Centralizado aquí para evitar
// drift cuando se añaden periodos nuevos.
//
// Convenio: el "periodo actual" es un rango [periodStart, periodEnd). El
// "periodo anterior" es comparable en tamaño/posición — usado para flechas
// de tendencia (KPIs ↑/↓ vs el periodo anterior).
//
// Ámbito:
//   · day      → un día concreto (default hoy, override con ?date=YYYY-MM-DD)
//   · week     → últimos 7 días
//   · month    → del día 1 del mes actual → ahora
//   · year     → del 1-ene del año actual → ahora
//   · range    → rango custom (?start=YYYY-MM-DD&end=YYYY-MM-DD)
//   · lifetime → desde siempre (sin filtro)
//
// Pure: sin DB ni I/O. Testeable con node --test.
// -----------------------------------------------------------------------------

import { MS_IN_DAY } from '../time.ts';

export interface PeriodOption {
  key: Period;
  label: string;
}

export const PERIOD_OPTIONS: readonly PeriodOption[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
  { key: 'lifetime', label: 'Total' },
] as const;

// `range` no aparece en PERIOD_OPTIONS (no es una pestaña al uso, es un chip
// custom separado), pero sí es una clave válida.
export const PERIOD_KEYS = ['day', 'week', 'month', 'year', 'range', 'lifetime'] as const;
export type Period = (typeof PERIOD_KEYS)[number];

/** Match exacto YYYY-MM-DD — el formato que aceptan los <input type="date">. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse el query param y aplica fallback. */
export function resolvePeriod(raw: string | undefined, fallback: Period): Period {
  if (!raw) return fallback;
  return (PERIOD_KEYS as readonly string[]).includes(raw) ? (raw as Period) : fallback;
}

/**
 * Valida una cadena YYYY-MM-DD y devuelve la fecha (00:00 hora local) o null
 * si no parsea. Validamos por regex Y por roundtrip de Date — `2026-13-40`
 * pasa el regex pero da Date inválido tras normalizar.
 */
export function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw || !ISO_DATE_RE.test(raw)) return null;
  const [y, m, d] = raw.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/**
 * Format a `Date` as `YYYY-MM-DD` interpreting it in LOCAL time, no TZ shift.
 *
 * `toISOString()` siempre convierte a UTC y, con TZ Europe/Madrid, una
 * fecha local de "1-ene 00:00" se renderiza como "31-dic 23:00 UTC" → slice
 * devolvería el día anterior. Construimos manualmente para evitarlo.
 */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Inicio del rango actual. `null` para `lifetime` (sin filtro de fecha).
 *
 * `week` es deliberadamente "últimos 7 días" rolling (no semana ISO),
 * porque para un barbero "esta semana" en lunes es ambiguo.
 *
 * Para `day` y `range`, el caller debe pasar `params` con la fecha o el
 * rango específico — sin ellos, el helper hace fallback al "hoy" para `day`
 * y a `null` (sin filtro) para `range` (rango incompleto = inválido).
 */
export function getPeriodStart(
  period: Period,
  now: Date,
  params?: { date?: Date | null; start?: Date | null; end?: Date | null },
): Date | null {
  if (period === 'day') {
    const d = params?.date ?? null;
    if (d) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'week') {
    return new Date(now.getTime() - 7 * MS_IN_DAY);
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (period === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }
  if (period === 'range') {
    const start = params?.start ?? null;
    if (!start) return null;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate());
  }
  return null; // lifetime
}

/**
 * Final EXCLUSIVO del rango actual (mañana del último día con datos). Para
 * `lifetime` es `null` también — sin límite superior.
 *
 * Diseño: la mayoría de queries usan `< periodEndIso` para acotar arriba e
 * incluir hoy completo. Antes lo construía cada caller (`new Date(now+1d)`),
 * ahora vive aquí para que `day` y `range` lo respeten correctamente.
 */
export function getPeriodEnd(
  period: Period,
  now: Date,
  params?: { date?: Date | null; start?: Date | null; end?: Date | null },
): Date | null {
  if (period === 'day') {
    const d = params?.date ?? null;
    const base = d
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  }
  if (period === 'range') {
    const end = params?.end ?? null;
    if (!end) return null;
    return new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  if (period === 'lifetime') return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export interface PreviousPeriod {
  startIso: string;
  endIso: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Rango previo comparable, para calcular tendencias (↑/↓ vs anterior).
 */
export function getPreviousPeriod(
  period: Period,
  periodStart: Date | null,
  now: Date,
  params?: { date?: Date | null; start?: Date | null; end?: Date | null },
): PreviousPeriod | null {
  if (!periodStart || period === 'lifetime') return null;

  let prevStart: Date;
  let prevEnd: Date;

  if (period === 'day') {
    prevEnd = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      periodStart.getDate(),
    );
    prevStart = new Date(prevEnd.getTime() - MS_IN_DAY);
  } else if (period === 'week') {
    prevEnd = new Date(now.getTime() - 7 * MS_IN_DAY);
    prevStart = new Date(prevEnd.getTime() - 7 * MS_IN_DAY);
  } else if (period === 'year') {
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear(), 0, 1);
  } else if (period === 'range') {
    const end = params?.end ?? null;
    if (!end) return null;
    // Días civiles, no ms — evita DST drift en EU (último domingo de marzo).
    const endExclusive = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() + 1,
    );
    const sizeDays = Math.round(
      (endExclusive.getTime() - periodStart.getTime()) / MS_IN_DAY,
    );
    prevEnd = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      periodStart.getDate(),
    );
    prevStart = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      periodStart.getDate() - sizeDays,
    );
  } else {
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    startIso: toLocalIso(prevStart),
    endIso: toLocalIso(prevEnd),
    startDate: prevStart,
    endDate: prevEnd,
  };
}

// -----------------------------------------------------------------------------
// Resolución completa de la selección del usuario en searchParams.
// -----------------------------------------------------------------------------

export interface PeriodSelectionInput {
  period?: string;
  date?: string;
  start?: string;
  end?: string;
}

export interface PeriodSelection {
  period: Period;
  date: Date | null;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  periodStartIso: string | null;
  periodEndIso: string | null;
  periodLabel: string;
}

export function resolvePeriodSelection(
  input: PeriodSelectionInput,
  now: Date,
  fallback: Period = 'month',
): PeriodSelection {
  const period = resolvePeriod(input.period, fallback);
  const date = parseIsoDate(input.date);
  let rangeStart = parseIsoDate(input.start);
  let rangeEnd = parseIsoDate(input.end);

  if (rangeStart && rangeEnd && rangeEnd.getTime() < rangeStart.getTime()) {
    [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  }

  const params = { date, start: rangeStart, end: rangeEnd };
  const periodStart = getPeriodStart(period, now, params);
  const periodEnd = getPeriodEnd(period, now, params);

  const periodStartIso = periodStart ? toLocalIso(periodStart) : null;
  const periodEndIso = periodEnd ? toLocalIso(periodEnd) : null;

  let periodLabel =
    PERIOD_OPTIONS.find((p) => p.key === period)?.label.toLowerCase() ?? period;
  if (period === 'range') periodLabel = 'rango';

  return {
    period,
    date,
    rangeStart,
    rangeEnd,
    periodStart,
    periodEnd,
    periodStartIso,
    periodEndIso,
    periodLabel,
  };
}
