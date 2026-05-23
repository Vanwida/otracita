import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOverlapLayout } from './_event-layout.ts';

// -----------------------------------------------------------------------------
// Lane layout (overlap rendering) — bug #58 3ª iteración (2026-05-23).
//
// El bug visible: dos citas del MISMO día que se SOLAPAN EN TIEMPO en la
// vista Semana se renderizaban con el mismo `left/right` (todo el ancho de
// la columna), una encima de la otra. El usuario no distinguía dónde
// terminaba una y empezaba la siguiente.
//
// Fix: usar `computeOverlapLayout` (ya en uso por DayGrid) también en
// WeekGrid. El helper es puro, sin React/DOM/I-O — testeable aquí mismo
// con node:test sin tooling extra.
//
// Convenciones del helper:
// · Solape estricto: A∩B ⇔ A.start < B.end && B.start < A.end. Si A
//   termina exactamente cuando B empieza (boundary), NO solapan.
// · Greedy: A0 toma la primera columna libre; un evento posterior reutiliza
//   la columna del que ya terminó. Patrón Google Calendar / Booksy / Fresha.
// · widthPct = 100 / totalCarriles del cluster. leftPct = carril × widthPct.
// -----------------------------------------------------------------------------

const min = (h: number, m: number) => h * 60 + m;

test('three sequential events (no overlap) → all full width', () => {
  const r = computeOverlapLayout([
    { id: 'a', startMin: min(10, 0), durationMin: 30 }, // 10:00-10:30
    { id: 'b', startMin: min(10, 30), durationMin: 30 }, // 10:30-11:00 (boundary)
    { id: 'c', startMin: min(11, 0), durationMin: 30 }, // 11:00-11:30
  ]);
  assert.deepEqual(r.get('a'), { leftPct: 0, widthPct: 100 });
  assert.deepEqual(r.get('b'), { leftPct: 0, widthPct: 100 });
  assert.deepEqual(r.get('c'), { leftPct: 0, widthPct: 100 });
});

test('two overlap, third standalone → first two share lanes, third full width', () => {
  const r = computeOverlapLayout([
    { id: 'a', startMin: min(10, 0), durationMin: 30 }, // 10:00-10:30
    { id: 'b', startMin: min(10, 15), durationMin: 30 }, // 10:15-10:45 (∩ A)
    { id: 'c', startMin: min(11, 0), durationMin: 30 }, // 11:00-11:30 (libre)
  ]);
  assert.deepEqual(r.get('a'), { leftPct: 0, widthPct: 50 });
  assert.deepEqual(r.get('b'), { leftPct: 50, widthPct: 50 });
  assert.deepEqual(r.get('c'), { leftPct: 0, widthPct: 100 });
});

test('triple overlap chain (screenshot Tuesday 12:05/12:25) → 2 lanes, third reuses A lane', () => {
  // Reni 2026-05-23: martes 12:05 sdad (30min) + 12:25 alex (30min).
  // Ampliamos a tres para validar el greedy: la tercera reutiliza el carril
  // de la primera cuando A ya ha terminado.
  const r = computeOverlapLayout([
    { id: 'a', startMin: min(12, 5), durationMin: 30 }, // 12:05-12:35
    { id: 'b', startMin: min(12, 25), durationMin: 30 }, // 12:25-12:55 (∩ A)
    { id: 'c', startMin: min(12, 35), durationMin: 30 }, // 12:35-13:05 (∩ B, boundary A)
  ]);
  assert.deepEqual(r.get('a'), { leftPct: 0, widthPct: 50 });
  assert.deepEqual(r.get('b'), { leftPct: 50, widthPct: 50 });
  // C empieza cuando A termina exactamente → reusa carril 0 (greedy).
  assert.deepEqual(r.get('c'), { leftPct: 0, widthPct: 50 });
});

test('back-to-back boundary chain (15:10/15:50/16:25 touching but not overlapping) → all single lane', () => {
  const r = computeOverlapLayout([
    { id: 'a', startMin: min(15, 10), durationMin: 40 }, // 15:10-15:50
    { id: 'b', startMin: min(15, 50), durationMin: 35 }, // 15:50-16:25 (boundary)
    { id: 'c', startMin: min(16, 25), durationMin: 30 }, // 16:25-16:55 (boundary)
  ]);
  assert.deepEqual(r.get('a'), { leftPct: 0, widthPct: 100 });
  assert.deepEqual(r.get('b'), { leftPct: 0, widthPct: 100 });
  assert.deepEqual(r.get('c'), { leftPct: 0, widthPct: 100 });
});

test('screenshot Thursday cluster (15:10/15:50/16:25 overlapping) → 2 lanes via transitive grouping', () => {
  // El cluster real del jueves: A∩B, B∩C, pero A∩C=∅. Aun así el cluster
  // es transitivo {A,B,C} y el greedy da: A→0, B→1, C reutiliza 0 (A ya
  // terminó a las 16:00 < 16:25 = inicio de C).
  const r = computeOverlapLayout([
    { id: 'a', startMin: min(15, 10), durationMin: 50 }, // 15:10-16:00
    { id: 'b', startMin: min(15, 50), durationMin: 40 }, // 15:50-16:30 (∩ A)
    { id: 'c', startMin: min(16, 25), durationMin: 35 }, // 16:25-17:00 (∩ B)
  ]);
  assert.deepEqual(r.get('a'), { leftPct: 0, widthPct: 50 });
  assert.deepEqual(r.get('b'), { leftPct: 50, widthPct: 50 });
  assert.deepEqual(r.get('c'), { leftPct: 0, widthPct: 50 });
});

test('empty input → empty map (defensive)', () => {
  const r = computeOverlapLayout([]);
  assert.equal(r.size, 0);
});

test('tiebreaker — same start, longer duration takes lane 0 (longer = visual spine)', () => {
  const r = computeOverlapLayout([
    { id: 'short', startMin: min(10, 0), durationMin: 15 },
    { id: 'long', startMin: min(10, 0), durationMin: 60 },
  ]);
  // Tras el sort (duration desc cuando empata start), `long` va primero
  // y se queda con el carril 0; `short` cae al 1.
  assert.deepEqual(r.get('long'), { leftPct: 0, widthPct: 50 });
  assert.deepEqual(r.get('short'), { leftPct: 50, widthPct: 50 });
});
