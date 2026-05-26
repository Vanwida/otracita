'use client';

// -----------------------------------------------------------------------------
// DragTimeTooltip — flotante con la hora destino mientras se arrastra una cita
// o un descanso en la agenda Día. Feedback Reni (task #81).
//
// Posicionamiento via `position: fixed` con `pointer-events-none` para no
// interferir con el drop target. El padre (DayGrid) actualiza `x`, `y`, y
// `label` durante el dragover y limpia el estado al soltar — este componente
// es puramente visual.
//
// Vista Semana no usa este tooltip: WeekGrid es una matriz barbero×día con
// bloques de tamaño fijo y NO tiene drag&drop (cada cita se reposiciona
// abriendo el detalle o en vista Día).
// -----------------------------------------------------------------------------

interface Props {
  /** Si null, no se renderiza nada (el barbero no está arrastrando). */
  position: { x: number; y: number } | null;
  /** Texto a mostrar — típicamente "HH:MM" o "HH:MM → HH:MM". */
  label: string;
}

/** Offset en px sobre la posición del cursor (arriba-derecha, fuera del
 *  bloque que se arrastra). Coincide con el tamaño aproximado del cursor +
 *  un margen de aire para que el tooltip no quede pegado al puntero. */
const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = -28;

export default function DragTimeTooltip({ position, label }: Props) {
  if (!position) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[100] pointer-events-none select-none rounded-md bg-ink text-canvas text-xs font-semibold tabular-nums px-2 py-1 shadow-lg ring-1 ring-line-strong/20"
      style={{
        left: position.x + CURSOR_OFFSET_X,
        top: position.y + CURSOR_OFFSET_Y,
      }}
    >
      {label}
    </div>
  );
}
