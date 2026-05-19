// Import relativo (no alias `@/`): este módulo es puro y client-safe y se
// testea con `node --test`, que no resuelve el alias de tsconfig.
import { hoursForDate, type WeeklyHours } from '../../../lib/availability-hours.ts';

// -----------------------------------------------------------------------------
// FUENTE ÚNICA de la VENTANA TEMPORAL visible de la agenda (Día y Semana).
//
// Antes DayGrid y WeekGrid hardcodeaban GRID_START=08:00 / GRID_END=22:00.
// Bug real: una barbería que abre a las 07:00 NO veía las 07:00 y las 08:00
// quedaban recortadas en el borde superior. Patrón estándar de la industria
// (FullCalendar timeGrid `slotMinTime`/`slotMaxTime`/`scrollTime`,
// Google Calendar / Cal.com día con scroll interno + auto-scroll): la
// ventana NO es fija, se DERIVA de los datos reales del día/semana visible:
//
//   gridStart = min( apertura más temprana de los barberos mostrados,
//                     inicio de la cita/bloqueo más temprano ) − padding
//   gridEnd   = max( cierre más tardío,
//                     fin de la cita/bloqueo más tardío ) + padding
//
// padding = 60 min, snap a la hora, clamp [00:00, 24:00]. NUNCA se recorta
// una hora en la que la tienda abre o existe un evento. La rejilla es
// scrollable internamente (la PÁGINA nunca scrollea — viewport-lock), así
// que un rango amplio siempre es alcanzable; el auto-scroll inicial lleva
// a la apertura (o a "ahora" si es hoy y está dentro del rango).
//
// Ambas rejillas consumen este módulo — cero lógica de ventana duplicada.
// -----------------------------------------------------------------------------

/** Píxeles por minuto del eje vertical (densidad de la rejilla). */
export const PX_PER_MIN = 2;

/** Snap de minutos para click-to-create y drag&drop (UX cliente; el
 *  servidor acepta cualquier HH:MM). */
export const SNAP_MIN = 5;

/** Padding por encima/debajo del rango de datos, en minutos. 60 = una hora
 *  de aire (snap-a-hora limpio) para que la apertura/primera cita no quede
 *  pegada al borde superior. */
const WINDOW_PAD_MIN = 60;

/** Fallback cuando no hay horario configurado NI eventos: una jornada
 *  típica de barbería para que una tienda nueva y vacía vea rejilla útil. */
const FALLBACK_START_MIN = 8 * 60; // 08:00
const FALLBACK_END_MIN = 22 * 60; // 22:00

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface AgendaWindow {
  /** Inicio de la ventana visible, en minutos desde medianoche. */
  startMin: number;
  /** Fin de la ventana visible, en minutos desde medianoche. */
  endMin: number;
  /** Alto total del cuerpo de la rejilla en px (rango × PX_PER_MIN). */
  totalHeight: number;
  /** Etiquetas de hora en punto dentro del rango, con su `top` en px. */
  hourLabels: ReadonlyArray<{ label: string; top: number }>;
}

interface ComputeArgs {
  /** Fechas YYYY-MM-DD visibles (1 en Día, 7 en Semana). */
  dates: string[];
  /** Horario semanal de la tienda (hoy todos los barberos lo heredan). */
  hours: WeeklyHours | null;
  /** Eventos cargados; sólo se consideran los de `dates`. */
  events: Array<{ date: string; time: string; duration: number }>;
}

function clampHourFloor(min: number): number {
  return Math.max(0, Math.floor(min / 60) * 60);
}

function clampHourCeil(min: number): number {
  return Math.min(24 * 60, Math.ceil(min / 60) * 60);
}

/**
 * Calcula la ventana visible para las fechas dadas. Determinista y puro:
 * mismas entradas → misma ventana (sin estado, sin reloj).
 */
export function computeAgendaWindow({
  dates,
  hours,
  events,
}: ComputeArgs): AgendaWindow {
  const dateSet = new Set(dates);

  // 1) Rango de horario de la tienda en las fechas visibles.
  let openMin: number | null = null;
  let closeMin: number | null = null;
  for (const d of dates) {
    const h = hoursForDate(d, hours);
    if (!h) continue;
    const o = toMinutes(h.start);
    const c = toMinutes(h.end);
    openMin = openMin === null ? o : Math.min(openMin, o);
    closeMin = closeMin === null ? c : Math.max(closeMin, c);
  }

  // 2) Rango de los eventos reales (citas/bloqueos) en esas fechas. Nunca
  //    se recorta un evento aunque caiga fuera del horario de tienda.
  let evStart: number | null = null;
  let evEnd: number | null = null;
  for (const e of events) {
    if (!dateSet.has(e.date)) continue;
    const s = toMinutes(e.time);
    const en = s + (e.duration || 0);
    evStart = evStart === null ? s : Math.min(evStart, s);
    evEnd = evEnd === null ? en : Math.max(evEnd, en);
  }

  // 3) Combinar. Si no hay ni horario ni eventos → fallback jornada típica.
  const haveData =
    openMin !== null || closeMin !== null || evStart !== null || evEnd !== null;

  let startMin: number;
  let endMin: number;
  if (!haveData) {
    startMin = FALLBACK_START_MIN;
    endMin = FALLBACK_END_MIN;
  } else {
    const lo = Math.min(
      openMin ?? Number.POSITIVE_INFINITY,
      evStart ?? Number.POSITIVE_INFINITY,
    );
    const hi = Math.max(
      closeMin ?? Number.NEGATIVE_INFINITY,
      evEnd ?? Number.NEGATIVE_INFINITY,
    );
    startMin = clampHourFloor(lo - WINDOW_PAD_MIN);
    endMin = clampHourCeil(hi + WINDOW_PAD_MIN);
  }

  // Garantía mínima: al menos 1h de rango (datos degenerados no rompen px).
  if (endMin - startMin < 60) endMin = Math.min(24 * 60, startMin + 60);

  const totalHeight = (endMin - startMin) * PX_PER_MIN;

  // Etiquetas en cada hora en punto del rango (inclusive del límite alto
  // sólo si cae justo en hora — su línea es el borde inferior).
  const hourLabels: Array<{ label: string; top: number }> = [];
  for (let m = startMin; m <= endMin; m += 60) {
    const h = Math.floor(m / 60);
    hourLabels.push({
      label: `${String(h).padStart(2, '0')}:00`,
      top: (m - startMin) * PX_PER_MIN,
    });
  }

  return { startMin, endMin, totalHeight, hourLabels };
}
