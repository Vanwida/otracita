import test from 'node:test';
import assert from 'node:assert/strict';
import { sendWhatsAppMessage, sendWhatsAppButtons } from './sender.ts';

// -----------------------------------------------------------------------------
// Regresión del recordatorio fantasma (transición Reni): los senders deben
// señalar el fallo vía `.error` cuando Meta rechaza el envío (HTTP 4xx/5xx o
// error de red), en vez de "tragarse" el rechazo y devolver un body limpio.
// El cron de recordatorios depende de `.error` para no marcar reminderSent
// cuando Meta rechaza (ventana de 24h cerrada → error 131047).
// -----------------------------------------------------------------------------

const PHONE_ID = '123';
const TO = '34600000000';
const TOKEN = 'tok';

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test('sendWhatsAppMessage: éxito → sin .error', async () => {
  await withMockedFetch(
    (async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), {
        status: 200,
      })) as typeof fetch,
    async () => {
      const r = await sendWhatsAppMessage(PHONE_ID, TO, 'hola', TOKEN);
      assert.equal(r.error, undefined);
      assert.deepEqual((r as { messages?: unknown[] }).messages, [{ id: 'wamid.X' }]);
    },
  );
});

test('sendWhatsAppMessage: Meta rechaza con body.error (ventana 24h, 400) → .error presente', async () => {
  await withMockedFetch(
    (async () =>
      new Response(
        JSON.stringify({
          error: { code: 131047, message: 'Re-engagement message', type: 'OAuthException' },
        }),
        { status: 400 },
      )) as typeof fetch,
    async () => {
      const r = await sendWhatsAppMessage(PHONE_ID, TO, 'hola', TOKEN);
      assert.ok(r.error, 'debería propagar el error de Meta');
      assert.equal(r.error?.code, 131047);
    },
  );
});

test('sendWhatsAppButtons: HTTP 5xx sin body.error → .error sintético', async () => {
  await withMockedFetch(
    (async () => new Response('upstream boom', { status: 503 })) as typeof fetch,
    async () => {
      const r = await sendWhatsAppButtons(PHONE_ID, TO, 'cuerpo', [{ id: 'a', title: 'A' }], TOKEN);
      assert.ok(r.error, 'debería sintetizar un error en HTTP 5xx sin body JSON');
      assert.equal(r.error?.code, 503);
      assert.equal(r.error?.type, 'http_error');
    },
  );
});

test('sendWhatsAppMessage: fallo de red → .error (no lanza)', async () => {
  await withMockedFetch(
    (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch,
    async () => {
      // No debe lanzar (callers fire-and-forget no envuelven en try/catch).
      const r = await sendWhatsAppMessage(PHONE_ID, TO, 'hola', TOKEN);
      assert.ok(r.error, 'fallo de red debería devolver .error en vez de lanzar');
      assert.equal(r.error?.type, 'network_error');
    },
  );
});
