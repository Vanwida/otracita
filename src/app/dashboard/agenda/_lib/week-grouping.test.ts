import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupEventsByCell,
  UNASSIGNED_BARBER_ID,
  type WeekGroupingBarber,
  type WeekGroupingEvent,
} from './week-grouping.ts';

// -----------------------------------------------------------------------------
// week-grouping — agrupación events→cells de la vista Semana.
//
// Estos tests blindan el contrato de la resolución de barberId que provocó
// el bug "Reni/Johan vacíos + Sin asignar fantasmas". Casos cubiertos:
//
//  · barberId válido (en equipo activo) → matchea ese barbero.
//  · barberId mismatch + name fallback → matchea por nombre.
//  · barberId null + name fallback → matchea por nombre.
//  · barberId mismatch + name mismatch → cae a Sin asignar.
//  · case+whitespace insensitive en el nombre.
//  · 0 barbers en equipo → todos los eventos caen a Sin asignar.
//  · Mismo barbero+día con varios eventos → orden por hora ascendente.
//  · Escenario realista del usuario (alexsole): 2 barbers activos
//    (Reni+Johan) + 16 bookings con barberId válido → 0 unassigned.
// -----------------------------------------------------------------------------

const ev = (
  p: Partial<WeekGroupingEvent> & { date: string; time: string },
): WeekGroupingEvent => ({
  barberId: null,
  barber: null,
  ...p,
});

const RENI: WeekGroupingBarber = {
  id: '7beadf0e-f1b4-48ba-9ca0-b5d5b77ad5ce',
  name: 'Reni',
};
const JOHAN: WeekGroupingBarber = {
  id: '19ad4ad5-fb10-4741-a078-e6f6541f7cfc',
  name: 'Johan',
};

test('barberId válido → matchea ese barbero, no unassigned', () => {
  const r = groupEventsByCell(
    [ev({ barberId: RENI.id, barber: 'Reni', date: '2026-05-22', time: '10:00' })],
    [RENI, JOHAN],
  );
  assert.equal(r.hasUnassigned, false);
  assert.equal(r.eventsByCell.size, 1);
  assert.equal(r.eventsByCell.get(`${RENI.id}|2026-05-22`)?.length, 1);
});

test('barberId apunta a barbero NO activo + name fallback rescata por nombre', () => {
  const r = groupEventsByCell(
    [
      ev({
        barberId: 'OLD_DELETED_UUID',
        barber: 'Reni',
        date: '2026-05-22',
        time: '10:00',
      }),
    ],
    [RENI, JOHAN],
  );
  assert.equal(r.hasUnassigned, false, 'name fallback debe rescatar');
  assert.equal(r.eventsByCell.get(`${RENI.id}|2026-05-22`)?.length, 1);
});

test('barberId null + name fallback resuelve a barbero activo', () => {
  const r = groupEventsByCell(
    [ev({ barberId: null, barber: 'Johan', date: '2026-05-22', time: '11:00' })],
    [RENI, JOHAN],
  );
  assert.equal(r.hasUnassigned, false);
  assert.equal(r.eventsByCell.get(`${JOHAN.id}|2026-05-22`)?.length, 1);
});

test('barberId+name ambos huérfanos → swimlane Sin asignar', () => {
  const r = groupEventsByCell(
    [
      ev({
        barberId: 'GHOST',
        barber: 'BarberoFantasma',
        date: '2026-05-22',
        time: '10:00',
      }),
    ],
    [RENI, JOHAN],
  );
  assert.equal(r.hasUnassigned, true);
  assert.equal(
    r.eventsByCell.get(`${UNASSIGNED_BARBER_ID}|2026-05-22`)?.length,
    1,
  );
});

test('name lookup case-insensitive + trim', () => {
  const r = groupEventsByCell(
    [
      ev({ barberId: null, barber: '  RENI  ', date: '2026-05-22', time: '10:00' }),
      ev({ barberId: null, barber: 'johan', date: '2026-05-22', time: '11:00' }),
    ],
    [RENI, JOHAN],
  );
  assert.equal(r.hasUnassigned, false);
  assert.equal(r.eventsByCell.get(`${RENI.id}|2026-05-22`)?.length, 1);
  assert.equal(r.eventsByCell.get(`${JOHAN.id}|2026-05-22`)?.length, 1);
});

test('barbers vacío → todos los eventos caen a Sin asignar', () => {
  const r = groupEventsByCell(
    [
      ev({ barberId: RENI.id, barber: 'Reni', date: '2026-05-22', time: '10:00' }),
      ev({ barberId: JOHAN.id, barber: 'Johan', date: '2026-05-22', time: '11:00' }),
    ],
    [],
  );
  assert.equal(r.hasUnassigned, true);
  assert.equal(
    r.eventsByCell.get(`${UNASSIGNED_BARBER_ID}|2026-05-22`)?.length,
    2,
  );
});

test('múltiples eventos mismo barbero+día → ordenados por hora ascendente', () => {
  const r = groupEventsByCell(
    [
      ev({ barberId: RENI.id, barber: 'Reni', date: '2026-05-22', time: '15:00' }),
      ev({ barberId: RENI.id, barber: 'Reni', date: '2026-05-22', time: '09:30' }),
      ev({ barberId: RENI.id, barber: 'Reni', date: '2026-05-22', time: '12:00' }),
    ],
    [RENI],
  );
  const list = r.eventsByCell.get(`${RENI.id}|2026-05-22`)!;
  assert.deepEqual(list.map((e) => e.time), ['09:30', '12:00', '15:00']);
});

test('escenario realista alexsole: 2 barbers activos + 16 bookings válidos → 0 unassigned', () => {
  // Datos calcados del bug reportado el 2026-05-24 — Reni 7 bookings,
  // Johan 9 bookings, todos con barberId válido apuntando al equipo activo.
  // El test FALLARÍA si la lógica volviera a meter estos eventos en
  // "Sin asignar".
  const reniDates = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-22', '2026-05-23'];
  const johanDates = ['2026-05-20', '2026-05-22', '2026-05-23'];
  const events: WeekGroupingEvent[] = [
    ...reniDates.map((d, i) =>
      ev({ barberId: RENI.id, barber: 'Reni', date: d, time: `1${i}:00` }),
    ),
    ...Array.from({ length: 2 }).map((_, i) =>
      ev({ barberId: RENI.id, barber: 'Reni', date: '2026-05-23', time: `1${i + 5}:00` }),
    ),
    ...johanDates.map((d, i) =>
      ev({ barberId: JOHAN.id, barber: 'Johan', date: d, time: `0${i + 9}:00` }),
    ),
    ...Array.from({ length: 6 }).map((_, i) =>
      ev({ barberId: JOHAN.id, barber: 'Johan', date: '2026-05-22', time: `1${i}:30` }),
    ),
  ];
  const r = groupEventsByCell(events, [RENI, JOHAN]);
  assert.equal(r.hasUnassigned, false, 'NINGÚN evento debe ir a Sin asignar');
  // Sanity: hay celdas para Reni y para Johan.
  const reniCells = [...r.eventsByCell.keys()].filter((k) => k.startsWith(`${RENI.id}|`));
  const johanCells = [...r.eventsByCell.keys()].filter((k) => k.startsWith(`${JOHAN.id}|`));
  assert.ok(reniCells.length > 0, 'Reni debe tener celdas');
  assert.ok(johanCells.length > 0, 'Johan debe tener celdas');
  const unassignedCells = [...r.eventsByCell.keys()].filter((k) =>
    k.startsWith(`${UNASSIGNED_BARBER_ID}|`),
  );
  assert.equal(unassignedCells.length, 0, 'NO debe haber celdas Sin asignar');
});
