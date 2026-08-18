export const GRAPH_API_VERSION = 'v21.0';

/** Base de cualquier llamada a la Graph API de Meta. Vive aquí (y no
 *  duplicada por módulo) para que subir de versión sea una línea: un sender
 *  en v21 con un health-check en v19 daría diagnósticos que no corresponden
 *  a lo que de verdad se usa. */
export function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
}

function getMessagesUrl(phoneNumberId: string): string {
  return graphUrl(`${phoneNumberId}/messages`);
}

function getHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Shape de error de la WhatsApp Cloud API (Meta). Meta lo devuelve tanto con
 * HTTP 200 + body.error (raro) como con 4xx/5xx. El código 131047 = ventana
 * de 24h cerrada (no se puede mandar freeform sin plantilla).
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export interface WhatsAppApiError {
  code?: number;
  message?: string;
  type?: string;
  error_data?: unknown;
}

/**
 * Realiza el POST a Meta y NORMALIZA el resultado:
 *   · Devuelve el body JSON de Meta tal cual (back-compat: callers que ya
 *     leen `.error` siguen funcionando sin cambios).
 *   · Si la respuesta HTTP no es ok (4xx/5xx) y Meta no incluyó `error` en
 *     el body — caso de 5xx sin cuerpo JSON, o body no parseable —
 *     SINTETIZAMOS un `error` para que `.error` SIEMPRE esté poblado en
 *     fallo. Así un caller puede decidir "fallido" mirando solo `.error`
 *     sin tener que inspeccionar también el status HTTP.
 *
 * Antes esto devolvía `response.json()` a secas: un mensaje rechazado por
 * Meta (p.ej. fuera de la ventana de 24h) se "tragaba" silenciosamente y el
 * caller no tenía forma de detectarlo más allá del body. El cron de
 * recordatorios marcaba `reminderSent: true` igualmente → recordatorios
 * fantasma.
 */
async function postToMeta(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ error?: WhatsAppApiError; [k: string]: unknown }> {
  let response: Response;
  try {
    response = await fetch(getMessagesUrl(phoneNumberId), {
      method: 'POST',
      headers: getHeaders(accessToken),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Error de red: nunca llegamos a Meta. Devolvemos un error sintético en
    // vez de lanzar, para no romper los callers fire-and-forget que solo
    // hacen `await send()` sin try/catch (engine.ts, followup.ts).
    return {
      error: {
        message: err instanceof Error ? err.message : 'network error reaching WhatsApp Cloud API',
        type: 'network_error',
      },
    };
  }

  let body: { error?: WhatsAppApiError; [k: string]: unknown };
  try {
    body = (await response.json()) as { error?: WhatsAppApiError; [k: string]: unknown };
  } catch {
    body = {};
  }

  // Si HTTP falló pero Meta no pobló `error` en el body, sintetizamos uno
  // para que `.error` sea la señal única de fallo.
  if (!response.ok && !body.error) {
    body.error = {
      code: response.status,
      message: `WhatsApp Cloud API HTTP ${response.status}`,
      type: 'http_error',
    };
  }

  return body;
}

/** Send a plain text message. Devuelve el body de Meta (`.error` poblado en fallo). */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<{ error?: WhatsAppApiError; [k: string]: unknown }> {
  return postToMeta(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

/** Send interactive button message (max 3 buttons). `.error` poblado en fallo. */
export async function sendWhatsAppButtons(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  accessToken: string
): Promise<{ error?: WhatsAppApiError; [k: string]: unknown }> {
  return postToMeta(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

/** Send interactive list message (for more than 3 options, e.g. time slots). */
export async function sendWhatsAppList(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
  accessToken: string
): Promise<{ error?: WhatsAppApiError; [k: string]: unknown }> {
  return postToMeta(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections,
      },
    },
  });
}
