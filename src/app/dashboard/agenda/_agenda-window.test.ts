import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAgendaWindow, PX_PER_MIN } from './_agenda-window.ts';

// Lunes 2026-05-25 (la fecha del bug reportado). hoursForDate resuelve el
// día de la semana, así que usamos claves reales.
const MON = '2026-05-25';

test('shop opens 07:00 → 07:00 visible with an hour of air above (the bug)', () => {
  const w = computeAgendaWindow({
    dates: [MON],
    hours: { monday: '07:00-20:00' },
    events: [],
  });
  // 07:00 − 60min pad = 06:00; nunca recorta las 07:00.
  assert.equal(w.startMin, 6 * 60);
  // 20:00 + 60min pad = 21:00.
  assert.equal(w.endMin, 21 * 60);
  assert.equal(w.totalHeight, (21 * 60 - 6 * 60) * PX_PER_MIN);
  // 07:00 cae DENTRO del rango (no clipado).
  assert.ok(7 * 60 >= w.startMin && 7 * 60 <= w.endMin);
});

test('event outside business hours extends the window (never clip an event)', () => {
  const w = computeAgendaWindow({
    dates: [MON],
    hours: { monday: '10:00-18:00' },
    // Cita a las 21:30, dura 45min → fin 22:15.
    events: [{ date: MON, time: '21:30', duration: 45 }],
  });
  assert.equal(w.startMin, 9 * 60); // 10:00 − 60
  // max(18:00, 22:15) + 60 = 23:15 → ceil hora = 24:00? no: 23:15→24:00.
  assert.equal(w.endMin, 24 * 60);
});

test('closed day with no events falls back to a typical workday', () => {
  const w = computeAgendaWindow({
    dates: [MON],
    hours: { monday: 'Cerrado' },
    events: [],
  });
  assert.equal(w.startMin, 8 * 60);
  assert.equal(w.endMin, 22 * 60);
});

test('clamps to [00:00, 24:00] — early open near midnight', () => {
  const w = computeAgendaWindow({
    dates: [MON],
    hours: { monday: '00:30-23:30' },
    events: [],
  });
  assert.equal(w.startMin, 0); // 00:30 − 60 → clamp 0
  assert.equal(w.endMin, 24 * 60); // 23:30 + 60 → clamp 1440
});

test('hour labels span the whole range inclusive', () => {
  const w = computeAgendaWindow({
    dates: [MON],
    hours: { monday: '09:00-17:00' },
    events: [],
  });
  // 08:00 .. 18:00 inclusive = 11 etiquetas.
  assert.equal(w.startMin, 8 * 60);
  assert.equal(w.endMin, 18 * 60);
  assert.equal(w.hourLabels.length, 11);
  assert.equal(w.hourLabels[0].label, '08:00');
  assert.equal(w.hourLabels[w.hourLabels.length - 1].label, '18:00');
  assert.equal(w.hourLabels[0].top, 0);
});

test('week view unions hours across the 7 visible dates', () => {
  // Sábado abre antes (08:00), resto 10:00; algún día cierra a 21:00.
  const w = computeAgendaWindow({
    dates: [
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
    ],
    hours: {
      monday: '10:00-20:00',
      saturday: '08:00-21:00',
      sunday: 'Cerrado',
    },
    events: [],
  });
  assert.equal(w.startMin, 7 * 60); // min(10:00, 08:00) − 60 = 07:00
  assert.equal(w.endMin, 22 * 60); // max(20:00, 21:00) + 60 = 22:00
});
