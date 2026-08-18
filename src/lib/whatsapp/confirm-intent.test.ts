import test from 'node:test';
import assert from 'node:assert/strict';
import { isAffirmativeReply, normalizeReply } from './confirm-intent.ts';

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
