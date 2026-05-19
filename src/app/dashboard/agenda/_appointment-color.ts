import { CheckCircle2, UserX, CalendarX2, AlertTriangle, type LucideIcon } from 'lucide-react';

// -----------------------------------------------------------------------------
// FUENTE ÚNICA del color de una cita en la agenda (DESIGN.md §"Booking card"
// + fix #6, paridad Booksy-exact). Antes el bloque se tintaba por BARBERO y el
// estado solo modulaba opacidad — no es lo que hace Booksy y costaba leer "qué
// citas están sin confirmar / no vinieron" de un vistazo.
//
// Regla única ahora (igual que Booksy, idéntica en Día/Semana/Mes):
//   · El COLOR del bloque comunica el ESTADO de la cita:
//       confirmada    → verde  (--color-event-confirmed-* / --color-success)
//       sin confirmar → rojo suave (--color-danger sobre surface)
//       hecha         → slate  (--color-event-completed-*)
//       no vino       → MORADO (--color-event-native, hue 292) — Booksy
//                       pinta la inasistencia en morado, no en rojo. El
//                       token "-noshow" es rojo (hue 29): NO lo usamos aquí,
//                       honramos la intención visual de Booksy.
//       cancelada     → gris atenuado + tachado (--color-line-strong)
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

// Identidad del barbero (avatar + franja de color) NO vive aquí: la pinta
// DayGrid directamente con `barberColorVar` (de ./types) en la cabecera de
// columna. Este módulo es solo color POR ESTADO.

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
      // No vino / inasistencia: MORADO (Booksy pinta la inasistencia en
      // morado). --color-event-native es el morado del sistema (hue 292);
      // no hay variantes -bg/-ink, así que el relleno suave se deriva con
      // color-mix sobre surface (mismo patrón que `pending`).
      return {
        bg: 'color-mix(in oklab, var(--color-event-native) 16%, var(--color-surface))',
        ink: 'var(--color-ink)',
        accent: 'var(--color-event-native)',
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
 *  NUNCA es la única señal). Devuelve SIEMPRE (también para confirmada): así
 *  cada tile puede mostrar su estado de forma explícita y la leyenda deriva
 *  100% de aquí sin entradas a mano. */
export function statusBadge(
  status: string,
): { icon: LucideIcon; label: string; tone: string } {
  switch (normalizeStatus(status)) {
    case 'pending':
      return { icon: AlertTriangle, label: 'Sin confirmar', tone: 'text-danger' };
    case 'completed':
      return { icon: CheckCircle2, label: 'Hecha', tone: 'text-success' };
    case 'no_show':
      // Morado (Booksy), igual que el relleno del bloque.
      return { icon: UserX, label: 'No vino', tone: 'text-event-native' };
    case 'cancelled':
      return { icon: CalendarX2, label: 'Cancelada', tone: 'text-ink-3' };
    default:
      // Confirmada — estado por defecto. Antes devolvía null; ahora también
      // tiene badge para que el estado sea siempre explícito (Booksy).
      return { icon: CheckCircle2, label: 'Confirmada', tone: 'text-success' };
  }
}

/**
 * Leyenda "Estado de la cita" — panel lateral del rail (paridad Booksy
 * 09.39.31), aplica a Día/Semana/Mes. DERIVA por completo de `statusBadge`
 * (misma fuente que pinta cada tile) para que la leyenda NUNCA mienta: si
 * cambia el ícono/etiqueta/tono de un estado, la leyenda cambia con él.
 * Orden Booksy: confirmada → sin confirmar → hecha → no vino → cancelada. */
export const STATUS_LEGEND: ReadonlyArray<{
  icon: LucideIcon;
  label: string;
  tone: string;
}> = [
  statusBadge('confirmed'),
  statusBadge('pending'),
  statusBadge('completed'),
  statusBadge('no_show'),
  statusBadge('cancelled'),
];
