'use client';

import { useEffect, useState } from 'react';

/**
 * Canonical "live clock" hook for the agenda grids. Returns a fresh `Date`
 * that re-renders the host component every `intervalMs` (default 60s) so
 * the now-line indicator (DayGrid + WeekGrid) actually drifts down with
 * the clock without requiring a page reload.
 *
 * Bug fix (Reni 2026-05-22): la línea horizontal "hora actual" se quedaba
 * congelada en el `new Date()` del mount. La causa raíz no era la falta de
 * `setInterval` — los grids ya lo tenían inline — sino que cada grid
 * mantenía su propio scheduler y eso es frágil de mantener: cualquier
 * refactor (early-return, dependencias, condicional) puede silenciarlo.
 * Centralizamos en un hook único, predecible y testeable.
 *
 * Importante: el initial state usa `new Date()` durante el SSR para
 * evitar mismatch de hidratación con el primer render del cliente. El
 * primer tick real ocurre tras `intervalMs` (60s) — un retraso máximo de
 * un minuto en pintar la primera posición exacta, aceptable para una UI
 * de agenda.
 */
export function useCurrentTime(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
