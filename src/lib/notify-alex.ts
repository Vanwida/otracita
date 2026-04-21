import { sendWhatsAppMessage } from '@/lib/whatsapp/sender';

/**
 * Operations notifications — pings Alex on WhatsApp when something interesting
 * happens (new signup, parse failure, etc.). Fire-and-forget: callers must
 * never block on this, and we never throw. A failure to notify should not
 * ripple into, e.g., a Stripe webhook 500.
 *
 * WhatsApp is the only channel. If Meta's 24h "service window" is closed
 * (Alex hasn't messaged the bot in 24h), the send fails silently and we log
 * to the Vercel runtime for post-mortem review. When this starts happening
 * enough to matter we'll approve a Meta notification template — that's the
 * native path, not an SMTP/Resend fallback.
 *
 * Config (env):
 *   ALEX_WHATSAPP_NUMBER        E.164 digits, no "+" (e.g. "34644288663")
 *   WHATSAPP_PHONE_NUMBER_ID    Platform Meta phone number ID (sender)
 *   WHATSAPP_ACCESS_TOKEN       Platform Meta access token
 */

const ALEX_WHATSAPP_NUMBER = process.env.ALEX_WHATSAPP_NUMBER?.trim();
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

/**
 * WhatsApp Cloud API error code indicating the recipient hasn't messaged us
 * in the last 24h, so free-form text can't be delivered without a template.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const META_ERROR_OUTSIDE_WINDOW = 131047;

type MetaSendResponse = {
  error?: {
    code?: number;
    message?: string;
  };
};

/**
 * Send an ops notification to Alex. Never throws.
 * Returns true if WhatsApp accepted the message.
 */
export async function notifyAlex(message: string): Promise<boolean> {
  if (!ALEX_WHATSAPP_NUMBER || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error(
      '[notifyAlex] WhatsApp config missing — set ALEX_WHATSAPP_NUMBER, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN'
    );
    return false;
  }

  try {
    const res = (await sendWhatsAppMessage(
      WHATSAPP_PHONE_NUMBER_ID,
      ALEX_WHATSAPP_NUMBER,
      message,
      WHATSAPP_ACCESS_TOKEN,
    )) as MetaSendResponse;

    if (res?.error?.code === META_ERROR_OUTSIDE_WINDOW) {
      console.warn(
        '[notifyAlex] WhatsApp 24h window closed — alert not delivered:',
        message.slice(0, 120),
      );
      return false;
    }

    if (res?.error) {
      console.error('[notifyAlex] WhatsApp error:', res.error, '\nmessage:', message.slice(0, 120));
      return false;
    }

    return true;
  } catch (err) {
    console.error('[notifyAlex] WhatsApp send threw:', err, '\nmessage:', message.slice(0, 120));
    return false;
  }
}
