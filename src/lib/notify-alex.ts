import { sendWhatsAppMessage } from '@/lib/whatsapp/sender';

/**
 * Operations notifications — pings Alex when something interesting happens
 * (new signup, failed webhook, etc.). Fire-and-forget: callers must never
 * block on this, and we never throw. A failure to notify should not ripple
 * into, e.g., a Stripe webhook 500.
 *
 * Channel priority:
 *   1. WhatsApp (Meta Cloud API) — primary.
 *   2. Email via Resend — fallback when WhatsApp fails (e.g. out of the
 *      24h service window and no template is approved yet).
 *
 * Config (env):
 *   ALEX_WHATSAPP_NUMBER        E.164 digits, no "+" (e.g. "34644288663")
 *   WHATSAPP_PHONE_NUMBER_ID    Platform Meta phone number ID (sender)
 *   WHATSAPP_ACCESS_TOKEN       Platform Meta access token
 *   ALEX_NOTIFY_EMAIL           Fallback inbox (optional; if unset, email is skipped)
 *   RESEND_API_KEY              Required for the email fallback (optional)
 *   RESEND_FROM                 e.g. "otracita <ops@otracita.es>" (optional; has a default)
 */

const ALEX_WHATSAPP_NUMBER = process.env.ALEX_WHATSAPP_NUMBER?.trim();
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

const ALEX_NOTIFY_EMAIL = process.env.ALEX_NOTIFY_EMAIL?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM = process.env.RESEND_FROM?.trim() || 'otracita <ops@otracita.es>';

/**
 * WhatsApp Cloud API error code indicating the recipient hasn't messaged us
 * in the last 24h, so a free-form text can't be delivered without a template.
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const META_ERROR_OUTSIDE_WINDOW = 131047;

type MetaSendResponse = {
  error?: {
    code?: number;
    message?: string;
  };
};

function isOutsideWindowError(res: unknown): boolean {
  if (!res || typeof res !== 'object') return false;
  const err = (res as MetaSendResponse).error;
  return err?.code === META_ERROR_OUTSIDE_WINDOW;
}

async function sendEmailFallback(message: string): Promise<boolean> {
  if (!RESEND_API_KEY || !ALEX_NOTIFY_EMAIL) {
    // No email fallback configured — nothing more we can do.
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [ALEX_NOTIFY_EMAIL],
        subject: 'otracita — notificación ops',
        text: message,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notifyAlex] email fallback failed:', res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notifyAlex] email fallback threw:', err);
    return false;
  }
}

/**
 * Send an ops notification to Alex. Never throws.
 * Returns true if at least one channel accepted the message.
 */
export async function notifyAlex(message: string): Promise<boolean> {
  // Validate WhatsApp config before even trying.
  if (!ALEX_WHATSAPP_NUMBER || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error(
      '[notifyAlex] WhatsApp config incomplete — set ALEX_WHATSAPP_NUMBER, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN'
    );
    return sendEmailFallback(message);
  }

  try {
    const res = await sendWhatsAppMessage(
      WHATSAPP_PHONE_NUMBER_ID,
      ALEX_WHATSAPP_NUMBER,
      message,
      WHATSAPP_ACCESS_TOKEN
    );

    // Meta returns 200 with an `error` object for delivery problems. If we're
    // outside the 24h service window we can't send free-form text — fall back
    // to email. Any other error we also try to notify via email as a
    // belt-and-suspenders measure.
    if (isOutsideWindowError(res)) {
      console.warn(
        '[notifyAlex] WhatsApp 24h window closed — falling back to email'
      );
      return sendEmailFallback(message);
    }

    const err = (res as MetaSendResponse)?.error;
    if (err) {
      console.error('[notifyAlex] WhatsApp error:', err);
      const emailed = await sendEmailFallback(message);
      return emailed;
    }

    return true;
  } catch (err) {
    console.error('[notifyAlex] WhatsApp send threw:', err);
    return sendEmailFallback(message);
  }
}
