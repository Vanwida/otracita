import type { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { handleIncomingMessage } from '@/lib/whatsapp/engine';

// ---------------------------------------------------------------------------
// GET — Meta webhook verification
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('[whatsapp] WHATSAPP_VERIFY_TOKEN is not set; rejecting verify');
    return new Response('Server misconfigured', { status: 500 });
  }

  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — incoming WhatsApp messages
//
// Meta signs every payload with HMAC-SHA256 of the raw body, keyed by the
// Meta App Secret. The signature travels in `X-Hub-Signature-256` as
// `sha256=<hex>`. We MUST verify this before trusting anything inside the
// payload — otherwise anyone could POST fake messages to the webhook URL.
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
// ---------------------------------------------------------------------------

const SIGNATURE_HEADER = 'x-hub-signature-256';
const SIGNATURE_PREFIX = 'sha256=';

function verifyMetaSignature(rawBody: string, headerValue: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // Fail closed — if the secret isn't configured, reject all webhook POSTs.
    console.warn('[whatsapp] META_APP_SECRET is not set; rejecting webhook POST');
    return false;
  }

  if (!headerValue || !headerValue.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const provided = headerValue.slice(SIGNATURE_PREFIX.length);
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  // Buffers must be equal length for timingSafeEqual — otherwise it throws.
  if (provided.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Read raw body first — JSON.parse after we've verified the HMAC.
  const rawBody = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);

  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn('[whatsapp] Invalid or missing X-Hub-Signature-256; rejecting POST');
    return new Response('Forbidden', { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ status: 'ok' });
  }

  // Same shape-handling as before — we were only working with entry[0] anyway.
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from: string;
            type: string;
            text?: { body?: string };
            interactive?: {
              button_reply?: { id?: string; title?: string };
              list_reply?: { id?: string; title?: string };
            };
          }>;
          metadata: { phone_number_id: string };
        };
      }>;
    }>;
  };

  const entry = payload.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  // Skip status updates (delivered, read, etc.)
  if (!value?.messages) {
    return Response.json({ status: 'ok' });
  }

  const message = value.messages[0];
  const from: string = message.from;
  const phoneNumberId: string = value.metadata.phone_number_id;

  // Extract text from different message types
  let messageText = '';
  let interactiveReplyId: string | undefined;

  if (message.type === 'text') {
    messageText = message.text?.body || '';
  } else if (message.type === 'interactive') {
    // Button or list reply
    const reply = message.interactive?.button_reply || message.interactive?.list_reply;
    messageText = reply?.title || '';
    interactiveReplyId = reply?.id;
  } else {
    // Unsupported message type — ignore for now
    return Response.json({ status: 'ok' });
  }

  try {
    await handleIncomingMessage({
      from,
      phoneNumberId,
      messageText,
      messageType: message.type,
      interactiveReplyId,
    });
  } catch (error) {
    console.error('Error handling WhatsApp message:', error);
  }

  // Always return 200 quickly so Meta doesn't retry
  return Response.json({ status: 'ok' });
}
