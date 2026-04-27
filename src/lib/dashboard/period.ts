// -----------------------------------------------------------------------------
// Periodo de KPIs del dashboard — single source of truth.
//
// Antes vivía duplicado en `/dashboard/page.tsx` y `/dashboard/caja/page.tsx`
// (PERIODS array + computePreviousPeriod). Centralizado aquí para evitar
// drift cuando se añaden periodos nuevos (este commit añade 'year').
//
// Convenio: el "periodo actual" es un rango [periodStart, now). El "periodo
// anterior" es comparable en tamaño/posición — usado para flechas de
// tendencia (KPIs ↑/↓ vs el periodo anterior).
//
// Ámbito:
//   · day      → hoy 00:00 → ahora
//   · week     → últimos 7 días
//   · month    → del día 1 del mes actual → ahora
//   · year     → del 1-ene del año actual → ahora
//   · lifetime → desde siempre (sin filtro)
//
// Pure: sin DB ni I/O. Testeable con node --test.
// -----------------------------------------------------------------------------

export interface PeriodOption {
  key: Period;
  label: string;
}

export const PERIOD_OPTIONS: readonly PeriodOption[] = [
  { key: 'day', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
  { key: 'lifetime', label: 'Total' },
] as const;

export const PERIOD_KEYS = ['day', 'week', 'month', 'year', 'lifetime'] as const;
export type Period = (typeof PERIOD_KEYS)[number];

/** Parse el query param y aplica fallback. */
export function resolvePeriod(raw: string | undefined, fallback: Period): Period {
  if (!raw) return fallback;
  return (PERIOD_KEYS as readonly string[]).includes(raw) ? (raw as Period) : fallback;
}

/**
 * Inicio del rango actual. `null` para `lifetime` (sin filtro de fecha).
 *
 * `week` es deliberadamente "últimos 7 días" rolling (no semana ISO),
 * porque para un barbero "esta semana" en lunes es ambiguo.
 */
export function getPeriodStart(period: Period, now: Date): Date | null {
  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (period === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null; // lifetime
}

export interface PreviousPeriod {
  startIso: string; // YYYY-MM-DD
  endIso: string; // YYYY-MM-DD (exclusive)
  startDate: Date;
  endDate: Date;
}

/**
 * Format a `Date` as `YYYY-MM-DD` interpreting it in LOCAL time, no TZ shift.
 *
 * `toISOString()` siempre convierte a UTC y, con TZ Europe/Madrid, una
 * fecha local de "1-ene 00:00" se renderiza como "31-dic 23:00 UTC" → slice
 * devolvería el día anterior. Construimos manualmente para evitarlo.
 */
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Rango previo comparable, para calcular tendencias (↑/↓ vs anterior).
 *
 *   day      → ayer (00:00 → 24:00)
 *   week     → semana anterior (-14d → -7d)
 *   month    → mes anterior completo
 *   year     → año anterior completo
 *   lifetime → null (no hay anterior)
 *
 * Si `periodStart` es null devolvemos null — sin un punto de referencia
 * no podemos comparar.
 */
export function getPreviousPeriod(
  period: Period,
  periodStart: Date | null,
  now: Date,
): PreviousPeriod | null {
  if (!periodStart || period === 'lifetime') return null;

  let prevStart: Date;
  let prevEnd: Date;

  if (period === 'day') {
    prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    prevStart = new Date(prevEnd.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === 'week') {
    prevEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    prevStart = new Date(prevEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'year') {
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear(), 0, 1);
  } else {
    // month: mes pasado completo
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
