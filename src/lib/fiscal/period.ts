// -----------------------------------------------------------------------------
// Períodos fiscales (trimestre / año) — single source of truth para el
// módulo de Administración (IVA/IRPF). Modelo 303 IVA y modelo 130 IRPF
// de autónomos se presentan trimestralmente; modelo 390 anualmente. El
// barbero debe poder filtrar por cualquier trimestre del año en curso +
// el año entero, sin inventar nuevas convenciones.
//
//   `YYYY-QN`   → trimestre   (Q1: ene-mar · Q2: abr-jun · Q3: jul-sep · Q4: oct-dic)
//   `YYYY`      → año entero
//
// Pure: sin DB ni I/O. Testeable con node --test.
// -----------------------------------------------------------------------------

export type FiscalPeriodKind = 'quarter' | 'year';

export interface FiscalPeriod {
  kind: FiscalPeriodKind;
  year: number;
  /** 1..4 cuando kind='quarter'. null si kind='year'. */
  quarter: number | null;
  /** YYYY-MM-DD inclusive (primer día del periodo). */
  startIso: string;
  /** YYYY-MM-DD exclusive (primer día del periodo siguiente). */
  endExclusiveIso: string;
  /** Etiqueta legible en es-ES — "Q2 2026" o "Año 2026". */
  label: string;
  /** Clave estable para URL (`YYYY-Q2` / `YYYY`). */
  key: string;
}

const QUARTER_FIRST_MONTH: Record<1 | 2 | 3 | 4, number> = {
  1: 1,
  2: 4,
  3: 7,
  4: 10,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFirstOfMonth(year: number, month1to12: number): string {
  return `${year}-${pad2(month1to12)}-01`;
}

export function fiscalQuarter(year: number, quarter: 1 | 2 | 3 | 4): FiscalPeriod {
  const firstMonth = QUARTER_FIRST_MONTH[quarter];
  const startIso = isoFirstOfMonth(year, firstMonth);
  const endMonth = firstMonth + 3;
  const endExclusiveIso =
    endMonth > 12
      ? isoFirstOfMonth(year + 1, endMonth - 12)
      : isoFirstOfMonth(year, endMonth);
  return {
    kind: 'quarter',
    year,
    quarter,
    startIso,
    endExclusiveIso,
    label: `Q${quarter} ${year}`,
    key: `${year}-Q${quarter}`,
  };
}

export function fiscalYear(year: number): FiscalPeriod {
  return {
    kind: 'year',
    year,
    quarter: null,
    startIso: isoFirstOfMonth(year, 1),
    endExclusiveIso: isoFirstOfMonth(year + 1, 1),
    label: `Año ${year}`,
    key: String(year),
  };
}

/**
 * Calcula el trimestre actual (1..4) para una fecha dada.
 */
export function currentQuarter(date: Date = new Date()): {
  year: number;
  quarter: 1 | 2 | 3 | 4;
} {
  const q = Math.ceil((date.getMonth() + 1) / 3) as 1 | 2 | 3 | 4;
  return { year: date.getFullYear(), quarter: q };
}

/**
 * Parsea la clave de período de la URL.
 *   "2026-Q1" → trimestre
 *   "2026"    → año
 *   null/inválido → trimestre actual (fallback).
 */
export function parseFiscalPeriodKey(raw: string | null | undefined, now: Date = new Date()): FiscalPeriod {
  if (raw) {
    const mq = /^(\d{4})-Q([1-4])$/.exec(raw);
    if (mq) {
      const y = parseInt(mq[1], 10);
      const q = parseInt(mq[2], 10) as 1 | 2 | 3 | 4;
      return fiscalQuarter(y, q);
    }
    const my = /^(\d{4})$/.exec(raw);
    if (my) {
      return fiscalYear(parseInt(my[1], 10));
    }
  }
  const cur = currentQuarter(now);
  return fiscalQuarter(cur.year, cur.quarter);
}

/**
 * Genera la lista de claves disponibles para el selector — el año pedido +
 * el anterior. El barbero rara vez necesita más profundidad histórica desde
 * esta vista; si la necesita, edita la URL.
 */
export function fiscalPeriodOptions(now: Date = new Date()): FiscalPeriod[] {
  const cur = currentQuarter(now);
  const years = [cur.year, cur.year - 1];
  const out: FiscalPeriod[] = [];
  for (const y of years) {
    out.push(fiscalYear(y));
    for (const q of [1, 2, 3, 4] as const) {
      out.push(fiscalQuarter(y, q));
    }
  }
  return out;
}
