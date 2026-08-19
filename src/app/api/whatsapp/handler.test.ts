import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIncomingMessages,
  processWebhookPayload,
  type WhatsAppWebhookPayload,
} from './handler.ts';

// -----------------------------------------------------------------------------
// Tests del aplanado/despacho del webhook de WhatsApp (L-11).
//
// El bug: el route leía `messages[0]` y tiraba el resto, así que cuando Meta
// entregaba los dos mensajes del cliente en el MISMO POST ("hola" seguido de
// "quiero cita el jueves") el segundo se perdía y el bot se quedaba esperando.
//
// El body de estos tests es el payload real de un POST de Meta; route.ts solo
// añade la verificación HMAC por encima, que no toca el contenido.
// -----------------------------------------------------------------------------

const PHONE_NUMBER_ID = '123456789012345';
const CUSTOMER = '34600111222';
const OTHER_CUSTOMER = '34600333444';

function textMessage(from: string, body: string) {
  return { from, type: 'text', text: { body } };
}

/** Payload de Meta con un único change y N mensajes dentro. */
function payloadWith(messages: unknown[]): WhatsAppWebhookPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              messages: messages as never,
            },
          },
        ],
      },
    ],
  };
}

test('POST con 2 mensajes del mismo cliente: se procesan LOS DOS, en orden', async () => {
  const seen: string[] = [];

  await processWebhookPayload(
    payloadWith([
      textMessage(CUSTOMER, 'hola'),
      textMessage(CUSTOMER, 'quiero cita el jueves'),
    ]),
    async (msg) => {
      seen.push(msg.messageText);
    },
  );

  assert.deepEqual(seen, ['hola', 'quiero cita el jueves']);
});

test('los 2 mensajes del mismo teléfono NO se solapan (serie, no paralelo)', async () => {
  const timeline: string[] = [];

  await processWebhookPayload(
    payloadWith([textMessage(CUSTOMER, 'uno'), textMessage(CUSTOMER, 'dos')]),
    async (msg) => {
      timeline.push(`start:${msg.messageText}`);
      // Cede el turno al event loop: si el despacho fuese paralelo, el
      // segundo mensaje arrancaría aquí y la timeline se intercalaría.
      await new Promise((resolve) => setTimeout(resolve, 0));
      timeline.push(`end:${msg.messageText}`);
    },
  );

  assert.deepEqual(timeline, ['start:uno', 'end:uno', 'start:dos', 'end:dos']);
});

test('mensajes repartidos en varios entry[] / changes[]: no se pierde ninguno', async () => {
  const seen: string[] = [];

  await processWebhookPayload(
    {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [textMessage(CUSTOMER, 'uno')] as never,
              },
            },
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [textMessage(CUSTOMER, 'dos')] as never,
              },
            },
          ],
        },
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [textMessage(CUSTOMER, 'tres')] as never,
              },
            },
          ],
        },
      ],
    },
    async (msg) => {
      seen.push(msg.messageText);
    },
  );

  assert.deepEqual(seen, ['uno', 'dos', 'tres']);
});

test('un mensaje que peta no se lleva por delante al siguiente', async () => {
  const seen: string[] = [];

  await processWebhookPayload(
    payloadWith([textMessage(CUSTOMER, 'peta'), textMessage(CUSTOMER, 'sigue')]),
    async (msg) => {
      seen.push(msg.messageText);
      if (msg.messageText === 'peta') throw new Error('engine boom');
    },
  );

  assert.deepEqual(seen, ['peta', 'sigue']);
});

test('dos clientes distintos en el mismo lote: se procesan los dos', async () => {
  const seen: Array<{ from: string; text: string }> = [];

  await processWebhookPayload(
    payloadWith([
      textMessage(CUSTOMER, 'hola'),
      textMessage(OTHER_CUSTOMER, 'buenas'),
      textMessage(CUSTOMER, 'el jueves'),
    ]),
    async (msg) => {
      seen.push({ from: msg.from, text: msg.messageText });
    },
  );

  assert.equal(seen.length, 3);
  // Orden garantizado dentro de cada conversación, no entre conversaciones.
  assert.deepEqual(
    seen.filter((s) => s.from === CUSTOMER).map((s) => s.text),
    ['hola', 'el jueves'],
  );
  assert.deepEqual(
    seen.filter((s) => s.from === OTHER_CUSTOMER).map((s) => s.text),
    ['buenas'],
  );
});

test('los status updates (sin messages) no disparan nada', async () => {
  let calls = 0;

  await processWebhookPayload(
    {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                // statuses: [...] — Meta no incluye `messages` en estos eventos.
              },
            },
          ],
        },
      ],
    },
    async () => {
      calls += 1;
    },
  );

  assert.equal(calls, 0);
});

test('los tipos no soportados se saltan sin bloquear a los que sí lo son', () => {
  const msgs = extractIncomingMessages(
    payloadWith([
      { from: CUSTOMER, type: 'audio', audio: { id: 'x' } },
      textMessage(CUSTOMER, 'y esto sí'),
    ]),
  );

  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].messageText, 'y esto sí');
});

test('respuestas interactivas: se extraen title + id (botón y lista)', () => {
  const msgs = extractIncomingMessages(
    payloadWith([
      {
        from: CUSTOMER,
        type: 'interactive',
        interactive: { button_reply: { id: 'confirm_yes', title: 'Sí, confirmo' } },
      },
      {
        from: CUSTOMER,
        type: 'interactive',
        interactive: { list_reply: { id: 'svc_corte', title: 'Corte' } },
      },
    ]),
  );

  assert.deepEqual(
    msgs.map((m) => [m.messageType, m.messageText, m.interactiveReplyId]),
    [
      ['interactive', 'Sí, confirmo', 'confirm_yes'],
      ['interactive', 'Corte', 'svc_corte'],
    ],
  );
});

test('un change sin phone_number_id se descarta (no sabemos de qué barbería es)', () => {
  const msgs = extractIncomingMessages({
    entry: [
      {
        changes: [
          { value: { messages: [textMessage(CUSTOMER, 'huérfano')] as never } },
        ],
      },
    ],
  });

  assert.deepEqual(msgs, []);
});

test('payload vacío / sin entry: no revienta', async () => {
  assert.deepEqual(extractIncomingMessages({}), []);
  await processWebhookPayload({}, async () => {
    throw new Error('no debería llamarse');
  });
});
