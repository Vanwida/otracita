import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fiscalQuarter,
  fiscalYear,
  currentQuarter,
  parseFiscalPeriodKey,
  fiscalPeriodOptions,
} from './period.ts';

test('fiscalQuarter Q1', () => {
  const p = fiscalQuarter(2026, 1);
  assert.equal(p.startIso, '2026-01-01');
  assert.equal(p.endExclusiveIso, '2026-04-01');
  assert.equal(p.key, '2026-Q1');
  assert.equal(p.label, 'Q1 2026');
});

test('fiscalQuarter Q4 cruza año', () => {
  const p = fiscalQuarter(2026, 4);
  assert.equal(p.startIso, '2026-10-01');
  assert.equal(p.endExclusiveIso, '2027-01-01');
});

test('fiscalYear', () => {
  const p = fiscalYear(2026);
  assert.equal(p.startIso, '2026-01-01');
  assert.equal(p.endExclusiveIso, '2027-01-01');
  assert.equal(p.key, '2026');
});

test('currentQuarter — mayo cae en Q2', () => {
  const c = currentQuarter(new Date(2026, 4, 15));
  assert.equal(c.quarter, 2);
  assert.equal(c.year, 2026);
});

test('currentQuarter — diciembre cae en Q4', () => {
  const c = currentQuarter(new Date(2026, 11, 31));
  assert.equal(c.quarter, 4);
});

test('parseFiscalPeriodKey trimestre válido', () => {
  const p = parseFiscalPeriodKey('2025-Q3');
  assert.equal(p.kind, 'quarter');
  assert.equal(p.quarter, 3);
  assert.equal(p.year, 2025);
});

test('parseFiscalPeriodKey año válido', () => {
  const p = parseFiscalPeriodKey('2024');
  assert.equal(p.kind, 'year');
  assert.equal(p.year, 2024);
});

test('parseFiscalPeriodKey null → trimestre actual', () => {
  const p = parseFiscalPeriodKey(null, new Date(2026, 4, 15));
  assert.equal(p.kind, 'quarter');
  assert.equal(p.quarter, 2);
  assert.equal(p.year, 2026);
});

test('parseFiscalPeriodKey inválido → trimestre actual', () => {
  const p = parseFiscalPeriodKey('garbage', new Date(2026, 0, 1));
  assert.equal(p.kind, 'quarter');
  assert.equal(p.quarter, 1);
});

test('fiscalPeriodOptions incluye año actual + anterior', () => {
  const opts = fiscalPeriodOptions(new Date(2026, 4, 15));
  // 2 años × (1 año + 4 trimestres) = 10 opciones
  assert.equal(opts.length, 10);
  assert.equal(opts[0].key, '2026');
  assert.equal(opts[1].key, '2026-Q1');
  assert.equal(opts[5].key, '2025');
});
