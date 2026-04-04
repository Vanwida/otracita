const GRAPH_API_VERSION = 'v21.0';

function getMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

function getHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/** Send a plain text message */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<unknown> {
  const response = await fetch(getMessagesUrl(phoneNumberId), {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  return response.json();
}

/** Send interactive button message (max 3 buttons) */
export async function sendWhatsAppButtons(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  accessToken: string
): Promise<unknown> {
  const response = await fetch(getMessagesUrl(phoneNumberId), {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify({
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
    }),
  });
  return response.json();
}

/** Send interactive list message (for more than 3 options, e.g. time slots) */
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
): Promise<unknown> {
  const response = await fetch(getMessagesUrl(phoneNumberId), {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify({
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
    }),
  });
  return response.json();
}
