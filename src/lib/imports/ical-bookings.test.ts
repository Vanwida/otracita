import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIcs,
  parseSummary,
  unfoldIcalLines,
  detectCollisions,
  type ExistingBookingSlot,
} from './ical-bookings.ts';

// -----------------------------------------------------------------------------
// Pure unit tests — no DB, no I/O. Verifican:
//   · line unfolding (RFC 5545)
//   · SUMMARY heuristics (cliente—servicio, paréntesis, solo servicio)
//   · parseIcs end-to-end con UTC + Europe/Madrid + all-day + cancelled
//   · detectCollisions: duplicate UID + overlap del mismo día
//   · idempotencia: parse → detect dos veces con los mismos UIDs en el set
// -----------------------------------------------------------------------------

const NOW = new Date('2026-05-22T08:00:00Z'); // Europa/Madrid CEST = +02 → 10:00

// ── Line unfolding ────────────────────────────────────────────────────────────

test('unfoldIcalLines: junta líneas continuadas con espacio', () => {
  const raw = 'SUMMARY:Corte\n con barba\n y afeitado';
  const lines = unfoldIcalLines(raw);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], 'SUMMARY:Cortecon barbay afeitado');
});

test('unfoldIcalLines: CRLF y LF se mezclan sin problema', () => {
  const raw = 'A:1\r\nB:2\nC:3\r';
  const lines = unfoldIcalLines(raw);
  assert.deepEqual(lines, ['A:1', 'B:2', 'C:3', '']);
});

// ── SUMMARY heuristics ────────────────────────────────────────────────────────

test('parseSummary: "Cliente — Servicio" parte por em-dash', () => {
  const r = parseSummary('Carlos García — Corte clásico');
  assert.equal(r.customerName, 'Carlos García');
  assert.equal(r.service, 'Corte clásico');
});

test('parseSummary: "Cliente - Servicio" parte por guion', () => {
  const r = parseSummary('María López - Tinte');
  assert.equal(r.customerName, 'María López');
  assert.equal(r.service, 'Tinte');
});

test('parseSummary: "Servicio (Cliente)" detecta paréntesis', () => {
  const r = parseSummary('Corte clásico (Pedro Sánchez)');
  assert.equal(r.customerName, 'Pedro Sánchez');
  assert.equal(r.service, 'Corte clásico');
});

test('parseSummary: solo servicio → customerName=null', () => {
  const r = parseSummary('Corte');
  assert.equal(r.customerName, null);
  assert.equal(r.service, 'Corte');
});

test('parseSummary: solo nombre persona → service="Importado"', () => {
  const r = parseSummary('Carlos García');
  assert.equal(r.customerName, 'Carlos García');
  assert.equal(r.service, 'Importado');
});

test('parseSummary: vacío → service="Importado" y name=null', () => {
  const r = parseSummary('');
  assert.equal(r.customerName, null);
  assert.equal(r.service, 'Importado');
});

// ── parseIcs ──────────────────────────────────────────────────────────────────

const ICS_BOOKSY_SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Booksy//ES//EN',
  'BEGIN:VEVENT',
  'UID:booksy-evt-001@booksy.com',
  'SUMMARY:Carlos García — Corte clásico',
  'DTSTART:20260523T080000Z',
  'DTEND:20260523T083000Z',
  'DESCRIPTION:Cliente habitual\\, viene los sábados',
  'LOCATION:Barbería Reni',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:booksy-evt-002@booksy.com',
  'SUMMARY:María López - Tinte',
  'DTSTART;TZID=Europe/Madrid:20260524T103000',
  'DTEND;TZID=Europe/Madrid:20260524T120000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:booksy-evt-003@booksy.com',
  'SUMMARY:Corte rápido',
  'DTSTART;VALUE=DATE:20260525',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:booksy-evt-004@booksy.com',
  'SUMMARY:Cancelada',
  'DTSTART:20260523T120000Z',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parseIcs: extrae 2 eventos (skip all-day y cancelled)', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.uid),
    ['booksy-evt-001@booksy.com', 'booksy-evt-002@booksy.com'],
  );
});

test('parseIcs: DTSTART UTC convierte a hora Europe/Madrid', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  const e1 = events[0];
  // 2026-05-23 08:00:00 UTC → 10:00 CEST.
  assert.equal(e1.date, '2026-05-23');
  assert.equal(e1.time, '10:00');
  assert.equal(e1.durationMinutes, 30);
});

test('parseIcs: TZID=Europe/Madrid se interpreta como hora local', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  const e2 = events[1];
  // 2026-05-24 10:30 local → date/time directas.
  assert.equal(e2.date, '2026-05-24');
  assert.equal(e2.time, '10:30');
  assert.equal(e2.durationMinutes, 90);
});

test('parseIcs: SUMMARY se desescapa (comas escapadas)', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  const e1 = events[0];
  assert.equal(e1.notes, 'Cliente habitual, viene los sábados');
  assert.equal(e1.location, 'Barbería Reni');
});

test('parseIcs: parsea customer + service del SUMMARY', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  assert.equal(events[0].customerName, 'Carlos García');
  assert.equal(events[0].service, 'Corte clásico');
  assert.equal(events[1].customerName, 'María López');
  assert.equal(events[1].service, 'Tinte');
});

test('parseIcs: marca isPast=true cuando DTSTART < now', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:past-1@x',
    'SUMMARY:Vieja',
    'DTSTART:20200101T100000Z',
    'DTEND:20200101T103000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const events = parseIcs(ics, NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].isPast, true);
});

test('parseIcs: input vacío o sin VEVENTs devuelve []', () => {
  assert.deepEqual(parseIcs('', NOW), []);
  assert.deepEqual(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR', NOW), []);
});

test('parseIcs: ignora líneas malformadas y sigue', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'CORRUPT LINE NO COLON',
    'BEGIN:VEVENT',
    'UID:ok-1@x',
    'SUMMARY:Buena',
    'DTSTART:20260523T080000Z',
    'DTEND:20260523T083000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const events = parseIcs(ics, NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, 'ok-1@x');
});

// ── detectCollisions ──────────────────────────────────────────────────────────

test('detectCollisions: marca duplicate_uid cuando el UID ya existe', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  const existingUids = new Set(['booksy-evt-001@booksy.com']);
  const collisions = detectCollisions(events, [], existingUids, 30);
  const c = collisions.get('booksy-evt-001@booksy.com');
  assert.ok(c);
  assert.equal(c.reason, 'duplicate_uid');
});

test('detectCollisions: marca overlap cuando hay booking en el mismo rango', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  // Booking existente a las 10:15 (15min después de e1) → overlap.
  const existing: ExistingBookingSlot[] = [
    {
      id: 'b-existing-1',
      date: '2026-05-23',
      time: '10:15',
      duration: 30,
      barberId: 'barber-1',
      status: 'confirmed',
    },
  ];
  const collisions = detectCollisions(events, existing, new Set(), 30);
  const c = collisions.get('booksy-evt-001@booksy.com');
  assert.ok(c);
  assert.equal(c.reason, 'overlap');
  assert.equal(c.conflictingBookingId, 'b-existing-1');
});

test('detectCollisions: ignora bookings cancelled del mismo día', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  const existing: ExistingBookingSlot[] = [
    {
      id: 'b-cancelled',
      date: '2026-05-23',
      time: '10:00',
      duration: 30,
      barberId: 'barber-1',
      status: 'cancelled',
    },
  ];
  const collisions = detectCollisions(events, existing, new Set(), 30);
  assert.equal(collisions.size, 0);
});

test('detectCollisions: idempotencia — UIDs ya importados se marcan en re-import', () => {
  const events = parseIcs(ICS_BOOKSY_SAMPLE, NOW);
  // Primera importación: ningún UID conocido → 0 colisiones.
  const first = detectCollisions(events, [], new Set(), 30);
  assert.equal(first.size, 0);
  // Simular que el caller persistió los UIDs y re-importa.
  const importedUids = new Set(events.map((e) => e.uid));
  const second = detectCollisions(events, [], importedUids, 30);
  assert.equal(second.size, 2);
  for (const c of second.values()) {
    assert.equal(c.reason, 'duplicate_uid');
  }
});

test('detectCollisions: eventos pasados no se evalúan', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:past@x',
    'SUMMARY:Vieja',
    'DTSTART:20200101T100000Z',
    'DTEND:20200101T103000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const events = parseIcs(ics, NOW);
  const collisions = detectCollisions(events, [], new Set(['past@x']), 30);
  // Aunque el UID exista, isPast=true → no entra al map.
  assert.equal(collisions.size, 0);
});
