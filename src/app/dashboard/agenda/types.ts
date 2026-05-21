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
  /** F3 Reni — override manual del origen al cerrar la cita. Null si el
   *  barbero aún no marcó (queda la atribución pasiva en reporting).
   *  Mismo enum cerrado que `ManualSource` en src/lib/attribution/source-manual.ts. */
  sourceManual: string | null;
}

/** Barbero del equipo — shape compartido por la cabecera de columna, el
 *  selector de NewBookingPanel y el resolver de color por displayOrder. */
export interface Barber {
  id: string;
  name: string;
  photoUrl: string | null;
  displayOrder: number;
}

/** Franja bloqueada del barbero (`barber_blocks` row). Cubre dos casos:
 *   · `kind='block'`     → descanso/comida/reunión — `startTime`/`endTime`
 *     definidos (ej. 14:00–15:00). El barbero NO acepta citas en esa franja.
 *   · `kind='absence'`   → día libre — `startTime`/`endTime` pueden ser
 *     null (día completo) o un rango (ausencia parcial, ej. "media tarde").
 *
 *  Lo carga la API `/api/dashboard/calendar` junto con `events`. La agenda
 *  los pinta como overlays diagonales sobre la columna del barbero en el
 *  rango horario indicado. No bloquean drag&drop por sí solos — el motor
 *  de disponibilidad (`availability.ts`) los respeta server-side cuando se
 *  intenta crear/mover una cita.
 */
export interface CalendarBlock {
  id: string;
  barberId: string;
  /** YYYY-MM-DD (Europe/Madrid). */
  date: string;
  /** HH:MM o null = todo el día. */
  startTime: string | null;
  /** HH:MM o null = todo el día. */
  endTime: string | null;
  kind: 'block' | 'absence';
  reason: string | null;
  note: string | null;
}

/** Intención emitida al elegir una opción del menú contextual de slot
 *  (SlotActionMenu). NUEVA CITA la maneja CalendarView directamente; las
 *  otras dos se delegan a callbacks stub (WS-B es dueño de esos paneles). */
export type SlotAction =
  | { type: 'new_booking'; date: string; time: string; barberId: string | null }
  | { type: 'unavailability'; date: string; time: string; barberId: string | null }
  | { type: 'absence'; date: string; time: string; barberId: string | null };

/** Glifo corto del método de cobro para el badge R6 (display-only — la
 *  CAPTURA del método la hace WS-D al completar la cita). null → sin
 *  badge (aún no cobrada / tenant sin caja). Mapeo Booksy:
 *    cash → "€" (efectivo) · card → "card" (datáfono) · online → "B"
 *    (Bizum / pago online vía Stripe). */
export function paymentBadge(
  method: string | null,
): { glyph: string; label: string } | null {
  switch (method) {
    case 'cash':
      return { glyph: '€', label: 'Cobrado en efectivo' };
    case 'card':
      return { glyph: 'card', label: 'Cobrado con tarjeta' };
    case 'online':
      return { glyph: 'B', label: 'Cobrado online (Bizum/tarjeta)' };
    default:
      return null;
  }
}

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
