import { CheckCircle2, UserX, CalendarX2, CalendarClock, AlertTriangle, type LucideIcon } from 'lucide-react';
import { barberColorVar } from './types';
import type { Barber } from './types';

// -----------------------------------------------------------------------------
// FUENTE ÚNICA del color de una cita en la agenda (DESIGN.md §"Booking card"
// + fix #6, paridad Booksy-exact). Antes el bloque se tintaba por BARBERO y el
// estado solo modulaba opacidad — no es lo que hace Booksy y costaba leer "qué
// citas están sin confirmar / no vinieron" de un vistazo.
//
// Regla única ahora (igual que Booksy, idéntica en Día/Semana/Mes):
//   · El COLOR del bloque comunica el ESTADO de la cita:
//       confirmada    → verde  (--color-event-confirmed-*)
//       sin confirmar → rojo suave (--color-danger sobre surface)
//       hecha         → slate  (--color-event-completed-*)
//       no vino       → rojo   (--color-event-noshow-*)
//       cancelada     → gris atenuado + tachado (--color-event-cancelled-*)
//   · El estado SIEMPRE se refuerza además con ÍCONO + ETIQUETA
//     (`statusBadge`) — el color NUNCA es la única señal (AAA, DESIGN.md
//     "Color como única señal de estado" prohibido).
//   · La identidad del BARBERO NO va en el bloque: vive en el acento de la
//     cabecera de columna (avatar + franja `barberColorVar`, ver DayGrid).
//
// Todas las rejillas (DayGrid/WeekGrid/MonthGrid) consumen este módulo —
// cero lógica de color duplicada. `displayOrder` se mantiene en la firma por
// compatibilidad de llamadas pero ya NO decide el color (lo hace el estado).
// -----------------------------------------------------------------------------

export type AppointmentStatus =
  | 'confirmed'
  | 'pending'
  | 'completed'
  | 'no_show'
  | 'cancelled';

/** Normaliza cualquier string de estado a uno de los 5 canónicos. `pending`
 *  ("sin confirmar") es su propio estado — antes colapsaba en `confirmed`. */
export function normalizeStatus(status: string): AppointmentStatus {
  if (
    status === 'pending' ||
    status === 'completed' ||
    status === 'no_show' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'confirmed';
}

/**
 * Color de identidad del BARBERO. Solo para la cabecera de columna (franja +
 * avatar). `displayOrder` null → neutral del sistema. NO se usa para el bloque
 * de la cita (eso lo decide el estado). Devuelve la CSS var lista para inline.
 */
export function barberAccentVar(displayOrder: number | null | undefined): string {
  if (displayOrder === null || displayOrder === undefined) {
    return 'var(--color-line-strong)';
  }
  return barberColorVar(displayOrder);
}

/** Tokens de fondo/tinta/acento por estado — fuente única del color de cita.
 *  `accent` es el color a plena saturación del borde izquierdo (4px). */
function statusColors(s: AppointmentStatus): {
  bg: string;
  ink: string;
  accent: string;
} {
  switch (s) {
    case 'pending':
      // Sin confirmar: rojo suave (Booksy resalta lo no confirmado en rojo).
      return {
        bg: 'color-mix(in oklab, var(--color-danger) 14%, var(--color-surface))',
        ink: 'var(--color-ink)',
        accent: 'var(--color-danger)',
      };
    case 'completed':
      // Hecha: slate frío — cerrada / archivada.
      return {
        bg: 'var(--color-event-completed-bg)',
        ink: 'var(--color-event-completed-ink)',
        accent: 'var(--color-event-completed-ink)',
      };
    case 'no_show':
      // No vino / inasistencia: rojo.
      return {
        bg: 'var(--color-event-noshow-bg)',
        ink: 'var(--color-event-noshow-ink)',
        accent: 'var(--color-event-noshow)',
      };
    case 'cancelled':
      // Cancelada: casi gris, atenuada (el tachado lo añade `treatment`).
      return {
        bg: 'var(--color-event-cancelled-bg)',
        ink: 'var(--color-event-cancelled-ink)',
        accent: 'var(--color-line-strong)',
      };
    default:
      // Confirmada: verde sage.
      return {
        bg: 'var(--color-event-confirmed-bg)',
        ink: 'var(--color-event-confirmed-ink)',
        accent: 'var(--color-success)',
      };
  }
}

/**
 * Estilo inline del bloque de cita para una rejilla "densa" (Día/Semana):
 * el RELLENO comunica el ESTADO (Booksy-exact). El acento izquierdo 4px lleva
 * el color del estado a plena saturación. `displayOrder` se ignora para el
 * color — la identidad del barbero vive en la cabecera de columna.
 */
export function appointmentBlockStyle(
  displayOrder: number | null | undefined,
  status: string,
): {
  style: React.CSSProperties;
  /** Clases de tratamiento (tachado/atenuado) — el color va en `style`. */
  treatment: string;
} {
  const s = normalizeStatus(status);
  const { bg, ink, accent } = statusColors(s);
  return {
    style: {
      backgroundColor: bg,
      color: ink,
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: accent,
    },
    treatment: s === 'cancelled' ? 'line-through opacity-70' : '',
  };
}

/**
 * Variante "chip" para la rejilla de Mes (texto sobre fondo tintado, sin
 * acento lateral de 4px porque el chip es de una línea). Mismo mapeo de
 * ESTADO→color que el bloque (un acento fino 2px reemplaza al borde 4px).
 */
export function appointmentChipStyle(
  displayOrder: number | null | undefined,
  status: string,
): { style: React.CSSProperties; treatment: string } {
  const s = normalizeStatus(status);
  const { bg, ink, accent } = statusColors(s);
  return {
    style: {
      backgroundColor: bg,
      color: ink,
      boxShadow: `inset 2px 0 0 0 ${accent}`,
    },
    treatment: s === 'cancelled' ? 'line-through opacity-70' : '',
  };
}

/** Ícono + etiqueta del estado — fuente única (icon + texto = AAA, el color
 *  NUNCA es la única señal). `null` para confirmada (estado por defecto, no
 *  necesita decoración). */
export function statusBadge(
  status: string,
): { icon: LucideIcon; label: string; tone: string } | null {
  switch (normalizeStatus(status)) {
    case 'pending':
      return { icon: AlertTriangle, label: 'Sin confirmar', tone: 'text-danger' };
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
 * Booksy: confirmada → sin confirmar → hecha → no vino → cancelada.
 * `confirmed` no tiene badge en el tile (estado por defecto = relleno verde);
 * en la leyenda sí se nombra con el ícono genérico para reconocerlo. */
export const STATUS_LEGEND: ReadonlyArray<{
  icon: LucideIcon;
  label: string;
  tone: string;
}> = [
  { icon: CONFIRMED_ICON, label: 'Confirmada', tone: 'text-ink-2' },
  statusBadge('pending')!,
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
