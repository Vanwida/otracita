import type { IncomingMessage } from '@/lib/whatsapp/engine';

// -----------------------------------------------------------------------------
// Aplanado + despacho del payload del webhook de WhatsApp.
//
// Meta NO garantiza un mensaje por POST: `entry[]`, `changes[]` y `messages[]`
// son arrays y en la práctica llegan agrupados cuando el cliente escribe dos
// veces seguidas ("hola" + "quiero cita el jueves"). Leer solo `messages[0]`
// pierde el segundo y el bot se queda esperando algo que ya le habían dicho.
//
// Aquí vive la lógica pura (sin DB, sin red) para poder testearla; `route.ts`
// solo verifica la firma HMAC e inyecta el handler real del engine.
// -----------------------------------------------------------------------------

/** Tipos de mensaje que el engine sabe atender hoy. El resto se ignora. */
const SUPPORTED_MESSAGE_TYPES = ['text', 'interactive'] as const;

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }>;
        // Los cambios de estado (delivered/read) no traen `messages`, y algunos
        // eventos raros pueden no traer metadata: todo es opcional a la entrada.
        metadata?: { phone_number_id?: string };
      };
    }>;
  }>;
}

/**
 * Aplana entry[] → changes[] → messages[] en la lista de mensajes que el
 * engine puede procesar, **conservando el orden de llegada** (que es el orden
 * cronológico en el que el cliente los escribió).
 *
 * Descarta: cambios sin `messages` (status updates), cambios sin
 * `phone_number_id` (no sabríamos a qué barbería pertenecen) y tipos de
 * mensaje no soportados (audio, imagen, sticker…).
 */
export function extractIncomingMessages(
  payload: WhatsAppWebhookPayload,
): IncomingMessage[] {
  const out: IncomingMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value?.messages || !phoneNumberId) continue;

      for (const message of value.messages) {
        const from = message.from;
        const type = message.type;
        if (!from || !type) continue;
        if (!(SUPPORTED_MESSAGE_TYPES as readonly string[]).includes(type)) continue;

        let messageText = '';
        let interactiveReplyId: string | undefined;

        if (type === 'text') {
          messageText = message.text?.body || '';
        } else {
          const reply = message.interactive?.button_reply || message.interactive?.list_reply;
          messageText = reply?.title || '';
          interactiveReplyId = reply?.id;
        }

        out.push({ from, phoneNumberId, messageText, messageType: type, interactiveReplyId });
      }
    }
  }

  return out;
}

/**
 * Agrupa por remitente conservando el orden dentro de cada grupo.
 * La clave es `phoneNumberId:from` — el mismo teléfono escribiendo a dos
 * barberías distintas son dos conversaciones independientes.
 */
function groupBySender(messages: IncomingMessage[]): IncomingMessage[][] {
  const groups = new Map<string, IncomingMessage[]>();

  for (const message of messages) {
    const key = `${message.phoneNumberId}:${message.from}`;
    const group = groups.get(key);
    if (group) group.push(message);
    else groups.set(key, [message]);
  }

  return [...groups.values()];
}

/**
 * Procesa el lote completo: **en serie dentro de cada conversación** (el
 * engine lee y escribe el estado de la conversación en DB, dos mensajes del
 * mismo teléfono en paralelo se pisarían) y en paralelo entre conversaciones
 * distintas, que no comparten estado.
 *
 * Un mensaje que peta no tumba al resto: se loguea y se sigue con el
 * siguiente, igual que antes. El webhook siempre devuelve 200 para que Meta
 * no reintente el lote entero.
 */
export async function processWebhookPayload(
  payload: WhatsAppWebhookPayload,
  handle: (msg: IncomingMessage) => Promise<void>,
): Promise<void> {
  const groups = groupBySender(extractIncomingMessages(payload));

  await Promise.all(
    groups.map(async (group) => {
      for (const message of group) {
        try {
          await handle(message);
        } catch (error) {
          console.error('Error handling WhatsApp message:', error);
        }
      }
    }),
  );
}
