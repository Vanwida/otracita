import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATED_ALERT_COOLDOWN_MS,
  gatedAlertMessage,
  type GatedClient,
} from './gated-alert-message.ts';

// -----------------------------------------------------------------------------
// L-17: con el plan gratis el bot tira los mensajes entrantes. Al cliente final
// no se le dice nada (correcto), pero a Alex tampoco (incorrecto). Este es el
// texto que le llega a Alex; se testea aislado porque `gated-alert.ts` importa
// `@/db`, que abre la conexión Neon en el import y no es cargable desde el
// runner (mismo motivo que `booking-failure.test.ts`).
//
// Lo que se protege aquí:
//   1. El aviso NUNCA sugiere al cliente que actualice el plan — es interno.
//   2. Dice POR QUÉ está gateado, que es lo único accionable para Alex.
//   3. La ventana es de 24 h de verdad.
// -----------------------------------------------------------------------------

const NOW = new Date('2026-08-19T10:00:00.000Z');

const base: GatedClient = {
  id: 'cli-123',
  businessName: 'Barbería Private Studio',
  tier: 'solo',
  trialEndsAt: null,
  status: 'active',
};

test('solo sin trial: dice qué barbería, qué plan y su id', () => {
  const msg = gatedAlertMessage(base, NOW);
  assert.match(msg, /Barbería Private Studio/);
  assert.match(msg, /Plan Solo · sin trial\./);
  assert.match(msg, /Cliente: cli-123/);
});

test('trial caducado: se nombra la fecha en que caducó', () => {
  // Alex necesita saber si es un lead recién caído del trial (llamar hoy) o
  // uno de hace meses (otra conversación).
  const msg = gatedAlertMessage(
    { ...base, trialEndsAt: new Date('2026-08-12T08:00:00.000Z') },
    NOW,
  );
  assert.match(msg, /trial caducado el 12\/08\/2026/);
  assert.doesNotMatch(msg, /sin trial/);
});

test('cuenta cancelada manda sobre el tier: hasFeature corta ahí primero', () => {
  // Un cliente cancelled con tier 'pro' SIGUE gateado (hasFeature devuelve
  // false salvo features 'solo'), así que el motivo tiene que ser la baja,
  // no el plan — si no, Alex leería "Plan Pro" y pensaría que hay un bug.
  const msg = gatedAlertMessage(
    { ...base, tier: 'pro', status: 'cancelled', trialEndsAt: null },
    NOW,
  );
  assert.match(msg, /Cuenta cancelada \(tier Pro\)/);
  assert.doesNotMatch(msg, /sin trial/);
});

test('el aviso es interno: nunca le pide a nadie que actualice el plan', () => {
  // Blindaje contra que alguien reutilice este texto como respuesta al
  // cliente final. El cliente escribe a su barbería, no a nosotros.
  for (const client of [
    base,
    { ...base, trialEndsAt: new Date('2026-01-01T00:00:00.000Z') },
    { ...base, status: 'cancelled' },
  ]) {
    const msg = gatedAlertMessage(client, NOW);
    assert.doesNotMatch(msg, /actualiza|actualizar|mejora tu plan|upgrade/i);
  }
});

test('la ventana del aviso es 24 h', () => {
  assert.equal(GATED_ALERT_COOLDOWN_MS, 24 * 60 * 60 * 1000);
});
