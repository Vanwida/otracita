export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  /** Snapshot barber NAME (survives renames). Display fallback. */
  barber: string | null;
  /** Canonical barbers.id — used to map an event to its color column and
   *  to drag&drop / reassign without ambiguity when two barbers share a
   *  name. Null for legacy rows or "any" assignments. */
  barberId: string | null;
  source: string;
  status: string;
  customerPhone: string;
  customerName: string | null;
  price: number | null;
  service: string;
  /** Método de cobro registrado al completar (cash/card/online). Null si
   *  aún no se cobró o el tenant no tiene caja activa. Pinta el badge R6
   *  (display-only — la captura la hace WS-D). */
  paymentMethod: string | null;
  /** true si el cliente pidió EXPLÍCITAMENTE a este barbero al reservar
   *  (vs auto-asignado por el resolver). Pinta el ♥ A2. */
  barberRequested: boolean;
}

/** Barbero del equipo — shape compartido por la cabecera de columna, el
 *  selector de NewBookingPanel y el resolver de color por displayOrder. */
export interface Barber {
  id: string;
  name: string;
  photoUrl: string | null;
  displayOrder: number;
}

/** Intención emitida al elegir una opción del menú contextual de slot
 *  (SlotActionMenu). NUEVA CITA la maneja CalendarView directamente; las
 *  otras dos se delegan a callbacks stub (WS-B es dueño de esos paneles). */
export type SlotAction =
  | { type: 'new_booking'; date: string; time: string; barberId: string | null }
  | { type: 'unavailability'; date: string; time: string; barberId: string | null }
  | { type: 'absence'; date: string; time: string; barberId: string | null };

/** Número de colores en la paleta de barbero (--color-barber-0..7).
 *  Mantener en sync con globals.css @theme. */
export const BARBER_PALETTE_SIZE = 8;

/** Color determinista de un barbero a partir de su displayOrder. NO hay
 *  columna color en la tabla — añadir/reordenar equipo nunca necesita
 *  migración. Devuelve la CSS var lista para usar inline o en arbitrary
 *  Tailwind values. */
export function barberColorVar(displayOrder: number): string {
  const idx = ((displayOrder % BARBER_PALETTE_SIZE) + BARBER_PALETTE_SIZE) % BARBER_PALETTE_SIZE;
  return `var(--color-barber-${idx})`;
}
