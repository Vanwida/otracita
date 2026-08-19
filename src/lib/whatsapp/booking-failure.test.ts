import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingFailureReply, type BookingFailure } from './booking-failure.ts';

// -----------------------------------------------------------------------------
// Regresión L-09: cuando `createBooking` falla (solape, lead time, horizonte…),
// el bot se lo comía con un `console.warn`. El cliente no recibía NADA y la
// conversación moría en idle — y en las ramas sin hueco válido llegaba a
// contestar "Tu cita ha sido reservada" sin fila en la BD.
//
// `bookingFailureReply` es la pieza que decide qué se le dice y si se le
// reofrecen huecos. Se testea aislada porque `engine.ts` importa `@/db`, que
// abre la conexión Neon en el import y no es cargable desde el runner.
// -----------------------------------------------------------------------------

const overlap: BookingFailure = {
  error: 'overlap',
  message: 'Ya hay una reserva en ese horario.',
};

test('solape: se reenvía el motivo y se vuelve al selector de huecos', () => {
  // Dos móviles, mismo hueco: el segundo tiene que leer el error y ver huecos.
  const reply = bookingFailureReply(overlap, 'es');
  assert.equal(reply.message, 'Ya hay una reserva en ese horario.');
  assert.equal(reply.action, 'retry_slots');
});

test('lead time / horizonte / sin profesional libre: motivo real + reintentar', () => {
  const cases: BookingFailure[] = [
    { error: 'lead_time', message: 'La reserva debe hacerse al menos 60 min antes del servicio.' },
    { error: 'horizon', message: 'Solo aceptamos reservas hasta 30 días por adelantado.' },
    { error: 'no_barber_available', message: 'No hay profesionales libres en ese horario.' },
  ];
  for (const failure of cases) {
    const reply = bookingFailureReply(failure, 'es');
    assert.equal(reply.message, failure.message, failure.error);
    assert.equal(reply.action, 'retry_slots', failure.error);
  }
});

test('bloqueos del cliente: se explica, pero NO se reofrecen huecos', () => {
  // Reofrecer huecos aquí sería un bucle: fallarían todos igual.
  const cases: BookingFailure[] = [
    {
      error: 'customer_blocked',
      message: 'No es posible reservar online. Contacta directamente con la barbería.',
    },
    {
      error: 'card_required',
      message: 'Para reservar online debes guardar una tarjeta y aceptar la tarifa por no presentarte.',
    },
  ];
  for (const failure of cases) {
    const reply = bookingFailureReply(failure, 'es');
    assert.equal(reply.message, failure.message, failure.error);
    assert.equal(reply.action, 'end', failure.error);
  }
});

test('errores de programador: nunca se le reenvían al cliente', () => {
  const internal: BookingFailure[] = [
    { error: 'validation', message: 'customerPhone is required' },
    { error: 'validation', message: 'Invalid date format (YYYY-MM-DD)' },
    { error: 'validation', message: 'duration must be greater than 0' },
    { error: 'validation', message: 'La barbería no tiene profesionales configurados.' },
  ];
  for (const failure of internal) {
    const reply = bookingFailureReply(failure, 'es');
    assert.notEqual(reply.message, failure.message, failure.message);
    assert.match(reply.message, /No he podido crear la reserva/);
    assert.equal(reply.action, 'end');
  }
});

test('fallo sin motivo (excepción, GCal caído, barbería sin calendario): mensaje genérico', () => {
  for (const failure of [null, undefined]) {
    const reply = bookingFailureReply(failure, 'es');
    assert.match(reply.message, /No he podido crear la reserva/);
    assert.equal(reply.action, 'end');
  }
});

test('nunca se contesta con silencio: siempre hay mensaje no vacío', () => {
  const errors = [
    'validation',
    'overlap',
    'lead_time',
    'horizon',
    'no_barber_available',
    'card_required',
    'customer_blocked',
  ] as const;
  for (const error of errors) {
    for (const lang of ['es', 'en'] as const) {
      const reply = bookingFailureReply({ error, message: 'x' }, lang);
      assert.ok(reply.message.trim().length > 0, `${error}/${lang}`);
      // Y nunca una confirmación de consolación.
      assert.doesNotMatch(reply.message, /reservada|confirmada|booked|confirmed/i, `${error}/${lang}`);
    }
  }
});

test('en inglés no se cuela el castellano de createBooking', () => {
  const reply = bookingFailureReply(overlap, 'en');
  assert.equal(reply.message, 'Sorry, that slot has just been taken.');
  assert.equal(reply.action, 'retry_slots');

  const internal = bookingFailureReply({ error: 'validation', message: 'La barbería no…' }, 'en');
  assert.match(internal.message, /couldn't create the booking/);
});

test('un message vacío del helper de reservas cae al genérico', () => {
  const reply = bookingFailureReply({ error: 'overlap', message: '   ' }, 'es');
  assert.match(reply.message, /No he podido crear la reserva/);
  assert.equal(reply.action, 'retry_slots');
});
