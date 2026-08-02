// -----------------------------------------------------------------------------
// Emails transaccionales del cron de reseñas de Google. Mismo patrón que
// src/lib/barber-invites/email.ts: HTML simple con `sendEmail` (Resend) +
// fallback text.
//
// NOTA de scope: todavía no existe UI de dashboard para aprobar/editar/
// publicar un draft (este task es solo core). Por eso el email de draft NO
// promete un botón "publicar desde otracita" — instruye a responder desde
// la propia app/web de Google, que es la única vía real hoy. Pero SÍ lleva
// un enlace al panel (/dashboard/marketing/resenas) — un aviso sin ningún
// sitio al que ir es tan malo como no mandarlo.
// -----------------------------------------------------------------------------

import { sendEmail } from '@/lib/email/notify'
import { siteUrl } from '@/lib/site'

const RESENAS_URL = siteUrl('/dashboard/marketing/resenas')

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrapEmailHtml(opts: { eyebrow: string; heading: string; bodyHtml: string }) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:40px 32px;">
            <tr>
              <td style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7466;padding-bottom:24px;">${escapeHtml(opts.eyebrow)}</td>
            </tr>
            <tr>
              <td style="font-size:22px;line-height:1.35;font-weight:600;color:#1a1a1a;padding-bottom:16px;">${escapeHtml(opts.heading)}</td>
            </tr>
            <tr>
              <td>${opts.bodyHtml}</td>
            </tr>
          </table>
          <div style="font-size:12px;color:#9b9485;padding-top:16px;">— otracita</div>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export interface ReviewDraftEmailInput {
  to: string
  businessName: string
  starRating: number
  reviewerName: string | null
  reviewText: string | null
  draftReply: string
}

/**
 * Reseña de 1-3★ — no se auto-publica. Se le propone al barbero un texto
 * listo para copiar y pegar en su respuesta desde Google.
 */
export async function sendReviewDraftEmail(input: ReviewDraftEmailInput) {
  const reviewer = input.reviewerName?.trim() || 'Un cliente'
  const subject = `Nueva reseña de ${input.starRating}★ en Google — respuesta propuesta`

  const text = [
    `${reviewer} os ha dejado una reseña de ${input.starRating}/5 estrellas en Google.`,
    '',
    input.reviewText ? `"${input.reviewText}"` : '(Sin comentario de texto, solo la valoración.)',
    '',
    'Como es una valoración de 3 estrellas o menos, no la respondemos automáticamente — os proponemos este texto, revisadlo y pegadlo como respuesta desde vuestra app o web de Google (Perfil de empresa → Reseñas):',
    '',
    input.draftReply,
    '',
    `Ver esta reseña en el panel: ${RESENAS_URL}`,
    '',
    '— otracita',
  ].join('\n')

  const bodyHtml = `
    <p style="font-size:16px;line-height:1.6;color:#3a3a3a;margin:0 0 16px;">
      <strong>${escapeHtml(reviewer)}</strong> os ha dejado una reseña de <strong>${input.starRating}/5 ★</strong> en Google.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#3a3a3a;margin:0 0 20px;padding:16px;background:#f5f1ea;border-radius:8px;font-style:italic;">
      ${input.reviewText ? escapeHtml(input.reviewText) : 'Sin comentario de texto, solo la valoración.'}
    </p>
    <p style="font-size:15px;line-height:1.6;color:#3a3a3a;margin:0 0 12px;">
      Al ser ${input.starRating} estrellas no la respondemos automáticamente. Os proponemos este texto — revisadlo y pegadlo como respuesta desde vuestra app o web de Google (<strong>Perfil de empresa → Reseñas</strong>):
    </p>
    <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 20px;padding:16px;background:#ffffff;border:1px solid #ece6db;border-radius:8px;white-space:pre-wrap;">${escapeHtml(input.draftReply)}</p>
    <p style="padding-bottom:4px;">
      <a href="${RESENAS_URL}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">Ver reseñas en el panel</a>
    </p>
  `

  return sendEmail({
    to: input.to,
    subject,
    html: wrapEmailHtml({ eyebrow: 'otracita · reseñas', heading: subject, bodyHtml }),
    text,
    tag: 'google-review-draft',
  })
}

export interface GoogleBusinessReconnectEmailInput {
  to: string
  businessName: string
}

/**
 * El refresh_token fue revocado (invalid_grant). Avisamos para que
 * reconecten — sin esto, la auto-respuesta a reseñas queda muerta en
 * silencio hasta que alguien lo note.
 */
export async function sendGoogleBusinessReconnectEmail(input: GoogleBusinessReconnectEmailInput) {
  const subject = 'Se desconectó vuestra cuenta de Google Business Profile'

  const text = [
    `Hola,`,
    '',
    `El acceso a vuestro perfil de Google Business Profile (${input.businessName}) se ha desconectado — Google ya no nos deja leer ni responder vuestras reseñas.`,
    '',
    'Esto pasa normalmente si se revocó el acceso desde la cuenta de Google, o si alguien reconectó con otra cuenta.',
    '',
    'Volved a conectar desde Marketing → Reseñas cuando podáis para que la auto-respuesta a reseñas siga funcionando:',
    RESENAS_URL,
    '',
    '— otracita',
  ].join('\n')

  const bodyHtml = `
    <p style="font-size:15px;line-height:1.6;color:#3a3a3a;margin:0 0 16px;">
      El acceso a vuestro perfil de Google Business Profile se ha desconectado — Google ya no nos deja leer ni responder vuestras reseñas de <strong>${escapeHtml(input.businessName)}</strong>.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#3a3a3a;margin:0 0 20px;">
      Esto pasa normalmente si se revocó el acceso desde la cuenta de Google, o si alguien reconectó con otra cuenta.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#3a3a3a;margin:0 0 20px;">
      Volved a conectar desde <strong>Marketing → Reseñas</strong> cuando podáis para que la auto-respuesta a reseñas siga funcionando.
    </p>
    <p style="padding-bottom:4px;">
      <a href="${RESENAS_URL}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">Reconectar Google Business Profile</a>
    </p>
  `

  return sendEmail({
    to: input.to,
    subject,
    html: wrapEmailHtml({ eyebrow: 'otracita · reseñas', heading: subject, bodyHtml }),
    text,
    tag: 'google-business-reconnect',
  })
}
