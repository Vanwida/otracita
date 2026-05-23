// -----------------------------------------------------------------------------
// week-grouping — agrupa events por (barberId, date) para la matriz Semana.
//
// Lo extrajimos de WeekGrid para poder TESTEARLO en aislado: un bug reciente
// en la vista Semana ("Reni/Johan vacíos + filas 'Sin asignar' separadas")
// dejó claro que esta resolución de cell-key es el punto crítico de la vista
// y conviene blindarla con tests unitarios.
//
// Contrato:
//
//   · Cada evento se asigna a UNA cell key con forma `${barberId}|${date}`.
//   · Resolución del barberId (en este ORDEN):
//        1. `ev.barberId` si está set Y existe en `barbers` (id activo).
//        2. Si no, lookup por NAME normalizado (trim+lowercase) contra
//           `barbers`. Cubre legacy rows sin barberId, y citas cuyo
//           barberId apunta a un barbero borrado pero el snapshot del
//           nombre todavía matchea uno activo.
//        3. Si nada matchea → cell key con `UNASSIGNED_BARBER_ID`.
//   · Las listas se devuelven ORDENADAS por hora ascendente (HH:MM).
//   · `hasUnassigned` indica si alguna cita cayó en la swimlane "Sin asignar".
//
// Este módulo es PURO: sin React, sin DOM, sin I/O.
// -----------------------------------------------------------------------------

/** ID interno reservado para la swimlane "Sin asignar". NUNCA puede colisionar
 *  con un UUID real (los IDs de `barbers` son uuid v4). El consumidor renderiza
 *  una fila especial cuando `hasUnassigned === true`. */
export const UNASSIGNED_BARBER_ID = '__unassigned__';

/** Shape mínimo de un evento — sólo lo que la agrupación necesita. Mantenido
 *  estructural (no importa el resto de campos del CalendarEvent real). */
export interface WeekGroupingEvent {
  barberId: string | null;
  barber: string | null;
  date: string;
  time: string;
}

/** Shape mínimo de un barbero — sólo id+name. */
export interface WeekGroupingBarber {
  id: string;
  name: string;
}

export interface WeekGroupingResult<T> {
  /** Map indexado por `${barberId}|${date}` o `${UNASSIGNED_BARBER_ID}|${date}`.
   *  Cada valor es un array ordenado por hora ascendente. */
  eventsByCell: Map<string, T[]>;
  /** true si al menos un evento cayó en la swimlane "Sin asignar". */
  hasUnassigned: boolean;
}

/** Convierte "HH:MM" → minutos desde medianoche (para sort). */
function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Indexa eventos por (barberId, date) resolviendo barberId contra el equipo
 * activo. Ver el contrato arriba.
 */
export function groupEventsByCell<T extends WeekGroupingEvent>(
  events: ReadonlyArray<T>,
  barbers: ReadonlyArray<WeekGroupingBarber>,
): WeekGroupingResult<T> {
  const map = new Map<string, T[]>();
  const activeBarberIds = new Set<string>();
  const nameToId = new Map<string, string>();
  for (const b of barbers) {
    activeBarberIds.add(b.id);
    nameToId.set(b.name.trim().toLowerCase(), b.id);
  }
  let unassignedCount = 0;
  for (const ev of events) {
    let resolved: string | null = null;
    if (ev.barberId && activeBarberIds.has(ev.barberId)) {
      resolved = ev.barberId;
    } else if (ev.barber) {
      resolved = nameToId.get(ev.barber.trim().toLowerCase()) ?? null;
    }
    const key = resolved
      ? `${resolved}|${ev.date}`
      : `${UNASSIGNED_BARBER_ID}|${ev.date}`;
    if (!resolved) unassignedCount += 1;
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }
  return { eventsByCell: map, hasUnassigned: unassignedCount > 0 };
}
