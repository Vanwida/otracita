import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChargeBody } from './charge-validation.ts';
import type { ChargeRequestBody } from './charge-contract.ts';

const BOOKING_TOTAL = 2500;

function baseBody(overrides: Partial<ChargeRequestBody> = {}): ChargeRequestBody {
  return {
    payments: [{ method: 'cash', amountCents: 2500 }],
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Happy paths
// -----------------------------------------------------------------------------
test('válido: 1 pago cash que cuadra con el total', () => {
  assert.equal(validateChargeBody(baseBody(), BOOKING_TOTAL), null);
});

test('válido: split cash + card_physical + bizum cuadra al total', () => {
  const body = baseBody({
    payments: [
      { method: 'cash', amountCents: 1000 },
      { method: 'card_physical', amountCents: 1000 },
      { method: 'bizum', amountCents: 500 },
    ],
  });
  assert.equal(validateChargeBody(body, BOOKING_TOTAL), null);
});

test('válido: 1 tramo card_online que cuadra al total', () => {
  const body = baseBody({
    payments: [{ method: 'card_online', amountCents: 2500 }],
  });
  assert.equal(validateChargeBody(body, BOOKING_TOTAL), null);
});

test('válido: tip junto al cobro', () => {
  const body = baseBody({
    tip: { amountCents: 200, method: 'cash', barberId: 'uuid-1' },
  });
  assert.equal(validateChargeBody(body, BOOKING_TOTAL), null);
});

// -----------------------------------------------------------------------------
// sum_mismatch
// -----------------------------------------------------------------------------
test('sum > total → sum_mismatch', () => {
  const body = baseBody({
    payments: [{ method: 'cash', amountCents: 3000 }],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'sum_mismatch');
});

test('sum < total (split parcial) → sum_mismatch', () => {
  const body = baseBody({
    payments: [
      { method: 'cash', amountCents: 1000 },
      { method: 'bizum', amountCents: 500 },
    ],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'sum_mismatch');
});

test('payments[] vacío → sum_mismatch', () => {
  const body = baseBody({ payments: [] });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'sum_mismatch');
});

test('amountCents = 0 → sum_mismatch', () => {
  const body = baseBody({
    payments: [{ method: 'cash', amountCents: 0 }],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'sum_mismatch');
});

test('amountCents negativo → sum_mismatch', () => {
  const body = baseBody({
    payments: [{ method: 'cash', amountCents: -100 }],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'sum_mismatch');
});

test('amountCents no entero → sum_mismatch', () => {
  const body = baseBody({
    payments: [{ method: 'cash', amountCents: 25.5 as unknown as number }],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'sum_mismatch');
});

// -----------------------------------------------------------------------------
// invalid_method
// -----------------------------------------------------------------------------
test('método fuera de whitelist → invalid_method', () => {
  const body = baseBody({
    payments: [
      { method: 'crypto' as unknown as 'cash', amountCents: 2500 },
    ],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'invalid_method');
});

test('payment sin shape correcto (missing amountCents) → invalid_method', () => {
  const body = {
    payments: [{ method: 'cash' } as unknown as { method: 'cash'; amountCents: number }],
    idempotencyKey: 'k',
  } as ChargeRequestBody;
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'invalid_method');
});

// -----------------------------------------------------------------------------
// multiple_online
// -----------------------------------------------------------------------------
test('2 tramos card_online → multiple_online', () => {
  const body = baseBody({
    payments: [
      { method: 'card_online', amountCents: 1000 },
      { method: 'card_online', amountCents: 1500 },
    ],
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'multiple_online');
});

// -----------------------------------------------------------------------------
// idempotency
// -----------------------------------------------------------------------------
test('idempotencyKey vacío → idempotency_replay', () => {
  const body = baseBody({ idempotencyKey: '' });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'idempotency_replay');
});

test('idempotencyKey solo espacios → idempotency_replay', () => {
  const body = baseBody({ idempotencyKey: '   ' });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'idempotency_replay');
});

// -----------------------------------------------------------------------------
// booking_not_chargeable
// -----------------------------------------------------------------------------
test('bookingTotal = 0 → booking_not_chargeable', () => {
  const r = validateChargeBody(baseBody(), 0);
  assert.ok(r);
  assert.equal(r!.code, 'booking_not_chargeable');
});

test('bookingTotal negativo → booking_not_chargeable', () => {
  const r = validateChargeBody(baseBody(), -100);
  assert.ok(r);
  assert.equal(r!.code, 'booking_not_chargeable');
});

// -----------------------------------------------------------------------------
// tip validation
// -----------------------------------------------------------------------------
test('tip con amountCents inválido → tip_without_barber', () => {
  const body = baseBody({
    tip: {
      amountCents: 0,
      method: 'cash',
      barberId: 'uuid-1',
    },
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'tip_without_barber');
});

test('tip sin barberId → tip_without_barber', () => {
  const body = baseBody({
    tip: {
      amountCents: 200,
      method: 'cash',
      barberId: '',
    },
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'tip_without_barber');
});

test('tip con method online (no whitelist) → tip_without_barber', () => {
  const body = baseBody({
    tip: {
      amountCents: 200,
      method: 'card_online' as unknown as 'cash',
      barberId: 'uuid-1',
    },
  });
  const r = validateChargeBody(body, BOOKING_TOTAL);
  assert.ok(r);
  assert.equal(r!.code, 'tip_without_barber');
});
