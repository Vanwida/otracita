// -----------------------------------------------------------------------------
// Outbound email — Resend transactional API.
//
// Hoy SOLO se usa para notificaciones operativas (ops a alex@otracita.es, alta
// de bot WhatsApp al barbero, invitaciones a barberos). NO es la capa que
// manda emails masivos a clientes finales — para eso se usa WhatsApp + push
// vía dispatcher.
//
// Diseño:
//   · Fire-and-forget: nunca lanza. Si Resend no está configurado, log y
//     return { sent: false, skipped: true } — el caller decide si fallback a
//     notifyAlex (WhatsApp ops channel).
//   · Sin SDK. Llamamos directamente a la REST API con fetch (~0 KB extra).
//   · Body en HTML + text plano (fallback antispam). Sender hardcoded al
//     alias verificado en Google Workspace que forwarda a Alex.
//
// Env vars necesarias en Vercel:
//   RESEND_API_KEY — Empieza por "re_...". Generar en
//                    https://resend.com/api-keys. Dominio `otracita.es` ya
//                    verificado (DKIM + SPF + DMARC).
// -----------------------------------------------------------------------------

import { notifyAlex } from '@/lib/notify-alex';

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Sender hardcoded — alias real en Google Workspace que forwarda a Alex.
 *  Cambiar requiere editar este literal Y el alias en Workspace. */
const SENDER_ADDRESS = 'otracita <hola@otracita.es>';
const DEFAULT_REPLY_TO = 'hola@otracita.es';

export interface SendEmailInput {
  /** Destinatario (sólo uno por simplicidad). */
  to: string;
  subject: string;
  /** Cuerpo HTML. Si no se pasa, Resend acepta sólo `text`. */
  html?: string;
  /** Cuerpo en texto plano. Fallback antispam — Resend recomienda incluir
   *  siempre versión text aunque haya html. */
  text?: string;
  /** Override del Reply-To. Default = `hola@otracita.es`. */
  replyTo?: string;
  /** Categoría opcional para tracking (Resend la guarda como `tags`). */
  tag?: string;
}

/**
 * Resultado de `sendEmail`. Mantiene los campos que ya consumen los callers
 * existentes (`ok`, `skipped`, `messageId`) para no romper la API pública, y
 * añade `sent` (alias semántico de `ok`) + `error` plano según el contrato
 * pedido en el spec de R-T3.
 */
export type SendEmailResult = {
  /** True si Resend aceptó el email. */
  sent: boolean;
  /** Alias de `sent` — algunos callers ya lo usan. */
  ok: boolean;
  /** True si se saltó el envío por falta de config (no es error). */
  skipped?: boolean;
  /** ID de Resend para tracking en su dashboard. */
  messageId?: string;
  /** Mensaje de error humano-legible si `sent === false && !skipped`. */
  error?: string;
  /** HTTP status si falló por respuesta de Resend (0 si fue exception). */
  status?: number;
};

interface ResendSuccess {
  id?: string;
}
interface ResendError {
  message?: string;
  name?: string;
  statusCode?: number;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn(
      '[email/notify] RESEND_API_KEY no configurado — email no enviado',
      { to: input.to, subject: input.subject },
    );
    return {
      sent: false,
      ok: false,
      skipped: true,
      error: 'RESEND_API_KEY no configurado',
    };
  }

  if (!input.html && !input.text) {
    console.error('[email/notify] sendEmail llamado sin html ni text', {
      to: input.to,
      subject: input.subject,
    });
    return {
      sent: false,
      ok: false,
      error: 'sendEmail requiere `html` o `text`',
    };
  }

  try {
    const payload: Record<string, unknown> = {
      from: SENDER_ADDRESS,
      to: [input.to],
      subject: input.subject,
      reply_to: input.replyTo ?? DEFAULT_REPLY_TO,
    };
    if (input.html) payload.html = input.html;
    if (input.text) payload.text = input.text;
    if (input.tag) payload.tags = [{ name: 'category', value: input.tag }];

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as ResendSuccess & ResendError;

    if (!res.ok) {
      const err = data?.message ?? `HTTP ${res.status}`;
      console.error('[email/notify] Resend rechazó email:', {
        to: input.to,
        subject: input.subject,
        status: res.status,
        error: err,
      });
      return { sent: false, ok: false, status: res.status, error: err };
    }

    return { sent: true, ok: true, messageId: data.id ?? '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email/notify] fetch a Resend falló:', msg);
    return { sent: false, ok: false, status: 0, error: msg };
  }
}

// -----------------------------------------------------------------------------
// Wrapper con fallback a WhatsApp (notifyAlex) para notificaciones
// operativas que SÍ o SÍ tienen que llegar a Alex. Si Resend falla o no está
// configurado, escribimos el mismo mensaje por WhatsApp.
//
// Pensado para alertas "Alex tiene que enterarse" (ej. nueva solicitud de bot,
// fallo de cobro recurrente, error grave en webhook). NO usar para emails de
// barbero — esos no tienen fallback y se quedan en cola hasta que Resend
// esté configurado.
// -----------------------------------------------------------------------------

export interface SendOpsEmailInput {
  to: string;
  subject: string;
  /** Cuerpo texto-only. Se usa tanto en el email como en el WhatsApp
   *  fallback. Si quieres HTML rico, usa `sendEmail` directo. */
  textBody: string;
  tag?: string;
}

export async function sendOpsEmailWithWhatsappFallback(
  input: SendOpsEmailInput,
): Promise<{ email: SendEmailResult; whatsappFallback: boolean }> {
  const email = await sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.textBody,
    tag: input.tag,
  });
  if (email.sent) {
    return { email, whatsappFallback: false };
  }

  // Resend no llegó. Mandamos por WhatsApp para que Alex se entere igual.
  const whatsappBody = `${input.subject}\n\n${input.textBody}`;
  const ok = await notifyAlex(whatsappBody);
  return { email, whatsappFallback: ok };
}
