import { CheckCircle2, UserX, CalendarX2, CalendarClock, type LucideIcon } from 'lucide-react';
import { barberColorVar } from './types';
import type { Barber } from './types';

// -----------------------------------------------------------------------------
// FUENTE ÚNICA del color de una cita en la agenda (DESIGN.md §"Booking card"
// + fix #6). Antes cada rejilla decidía su propio color: Día tintaba por
// ESTADO (verde/slate/rojo), Semana por FUENTE (violeta/emerald), Mes otra
// vez por fuente. Tres lógicas distintas = la misma cita salía de un color
// en Día y de otro en Semana. Inconsistente y confuso.
//
// Regla única ahora:
//   · El COLOR identifica al BARBERO (barberColorVar(displayOrder)) y es el
//     mismo en Día, Semana y Mes. Sin barbero → neutral (line-strong).
//   · El ESTADO se comunica con TRATAMIENTO sobre ese mismo color (relleno
//     sólido = activa, tinte suave = hecha, tachado/atenuado = cancelada,
//     anillo danger = no vino) + ÍCONO + ETIQUETA. Nunca con otro tono
//     (DESIGN.md: "Color como ÚNICA señal de estado" está prohibido).
//
// Todas las rejillas (DayGrid/WeekGrid/MonthGrid) consumen este módulo —
// cero lógica de color duplicada.
// -----------------------------------------------------------------------------

export type AppointmentStatus = 'confirmed' | 'completed' | 'no_show' | 'cancelled';

/** Normaliza cualquier string de estado a uno de los 4 canónicos. */
export function normalizeStatus(status: string): AppointmentStatus {
  if (status === 'completed' || status === 'no_show' || status === 'cancelled') {
    return status;
  }
  return 'confirmed';
}

/**
 * Color de identidad de la cita = color del barbero. `displayOrder` null
 * (cita sin barbero asignado / fila "Sin asignar") → neutral del sistema.
 * Devuelve la CSS var lista para usar inline.
 */
export function appointmentColorVar(displayOrder: number | null | undefined): string {
  if (displayOrder === null || displayOrder === undefined) {
    return 'var(--color-line-strong)';
  }
  return barberColorVar(displayOrder);
}

/**
 * Estilo inline del bloque de cita para una rejilla "densa" (Día/Semana):
 * bloque con relleno = el color del barbero; el ESTADO modula opacidad de
 * fondo + texto + borde, sin cambiar el tono. El acento izquierdo 4px
 * (DESIGN.md "Booking card") siempre lleva el color a plena saturación
 * para que la identidad del barbero se lea aunque el fondo esté atenuado.
 */
export function appointmentBlockStyle(
  displayOrder: number | null | undefined,
  status: string,
): {
  style: React.CSSProperties;
  /** Clases de tratamiento (tachado/atenuado) — el color va en `style`. */
  treatment: string;
} {
  const color = appointmentColorVar(displayOrder);
  const s = normalizeStatus(status);

  // `color-mix` mantiene UN solo tono (el del barbero) y solo varía cuánto
  // se mezcla con surface/canvas → el estado es contraste, no color nuevo.
  switch (s) {
    case 'completed':
      // Hecha: relleno muy suave, como "ya cerrada / archivada".
      return {
        style: {
          backgroundColor: `color-mix(in oklab, ${color} 14%, var(--color-surface))`,
          color: 'var(--color-ink)',
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid',
          borderLeftColor: color,
        },
        treatment: '',
      };
    case 'no_show':
      // No vino: relleno suave + anillo danger (color + ícono + label lo
      // refuerzan; no dependemos del tono para comunicar el estado).
      return {
        style: {
          backgroundColor: `color-mix(in oklab, ${color} 18%, var(--color-surface))`,
          color: 'var(--color-ink)',
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid',
          borderLeftColor: color,
          boxShadow: 'inset 0 0 0 1px var(--color-danger)',
        },
        treatment: '',
      };
    case 'cancelled':
      // Cancelada: casi gris, tachada y atenuada.
      return {
        style: {
          backgroundColor: 'var(--color-overlay)',
          color: 'var(--color-ink-3)',
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid',
          borderLeftColor: 'var(--color-line-strong)',
        },
        treatment: 'line-through opacity-70',
      };
    default:
      // Confirmada / activa: relleno sólido con el color del barbero.
      return {
        style: {
          backgroundColor: `color-mix(in oklab, ${color} 30%, var(--color-surface))`,
          color: 'var(--color-ink)',
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid',
          borderLeftColor: color,
        },
        treatment: '',
      };
  }
}

/**
 * Variante "chip" para la rejilla de Mes (texto sobre fondo tintado, sin
 * acento lateral porque el chip es de una línea). Mismo color de barbero,
 * mismo principio de estado-por-tratamiento.
 */
export function appointmentChipStyle(
  displayOrder: number | null | undefined,
  status: string,
): { style: React.CSSProperties; treatment: string } {
  const color = appointmentColorVar(displayOrder);
  const s = normalizeStatus(status);
  if (s === 'cancelled') {
    return {
      style: {
        backgroundColor: 'var(--color-overlay)',
        color: 'var(--color-ink-3)',
      },
      treatment: 'line-through opacity-70',
    };
  }
  const mix = s === 'completed' ? 14 : 22;
  return {
    style: {
      backgroundColor: `color-mix(in oklab, ${color} ${mix}%, var(--color-surface))`,
      color: 'var(--color-ink)',
      boxShadow:
        s === 'no_show' ? 'inset 0 0 0 1px var(--color-danger)' : `inset 2px 0 0 0 ${color}`,
    },
    treatment: '',
  };
}

/** Ícono + etiqueta del estado — fuente única (icon + texto = AAA, el color
 *  NUNCA es la única señal). `null` para confirmada (estado por defecto, no
 *  necesita decoración). */
export function statusBadge(
  status: string,
): { icon: LucideIcon; label: string; tone: string } | null {
  switch (normalizeStatus(status)) {
    case 'completed':
      return { icon: CheckCircle2, label: 'Hecha', tone: 'text-success' };
    case 'no_show':
      return { icon: UserX, label: 'No vino', tone: 'text-danger' };
    case 'cancelled':
      return { icon: CalendarX2, label: 'Cancelada', tone: 'text-ink-3' };
    default:
      return null;
  }
}

/** Ícono genérico para una cita confirmada (cuando una vista quiere
 *  mostrar SIEMPRE un ícono de estado, p.ej. la ficha del cliente). */
export const CONFIRMED_ICON: LucideIcon = CalendarClock;

/**
 * Leyenda de estado de cita — el panel "Destacados" del rail (paridad
 * Booksy 09.39.31). DERIVA de `statusBadge`/`CONFIRMED_ICON` (misma fuente
 * que pinta cada tile) para que la leyenda NUNCA mienta: si cambia el
 * ícono/etiqueta de un estado en el grid, la leyenda cambia con él. Orden
 * Booksy: confirmada → hecha → no vino → cancelada. `confirmed` no tiene
 * badge en el tile (estado por defecto = relleno sólido); en la leyenda sí
 * se nombra con el ícono genérico para que el usuario lo reconozca. */
export const STATUS_LEGEND: ReadonlyArray<{
  icon: LucideIcon;
  label: string;
  tone: string;
}> = [
  { icon: CONFIRMED_ICON, label: 'Confirmada', tone: 'text-ink-2' },
  statusBadge('completed')!,
  statusBadge('no_show')!,
  statusBadge('cancelled')!,
];

/**
 * Resuelve el `displayOrder` de una cita desde su nombre de barbero usando
 * la lista de barberos del tenant. Para Semana/Mes, que solo tienen
 * `event.barber` (nombre) y no la columna. Case-insensitive, igual que el
 * matcheo de columnas de DayGrid. `null` si no casa con ningún barbero
 * activo (cita sin asignar / barbero renombrado).
 */
export function displayOrderForEventBarber(
  barberName: string | null,
  barbers: Barber[],
): number | null {
  if (!barberName || !barberName.trim()) return null;
  const key = barberName.trim().toLowerCase();
  const match = barbers.find((b) => b.name.trim().toLowerCase() === key);
  return match ? match.displayOrder : null;
}
