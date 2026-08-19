import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCancellableBookings } from './cancellable.ts';

// -----------------------------------------------------------------------------
// Regresión L-10: el botón «❌ Cancelar» del recordatorio hacía
//   status = 'confirmed' → orderBy(date) → limit(1)
// sin filtro de fecha. En una barbería con historial, esa fila es la cita MÁS
// ANTIGUA: se cancelaba una cita de hace meses y se anulaba su factura ya
// emitida, mientras la de mañana seguía viva.
//
// `selectCancellableBookings` es la puerta que decide qué citas son
// cancelables. Se testea aislada porque `engine.ts` importa `@/db`, que abre
// la conexión Neon en el import y no es cargable desde el runner.
// -----------------------------------------------------------------------------

const TODAY = '2026-08-19';

// Cita vieja ya facturada (la que el bug cancelaba) + la de mañana (la que el
// cliente quería anular al pulsar el botón del recordatorio).
const facturada = { id: 'vieja', date: '2026-05-02', time: '10:00' };
const manana = { id: 'manana', date: '2026-08-20', time: '17:30' };

test('recordatorio: la cita vieja facturada no es cancelable, la de mañana sí', () => {
  const result = selectCancellableBookings([facturada, manana], TODAY);
  assert.deepEqual(result.map((b) => b.id), ['manana']);
});

test('la primera cancelable es la más próxima, no la más antigua', () => {
  // El orden de entrada es el que devolvía Postgres sin ORDER BY estable.
  const rows = [
    { id: 'lejana', date: '2026-09-30', time: '09:00' },
    facturada,
    manana,
    { id: 'hoy_tarde', date: TODAY, time: '19:00' },
    { id: 'hoy_manana', date: TODAY, time: '09:15' },
  ];
  const result = selectCancellableBookings(rows, TODAY);
  assert.deepEqual(result.map((b) => b.id), ['hoy_manana', 'hoy_tarde', 'manana', 'lejana']);
});

test('las citas de hoy siguen siendo cancelables (el corte es la fecha, no la hora)', () => {
  const hoy = { id: 'hoy', date: TODAY, time: '08:00' };
  assert.deepEqual(selectCancellableBookings([hoy], TODAY).map((b) => b.id), ['hoy']);
});

test('solo historial pasado → lista vacía: el bot debe decir que no hay cita', () => {
  const pasado = [
    facturada,
    { id: 'ayer', date: '2026-08-18', time: '20:00' },
  ];
  assert.deepEqual(selectCancellableBookings(pasado, TODAY), []);
  // Sin cita seleccionable no hay nada que cancelar → ninguna factura se anula.
});

test('sin citas → lista vacía', () => {
  assert.deepEqual(selectCancellableBookings([], TODAY), []);
});

test('no muta ni reordena el array de entrada', () => {
  // `.sort()` in-place sobre el resultado de la query es un pie de bala si
  // alguien reutiliza la lista original más abajo.
  const rows = [manana, facturada];
  const snapshot = [...rows];
  selectCancellableBookings(rows, TODAY);
  assert.deepEqual(rows, snapshot);
});

test('el orden intradía se decide por hora, no por el planner de Postgres', () => {
  const rows = [
    { id: 'tarde', date: '2026-08-25', time: '18:45' },
    { id: 'temprano', date: '2026-08-25', time: '09:00' },
    { id: 'mediodia', date: '2026-08-25', time: '13:30' },
  ];
  const result = selectCancellableBookings(rows, TODAY);
  assert.deepEqual(result.map((b) => b.id), ['temprano', 'mediodia', 'tarde']);
});
