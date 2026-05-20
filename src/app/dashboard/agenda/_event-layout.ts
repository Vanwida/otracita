// -----------------------------------------------------------------------------
// Layout de carriles para citas solapadas — patrón Google Calendar / Booksy /
// FullCalendar. Cuando dos citas comparten cualquier rango de minutos, se
// pintan lado a lado a anchura reducida (no apiladas, no rechazadas).
//
// Algoritmo:
//   1. Ordenar por hora de inicio (en empate, duración descendente — la cita
//      más larga toma el carril 0 para que el ojo siga la "espina" del día).
//   2. Agrupar: una cita extiende el grupo si empieza antes del endMax actual.
//   3. Dentro de cada grupo, asignar a cada cita el PRIMER carril cuyo último
//      ocupante ya ha terminado. Si no hay, abrir uno nuevo.
//   4. widthPct = 100 / totalCarriles ; leftPct = carril × widthPct.
//
// Puro (sin React, sin DOM, sin I/O) — la rejilla traduce {leftPct,widthPct}
// a left/width en `calc()` con un pequeño inset px para el aire visual.
// -----------------------------------------------------------------------------

interface LayoutItem {
  id: string;
  startMin: number;
  durationMin: number;
}

export interface EventLayout {
  leftPct: number;
  widthPct: number;
}

export function computeOverlapLayout(
  items: ReadonlyArray<LayoutItem>,
): Map<string, EventLayout> {
  const result = new Map<string, EventLayout>();
  if (items.length === 0) return result;

  const sorted = [...items].sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    return b.durationMin - a.durationMin;
  });

  // Agrupar por solape transitivo (A∩B y B∩C ⇒ A,B,C mismo grupo aunque A∩C=∅).
  type Group = { items: LayoutItem[]; endMax: number };
  const groups: Group[] = [];
  for (const it of sorted) {
    const end = it.startMin + it.durationMin;
    const last = groups[groups.length - 1];
    if (!last || last.endMax <= it.startMin) {
      groups.push({ items: [it], endMax: end });
    } else {
      last.items.push(it);
      last.endMax = Math.max(last.endMax, end);
    }
  }

  for (const group of groups) {
    if (group.items.length === 1) {
      result.set(group.items[0].id, { leftPct: 0, widthPct: 100 });
      continue;
    }
    const laneEnds: number[] = [];
    const itemLane = new Map<string, number>();
    for (const it of group.items) {
      const end = it.startMin + it.durationMin;
      let lane = laneEnds.findIndex((e) => e <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      itemLane.set(it.id, lane);
    }
    const total = laneEnds.length;
    const widthPct = 100 / total;
    for (const it of group.items) {
      result.set(it.id, {
        leftPct: itemLane.get(it.id)! * widthPct,
        widthPct,
      });
    }
  }

  return result;
}
