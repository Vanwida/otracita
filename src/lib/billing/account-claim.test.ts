import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCheckoutSession,
  validateClaim,
  type CheckoutSessionFacts,
  type ClientRowFacts,
} from './account-claim.ts';

const CUS = 'cus_mine';
const OTHER_CUS = 'cus_ajeno';

function session(overrides: Partial<CheckoutSessionFacts> = {}): CheckoutSessionFacts {
  return {
    status: 'complete',
    paymentStatus: 'paid',
    customerId: CUS,
    ...overrides,
  };
}

function row(overrides: Partial<ClientRowFacts> = {}): ClientRowFacts {
  return {
    id: 'row-1',
    email: 'barbero@ejemplo.com',
    status: 'pending',
    stripeCustomerId: CUS,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// validateCheckoutSession — sin sesión válida no se sigue
// -----------------------------------------------------------------------------

test('sin sesión (POST sin sessionId) → 400, no pasa el gate', () => {
  const gate = validateCheckoutSession(null);
  assert.equal(gate.ok, false);
  assert.equal(gate.ok === false && gate.httpStatus, 400);
});

test('sesión abierta (checkout abandonado) → 400', () => {
  const gate = validateCheckoutSession(session({ status: 'open', paymentStatus: 'unpaid' }));
  assert.equal(gate.ok, false);
  assert.equal(gate.ok === false && gate.httpStatus, 400);
});

test('sesión expirada → 400 aunque payment_status venga vacío', () => {
  const gate = validateCheckoutSession(session({ status: 'expired', paymentStatus: null }));
  assert.equal(gate.ok, false);
});

test('sesión completa pero unpaid → 400', () => {
  const gate = validateCheckoutSession(session({ paymentStatus: 'unpaid' }));
  assert.equal(gate.ok, false);
  assert.equal(gate.ok === false && gate.httpStatus, 400);
});

test('sesión completa y pagada sin customer → 400', () => {
  const gate = validateCheckoutSession(session({ customerId: null }));
  assert.equal(gate.ok, false);
  assert.equal(gate.ok === false && gate.httpStatus, 400);
});

test('sesión completa y pagada → ok con el customer', () => {
  const gate = validateCheckoutSession(session());
  assert.equal(gate.ok, true);
  assert.equal(gate.ok === true && gate.stripeCustomerId, CUS);
});

test('trial Pro (no_payment_required) con sesión completa → ok', () => {
  // Pro lleva 14 días de trial y payment_method_collection: 'if_required',
  // así que Stripe cierra el checkout sin cobrar.
  const gate = validateCheckoutSession(session({ paymentStatus: 'no_payment_required' }));
  assert.equal(gate.ok, true);
});

test('trial sin completar el checkout NO cuela por no_payment_required', () => {
  const gate = validateCheckoutSession(
    session({ status: 'open', paymentStatus: 'no_payment_required' }),
  );
  assert.equal(gate.ok, false);
});

// -----------------------------------------------------------------------------
// validateClaim — el pago es mío y el email no es de otro
// -----------------------------------------------------------------------------

test('primera cuenta: fila pending propia con el email de billing → pasa', () => {
  const rows = [row({ email: 'pagos@empresa.com' })];
  assert.equal(validateClaim('carlos@gmail.com', CUS, rows), null);
});

test('sin filas todavía (webhook lento) → pasa', () => {
  assert.equal(validateClaim('carlos@gmail.com', CUS, []), null);
});

test('re-entrada con el mismo email de una cuenta ya activa → pasa', () => {
  const rows = [row({ email: 'carlos@gmail.com', status: 'active' })];
  assert.equal(validateClaim('carlos@gmail.com', CUS, rows), null);
});

test('el pago ya creó cuenta con OTRO email → 409', () => {
  const rows = [row({ email: 'carlos@gmail.com', status: 'active' })];
  const fail = validateClaim('ladron@gmail.com', CUS, rows);
  assert.equal(fail?.httpStatus, 409);
});

test('email de otro cliente con stripeCustomerId distinto → 409', () => {
  const rows = [
    row({ id: 'ajeno', email: 'victima@barberia.com', stripeCustomerId: OTHER_CUS, status: 'active' }),
  ];
  const fail = validateClaim('victima@barberia.com', CUS, rows);
  assert.equal(fail?.httpStatus, 409);
});

test('email de un cliente SIN stripeCustomerId (tier solo / alta admin) → 409', () => {
  // El bug del filtro SQL: `stripe_customer_id != 'cus_x'` es NULL para estas
  // filas, así que quedaban fuera del WHERE y eran reclamables con un pago
  // propio y válido.
  const rows = [
    row({ id: 'solo', email: 'victima@barberia.com', stripeCustomerId: null, status: 'active' }),
  ];
  const fail = validateClaim('victima@barberia.com', CUS, rows);
  assert.equal(fail?.httpStatus, 409);
});

test('tenant pending ajeno no se reclama por email', () => {
  const rows = [
    row({ id: 'pend', email: 'pendiente@barberia.com', stripeCustomerId: OTHER_CUS, status: 'pending' }),
  ];
  const fail = validateClaim('pendiente@barberia.com', CUS, rows);
  assert.equal(fail?.httpStatus, 409);
});

test('tenant pending ajeno sin stripeCustomerId tampoco se reclama por email', () => {
  const rows = [
    row({ id: 'pend', email: 'pendiente@barberia.com', stripeCustomerId: null, status: 'pending' }),
  ];
  const fail = validateClaim('pendiente@barberia.com', CUS, rows);
  assert.equal(fail?.httpStatus, 409);
});

test('email ajeno con distinta capitalización en DB → 409', () => {
  // El webhook guarda el email de Stripe sin normalizar.
  const rows = [
    row({ id: 'ajeno', email: 'Victima@Barberia.com', stripeCustomerId: OTHER_CUS, status: 'active' }),
  ];
  const fail = validateClaim('victima@barberia.com', CUS, rows);
  assert.equal(fail?.httpStatus, 409);
});

test('re-entrada con distinta capitalización de MI propio email → pasa', () => {
  const rows = [row({ email: 'Carlos@Gmail.com', status: 'active' })];
  assert.equal(validateClaim('carlos@gmail.com', CUS, rows), null);
});
