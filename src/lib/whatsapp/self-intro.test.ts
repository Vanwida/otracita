import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSelfIntroName } from './self-intro.ts';

// -----------------------------------------------------------------------------
// Regresión U-14: `extractSelfIntroName` es la puerta que decide si el engine
// guarda un nombre nuevo y hace `return` ANTES de `classifyIntent`. Devolver un
// nombre donde no lo hay tiene dos costes a la vez: al cliente se le renombra
// ("a partir de ahora te llamo Cliente 👍") y su reserva nunca arranca.
//
// El test ataca la puerta y no el engine porque `engine.ts` importa `@/db`, que
// abre la conexión Neon en el import — no es cargable desde el runner. La
// puerta recibe exactamente lo que le llega al engine: el texto del mensaje.
// -----------------------------------------------------------------------------

test('el caso U-14: presentarse como rol no cambia el nombre ni corta la reserva', () => {
  const notIntros = [
    'hola, soy cliente nuevo y quiero cita',
    'soy cliente nuevo y quiero cita',
    'hola soy cliente nuevo',
    'soy cliente',
    'soy nuevo',
    'soy nueva aqui',
    'buenas, soy un cliente nuevo',
    'soy el barbero',
    'soy barbero',
    'soy peluquera',
    'hola, soy amigo de Reni',
  ];

  for (const text of notIntros) {
    assert.equal(extractSelfIntroName(text), null, `no debería ser nombre: "${text}"`);
  }
});

test('frases que empiezan por un disparador pero siguen con intención → null', () => {
  const notIntros = [
    'soy Juan y quiero cita',
    'soy Juan, quiero reservar mañana',
    'me llamo Juan y necesito hora para hoy',
    'soy Juan quiero corte de pelo',
    'llamame cuando tengas hueco',
    'i am looking for a haircut',
    "i'm booking a haircut",
    'call me tomorrow please',
  ];

  for (const text of notIntros) {
    assert.equal(extractSelfIntroName(text), null, `no debería ser nombre: "${text}"`);
  }
});

test('presentaciones de verdad → se guarda el nombre', () => {
  const intros: Array<[string, string]> = [
    ['soy Juan', 'Juan'],
    ['Soy Juan', 'Juan'],
    ['soy juan', 'Juan'],
    ['soy Juan!', 'Juan'],
    ['hola, soy Juan', 'Juan'],
    ['Hola! Soy Juan 👋', 'Juan'],
    ['buenos dias, soy Juan', 'Juan'],
    ['me llamo Juan', 'Juan'],
    ['mi nombre es Juan', 'Juan'],
    ['llámame Juan', 'Juan'],
    ['llamame Juan', 'Juan'],
    ['soy José', 'José'],
    ['soy Juan Carlos Pérez', 'Juan'],
    ['my name is John', 'John'],
    ['call me John', 'John'],
    ['i am John', 'John'],
    ["i'm John", 'John'],
  ];

  for (const [text, expected] of intros) {
    assert.equal(extractSelfIntroName(text), expected, `debería extraer ${expected} de "${text}"`);
  }
});

test('mensajes sin presentación → null', () => {
  const notIntros = [
    '',
    'hola',
    'buenas',
    'soy',
    'quiero una cita',
    'quiero cita, soy Juan', // la presentación tiene que ir al principio
    'a que hora abrís?',
    'cuanto cuesta el corte',
    'soy 2',
    'soy juan23',
    'gracias!',
    '👍',
  ];

  for (const text of notIntros) {
    assert.equal(extractSelfIntroName(text), null, `no debería ser nombre: "${text}"`);
  }
});
