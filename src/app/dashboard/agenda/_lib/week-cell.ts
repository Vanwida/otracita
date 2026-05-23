// -----------------------------------------------------------------------------
// week-cell — helper puro para la VISTA SEMANA (modelo matriz Booksy/Fresha).
//
// La vista Semana ya NO es "7 columnas día × timeline vertical": es una MATRIZ
// barberos × días. Cada celda barbero×día lista las citas de ese barbero en
// ese día con bloques de tamaño fijo (rango horario + servicio), no
// proporcionales al tiempo. Cuando hay overflow (más citas que las que caben
// visualmente), se muestran las primeras `maxVisible` y el resto se colapsa
// detrás de un link "Mostrar todo (N)".
//
// Este módulo es PURO (sin React, sin DOM, sin I/O): solo decide cuántas
// citas son visibles y cuántas overflowean. Lo consume WeekGrid en el render.
// Testeado con node:test (ver `week-cell.test.ts`).
//
// Convenciones:
// · Las citas llegan ya ordenadas por hora (la API las devuelve así). El
//   helper preserva el orden — NO reordena.
// · `maxVisible` < 1 se trata como 1 (defensa: una celda con 0 visibles y
//   N overflow es UX absurda — siempre vemos al menos una cita si la hay).
// · 0 bookings → 0 visible / 0 overflow. La celda renderiza vacía.
// · bookings.length <= maxVisible → todos visibles, 0 overflow.
// -----------------------------------------------------------------------------

export interface WeekCellResult<T> {
  /** Primeras N citas que caben en la celda (en su orden original). */
  visible: T[];
  /** Cuántas citas quedan ocultas detrás del link "Mostrar todo". */
  overflowCount: number;
}

/**
 * Recorta una lista de citas para una celda barbero×día de la vista Semana.
 *
 * @param bookings   Citas del barbero en ese día (ya ordenadas por hora).
 * @param maxVisible Máximo de bloques visibles en la celda. Si la lista cabe
 *                   entera, se muestra entera y `overflowCount` queda en 0.
 */
export function buildWeekCell<T>(
  bookings: ReadonlyArray<T>,
  maxVisible: number,
): WeekCellResult<T> {
  // Defensa: maxVisible < 1 → forzamos 1. Una celda nunca debería mostrar
  // "0 visibles + N overflow" — sería un link sobre el vacío.
  const cap = Math.max(1, Math.floor(maxVisible));

  if (bookings.length === 0) {
    return { visible: [], overflowCount: 0 };
  }
  if (bookings.length <= cap) {
    return { visible: [...bookings], overflowCount: 0 };
  }
  return {
    visible: bookings.slice(0, cap),
    overflowCount: bookings.length - cap,
  };
}
