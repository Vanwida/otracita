import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekCell } from './week-cell.ts';

// -----------------------------------------------------------------------------
// week-cell — helper de la vista Semana (matriz barberos × días).
//
// Verifica el contrato:
//  · 0 citas         → 0 visibles, 0 overflow
//  · ≤ maxVisible    → todas visibles, 0 overflow
//  · > maxVisible    → primeras N visibles, resto en overflow
//  · maxVisible < 1  → se fuerza a 1 (defensa)
//  · orden preservado (la lista entra ya ordenada por hora)
// -----------------------------------------------------------------------------

interface FakeBooking {
  id: string;
  time: string;
  duration: number;
}

const b = (id: string, time: string, duration = 30): FakeBooking => ({
  id,
  time,
  duration,
});

test('0 citas → vacío y 0 overflow', () => {
  const r = buildWeekCell<FakeBooking>([], 6);
  assert.deepEqual(r.visible, []);
  assert.equal(r.overflowCount, 0);
});

test('3 citas con maxVisible=6 → todas visibles, 0 overflow', () => {
  const data = [b('a', '10:00'), b('b', '11:00'), b('c', '12:00')];
  const r = buildWeekCell(data, 6);
  assert.equal(r.visible.length, 3);
  assert.deepEqual(
    r.visible.map((x) => x.id),
    ['a', 'b', 'c'],
  );
  assert.equal(r.overflowCount, 0);
});

test('5 citas con maxVisible=5 → todas visibles (borde exacto), 0 overflow', () => {
  const data = [
    b('a', '10:00'),
    b('b', '11:00'),
    b('c', '12:00'),
    b('d', '13:00'),
    b('e', '14:00'),
  ];
  const r = buildWeekCell(data, 5);
  assert.equal(r.visible.length, 5);
  assert.equal(r.overflowCount, 0);
});

test('9 citas con maxVisible=5 → 5 visibles + 4 overflow, orden preservado', () => {
  const data = [
    b('a', '09:00'),
    b('b', '10:00'),
    b('c', '11:00'),
    b('d', '12:00'),
    b('e', '13:00'),
    b('f', '14:00'),
    b('g', '15:00'),
    b('h', '16:00'),
    b('i', '17:00'),
  ];
  const r = buildWeekCell(data, 5);
  assert.deepEqual(
    r.visible.map((x) => x.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
  assert.equal(r.overflowCount, 4);
});

test('12 citas con maxVisible=6 → 6 visibles + 6 overflow', () => {
  const data = Array.from({ length: 12 }, (_, i) =>
    b(`x${i}`, `${String(8 + i).padStart(2, '0')}:00`),
  );
  const r = buildWeekCell(data, 6);
  assert.equal(r.visible.length, 6);
  assert.equal(r.overflowCount, 6);
  // orden original
  assert.deepEqual(
    r.visible.map((x) => x.id),
    ['x0', 'x1', 'x2', 'x3', 'x4', 'x5'],
  );
});

test('maxVisible=0 → se fuerza a 1 (defensa, evita "0 visibles + N overflow")', () => {
  const data = [b('a', '10:00'), b('b', '11:00'), b('c', '12:00')];
  const r = buildWeekCell(data, 0);
  assert.equal(r.visible.length, 1);
  assert.equal(r.overflowCount, 2);
  assert.equal(r.visible[0]?.id, 'a');
});
