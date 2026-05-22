import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_METHODS,
  isPaymentMethod,
  CASH_MOVEMENT_METHOD_FROM_PAYMENT,
  PAYMENT_METHOD_IS_INSTANT,
  MIXED_METHOD_TOKEN,
} from './methods.ts';

// -----------------------------------------------------------------------------
// Whitelist completa — si añades un método, este test lo fuerza a aparecer en
// el resto de mapeos. Evita el bug clásico "añadí 'bizum' pero olvidé
// mapearlo a cash_movements.method".
// -----------------------------------------------------------------------------
test('PAYMENT_METHODS whitelist contiene exactamente los 4 métodos esperados', () => {
  assert.deepEqual(
    [...PAYMENT_METHODS].sort(),
    ['bizum', 'card_online', 'card_physical', 'cash'],
  );
});

test('isPaymentMethod acepta whitelist y rechaza el resto', () => {
  for (const m of PAYMENT_METHODS) {
    assert.equal(isPaymentMethod(m), true, `${m} debería ser válido`);
  }
  assert.equal(isPaymentMethod('mixed'), false, 'mixed NO es PaymentMethod');
  assert.equal(isPaymentMethod('online'), false, "'online' es legado, no PaymentMethod");
  assert.equal(isPaymentMethod(''), false);
  assert.equal(isPaymentMethod(null), false);
  assert.equal(isPaymentMethod(undefined), false);
  assert.equal(isPaymentMethod(42), false);
  assert.equal(isPaymentMethod({ method: 'cash' }), false);
});

// -----------------------------------------------------------------------------
// Mapeo a cash_movements.method — el dominio histórico es cash | card | online.
// Verifica que cubre TODOS los PaymentMethod (si falta uno, TS lo bloquea, pero
// chequeamos también en runtime por si Record se rompe con cast).
// -----------------------------------------------------------------------------
test('CASH_MOVEMENT_METHOD_FROM_PAYMENT mapea todos los métodos a cash|card|online', () => {
  for (const m of PAYMENT_METHODS) {
    const mapped = CASH_MOVEMENT_METHOD_FROM_PAYMENT[m];
    assert.ok(
      mapped === 'cash' || mapped === 'card' || mapped === 'online',
      `${m} debería mapear a cash|card|online, no a ${mapped}`,
    );
  }
});

test('CASH_MOVEMENT_METHOD_FROM_PAYMENT — mapeo concreto (regresión)', () => {
  // Si alguno de estos cambia, el cuadre de caja se rompe en producción.
  assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT.cash, 'cash');
  assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT.card_physical, 'card');
  // Decisión Alex 2026-05-22: bizum cuadra como tarjeta hasta tener UX
  // dedicada. Si cambia, romper este test EXPRESAMENTE para forzar revisión
  // del cuadre histórico antes del deploy.
  assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT.bizum, 'card');
  assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT.card_online, 'online');
});

test('PAYMENT_METHOD_IS_INSTANT — solo card_online no es instant', () => {
  assert.equal(PAYMENT_METHOD_IS_INSTANT.cash, true);
  assert.equal(PAYMENT_METHOD_IS_INSTANT.card_physical, true);
  assert.equal(PAYMENT_METHOD_IS_INSTANT.bizum, true);
  assert.equal(PAYMENT_METHOD_IS_INSTANT.card_online, false);
});

test('MIXED_METHOD_TOKEN es la string "mixed" y NO es un PaymentMethod', () => {
  assert.equal(MIXED_METHOD_TOKEN, 'mixed');
  assert.equal(isPaymentMethod(MIXED_METHOD_TOKEN), false);
});
