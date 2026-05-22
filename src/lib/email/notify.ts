// -----------------------------------------------------------------------------
// Outbound email — Postmark transactional API.
//
// Hoy SOLO se usa para notificaciones operativas (ops a alex@otracita.es, alta
// de bot WhatsApp al barbero). NO es la capa que manda emails masivos a
// clientes finales — para eso se usa WhatsApp + push vía dispatcher.
//
// Diseño:
//   · Fire-and-forget: nunca lanza. Si Postmark no está configurado, log y
//     return { ok: false, skipped: true } — el caller decide si fallback a
//     notifyAlex (WhatsApp ops channel).
//   · Sin dependencias. Llama directamente a la REST API con fetch.
//   · Body de texto plano. Para HTML cambiar a `HtmlBody` y añadir TextBody
//     como fallback (best-practice antispam).
//
// Env vars necesarias en Vercel:
//   POSTMARK_SERVER_TOKEN   — Server token (no Account). Empieza por algo
//                             tipo "abcd1234-...".
//   POSTMARK_FROM_EMAIL     — Sender verificado en Postmark (ej. no-reply@
//                             otracita.es). Sin esto Postmark devuelve 422.
//
// Pendiente operativo (NO bloqueante para deploy):
//   1. Crear servidor en Postmark (postmarkapp.com → Servers → New).
//   2. Verificar dominio otracita.es (DKIM + Return-Path DNS records).
//   3. Añadir `no-reply@otracita.es` como sender.
//   4. Pegar el Server Token en Vercel → otracita → Settings → Environment
//      Variables → POSTMARK_SERVER_TOKEN y POSTMARK_FROM_EMAIL.
// Hasta que pase #4, `sendEmail()` devuelve { ok: false, skipped: true } y
// los callers caen al fallback (notifyAlex WhatsApp).
// -----------------------------------------------------------------------------

import { notifyAlex } from '@/lib/notify-alex';

const POSTMARK_API_URL = 'https://api.postmarkapp.com/email';

export interface SendEmailInput {
  /** Destinatario (sólo uno por simplicidad — Postmark soporta CSV pero ahora
   *  mismo nunca lo necesitamos). */
  to: string;
  subject: string;
  /** Cuerpo en texto plano. Sin HTML — si en el futuro lo necesitamos,
   *  añadir `htmlBody` y pasar ambos a Postmark. */
  textBody: string;
  /** Categoría opcional para tracking en Postmark (Reports → Streams). */
  tag?: string;
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; status: number; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const from = process.env.POSTMARK_FROM_EMAIL?.trim();

  if (!token || !from) {
    console.warn(
      '[email/notify] POSTMARK_SERVER_TOKEN o POSTMARK_FROM_EMAIL no configurados — email no enviado',
      { to: input.to, subject: input.subject },
    );
    return {
      ok: false,
      skipped: true,
      reason: 'POSTMARK_SERVER_TOKEN o POSTMARK_FROM_EMAIL no configurados',
    };
  }

  try {
    const res = await fetch(POSTMARK_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: input.to,
        Subject: input.subject,
        TextBody: input.textBody,
        MessageStream: 'outbound',
        ...(input.tag ? { Tag: input.tag } : {}),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      MessageID?: string;
      Message?: string;
      ErrorCode?: number;
    };

    if (!res.ok) {
      const err = data?.Message ?? `HTTP ${res.status}`;
      console.error('[email/notify] Postmark rechazó email:', {
        to: input.to,
        subject: input.subject,
        status: res.status,
        error: err,
      });
      return { ok: false, skipped: false, status: res.status, error: err };
    }

    return { ok: true, messageId: data.MessageID ?? '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email/notify] fetch a Postmark falló:', msg);
    return { ok: false, skipped: false, status: 0, error: msg };
  }
}

// -----------------------------------------------------------------------------
// Wrapper con fallback a WhatsApp (notifyAlex) para notificaciones
// operativas que SÍ o SÍ tienen que llegar a Alex. Si Postmark falla o no está
// configurado, escribimos el mismo mensaje por WhatsApp.
//
// Pensado para alertas "Alex tiene que enterarse" (ej. nueva solicitud de bot,
// fallo de cobro recurrente, error grave en webhook). NO usar para emails de
// barbero — esos no tienen fallback y se quedan en cola hasta que Postmark
// esté configurado.
// -----------------------------------------------------------------------------

export async function sendOpsEmailWithWhatsappFallback(input: SendEmailInput): Promise<{
  email: SendEmailResult;
  whatsappFallback: boolean;
}> {
  const email = await sendEmail(input);
  if (email.ok) {
    return { email, whatsappFallback: false };
  }

  // Postmark no llegó. Mandamos por WhatsApp para que Alex se entere igual.
  const whatsappBody = `${input.subject}\n\n${input.textBody}`;
  const ok = await notifyAlex(whatsappBody);
  return { email, whatsappFallback: ok };
}
