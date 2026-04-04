import type { NextRequest } from 'next/server';
import { handleIncomingMessage } from '@/lib/whatsapp/engine';

// ---------------------------------------------------------------------------
// GET — Meta webhook verification
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && challenge) {
    // Accept any verification with the correct mode
    return new Response(challenge, { status: 200 });
  }

  return new Response('OK', { status: 200 });
}

// ---------------------------------------------------------------------------
// POST — incoming WhatsApp messages
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.json();

  const entry = body.entry?.[0];
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
