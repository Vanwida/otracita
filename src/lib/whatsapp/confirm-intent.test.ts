import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAffirmativeReply,
  isCancelYes,
  isChangeYes,
  isEscapeCommand,
  normalizeReply,
} from './confirm-intent.ts';

// -----------------------------------------------------------------------------
// Regresión L-08: en el paso `confirming` de la FSM del bot, `isAffirmativeReply`
// es la ÚNICA puerta que decide si se crea la reserva (engine.ts →
// handleConfirmation). Antes era `lower.includes('si')`, así que "lo siento, no
// puedo" creaba una cita real.
//
// El test ataca la puerta y no `handleConfirmation` directamente porque
// engine.ts importa `@/db`, que abre la conexión Neon en el import — no es
// cargable desde el runner de tests. La puerta recibe exactamente lo que le
// llega al handler: `interactiveId || text`.
// -----------------------------------------------------------------------------

test('confirming: frases que contienen "si" pero NO son un sí → no se crea reserva', () => {
  const notYes = [
    'lo siento, no puedo',
    'lo siento',
    'necesito cambiarlo',
    'imposible',
    'me es imposible ese dia',
    'si no me va bien te aviso',
    'no, si al final no puedo',
    'quiza si, dejame mirarlo',
    'sin problema pero otro dia',
    'siempre a esa hora no puedo',
    'asi no',
    'no',
    'no gracias',
    'cancelar',
    'confirm_no',
    'sorry, i cannot',
    'yesterday would be better',
    '',
    '   ',
  ];

  for (const text of notYes) {
    assert.equal(isAffirmativeReply(text), false, `"${text}" no debería confirmar`);
  }
});

test('confirming: sí explícito y botón confirm_yes → se crea reserva', () => {
  const yes = [
    'confirm_yes',
    'si',
    'sí',
    'Sí',
    'SI',
    'siii',
    'sí!',
    'sí, confirmar',
    'Si, confirmo',
    'sí por favor',
    'vale',
    'Vale.',
    'ok',
    'OK 👍',
    'okay',
    'confirmo',
    'confirmar',
    'de acuerdo',
    'dale',
    'perfecto',
    'yes',
    'Yes, confirm',
    'yeah',
    'sure',
    'confirm',
  ];

  for (const text of yes) {
    assert.equal(isAffirmativeReply(text), true, `"${text}" debería confirmar`);
  }
});

test('normalizeReply: minúsculas, sin acentos, sin puntuación ni emoji', () => {
  assert.equal(normalizeReply('Sí!'), 'si');
  assert.equal(normalizeReply('  Sí,   confirmar 👍 '), 'si confirmar');
  assert.equal(normalizeReply('OK.'), 'ok');
  assert.equal(normalizeReply('¿Confirmamos?'), 'confirmamos');
});

// -----------------------------------------------------------------------------
// Regresión U-04: en `cancel_confirming` / `changing` la puerta era
// `lower.includes('si')`, así que "lo siento, no puedo ir" cancelaba o cambiaba
// la cita de verdad. Y "cancelar" caía antes en el escape global: el bot
// devolvía al menú, el cliente creía haber anulado y la cita seguía viva.
//
// Mismo motivo que arriba para atacar las puertas puras: engine.ts importa
// `@/db` y no es cargable desde el runner.
// -----------------------------------------------------------------------------

test('cancel_confirming: "cancelar" cancela la cita de verdad', () => {
  const yes = [
    'cancel_yes',
    'cancelar',
    'Cancelar',
    'cancélala',
    'cancela',
    'anula',
    'anúlala',
    'sí, cancelar',
    'si cancela',
    'si',
    'sí',
    'vale',
    'ok',
    'confirmo',
    'cancel',
    'yes cancel',
    'cancel it',
  ];

  for (const text of yes) {
    assert.equal(isCancelYes(text), true, `"${text}" debería cancelar`);
  }
});

test('cancel_confirming: frases con "si" que NO son un sí → la cita se mantiene', () => {
  const notYes = [
    'lo siento, no puedo ir',
    'lo siento',
    'no',
    'no, déjala',
    'mejor la dejo',
    'imposible ese dia',
    'si no puedo te aviso',
    'siempre a esa hora me va mal',
    'quiza si, dejame mirarlo',
    'sorry, i cannot make it',
    'cancel_no',
    '',
    '   ',
  ];

  for (const text of notYes) {
    assert.equal(isCancelYes(text), false, `"${text}" no debería cancelar`);
  }
});

test('changing: "cambiar" cambia; frases con "si" que no son un sí, no', () => {
  const yes = ['change_yes', 'cambiar', 'Cámbiala', 'cambio', 'sí, cambiar', 'si', 'vale', 'change it'];
  for (const text of yes) {
    assert.equal(isChangeYes(text), true, `"${text}" debería cambiar`);
  }

  const notYes = ['lo siento, no puedo ir', 'no', 'no hace falta', 'imposible', 'si no puedo te aviso', ''];
  for (const text of notYes) {
    assert.equal(isChangeYes(text), false, `"${text}" no debería cambiar`);
  }
});

test('escape global: "menu" reinicia siempre; "cancelar" sólo fuera del flujo de cancelar', () => {
  // Navegación pura: escapa en cualquier paso, incluido cancel_confirming.
  for (const text of ['menu', 'menú', 'Menú', 'salir', 'inicio', 'reiniciar', 'reset', 'exit', 'start', 'empezar']) {
    assert.equal(isEscapeCommand(text, { inCancelFlow: true }), true, `"${text}" debería reiniciar en cancel_confirming`);
    assert.equal(isEscapeCommand(text, { inCancelFlow: false }), true, `"${text}" debería reiniciar`);
  }

  // "cancelar" dentro del flujo de cancelar NO escapa — lo resuelve isCancelYes.
  assert.equal(isEscapeCommand('cancelar', { inCancelFlow: true }), false);
  assert.equal(isEscapeCommand('cancel', { inCancelFlow: true }), false);

  // Fuera del flujo (eligiendo hora, por ejemplo) sigue sacándole al menú.
  assert.equal(isEscapeCommand('cancelar', { inCancelFlow: false }), true);
  assert.equal(isEscapeCommand('cancel', { inCancelFlow: false }), true);

  // Frases largas nunca escapan, contengan lo que contengan.
  for (const text of ['lo siento, no puedo ir', 'quiero cancelar la del martes', 'menu del dia', '']) {
    assert.equal(isEscapeCommand(text, { inCancelFlow: false }), false, `"${text}" no debería reiniciar`);
  }
});
