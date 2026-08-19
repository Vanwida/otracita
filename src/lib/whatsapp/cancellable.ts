// ---------------------------------------------------------------------------
// Qué citas puede cancelar el cliente desde el bot.
//
// Regresión L-10: el botón «❌ Cancelar» del recordatorio buscaba
// `status = 'confirmed'` SIN filtro de fecha, ordenaba por `date` y cogía la
// primera. Como la barbería lleva meses de historial, la primera confirmed es
// la MÁS ANTIGUA: el cliente que quería anular la cita de mañana cancelaba una
// de hace tres meses, y `tryVoidInvoicesInBackground` anulaba una factura ya
// emitida y declarada. Contabilidad rota por pulsar un botón.
//
// Reglas, en una sola función para que las dos entradas de cancelación
// (recordatorio y «quiero cancelar») no puedan divergir otra vez:
//
//   · Solo de HOY en adelante. Lo pasado no se cancela ni se anula su factura.
//   · Orden cronológico real (fecha Y hora). El `orderBy(date)` a secas dejaba
//     el orden intradía a merced del planner de Postgres.
//
// El filtro vive aquí y no solo en el SQL a propósito: es la garantía que se
// puede testear sin levantar Neon — `engine.ts` importa `@/db`, que abre la
// conexión en el import y no es cargable desde el runner de tests.
// ---------------------------------------------------------------------------

export interface CancellableBooking {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
}

/**
 * Filtra a las citas cancelables (hoy o después) y las devuelve en orden
 * cronológico ascendente. La primera es la más próxima, nunca la más vieja.
 *
 * @param today fecha de hoy en YYYY-MM-DD (`getTodayDate()`), en la zona
 *   horaria de la barbería.
 */
export function selectCancellableBookings<T extends CancellableBooking>(
  rows: readonly T[],
  today: string
): T[] {
  return rows
    .filter((b) => b.date >= today)
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}
