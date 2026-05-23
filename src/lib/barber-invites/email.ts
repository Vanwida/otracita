import { sendEmail } from '@/lib/email/notify';
import { siteUrl } from '@/lib/site';

// -----------------------------------------------------------------------------
// Email transaccional de invitación al barbero. Sender = otracita
// <hola@otracita.es>. HTML simple (sin tracking pixels) + text fallback.
// Si Resend no está configurado, `sendEmail` devuelve `skipped: true` y el
// caller decide qué hacer (loguear, fallback a WhatsApp del jefe, etc.).
// -----------------------------------------------------------------------------

export interface InviteEmailInput {
  to: string;
  barberName: string;
  ownerName: string | null;
  businessName: string | null;
  token: string;
}

/** Mínimo escape de HTML para los nombres que vienen del input del jefe.
 *  No metemos `dompurify` — son sólo nombres en posición de texto y atributo,
 *  con esto basta para evitar inyección en el preview del cliente. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendBarberInviteEmail(input: InviteEmailInput) {
  const acceptUrl = siteUrl(`/aceptar-invitacion/${input.token}`);
  const ownerRaw = input.ownerName?.trim() || 'tu jefe';
  const businessRaw = input.businessName?.trim() || 'el negocio';
  const barberRaw = input.barberName.trim();

  const subject = `${ownerRaw} te invita a unirte a ${businessRaw} en otracita`;

  const text = [
    barberRaw ? `Hola ${barberRaw},` : 'Hola,',
    '',
    `${ownerRaw} te invita a unirte a ${businessRaw} en otracita.`,
    '',
    'Tu acceso te permitirá ver tu agenda diaria, tus cobros y propinas,',
    'sin acceder a finanzas o ajustes técnicos del negocio.',
    '',
    `Acepta la invitación: ${acceptUrl}`,
    '',
    'El enlace caduca en 7 días.',
    '',
    '— otracita',
  ].join('\n');

  const owner = escapeHtml(ownerRaw);
  const business = escapeHtml(businessRaw);
  const barber = barberRaw ? escapeHtml(barberRaw) : '';
  const acceptUrlSafe = escapeHtml(acceptUrl);

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:40px 32px;">
            <tr>
              <td style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7466;padding-bottom:24px;">otracita</td>
            </tr>
            <tr>
              <td style="font-size:22px;line-height:1.35;font-weight:600;color:#1a1a1a;padding-bottom:16px;">
                ${barber ? `Hola ${barber},` : 'Hola,'}
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;color:#3a3a3a;padding-bottom:16px;">
                <strong>${owner}</strong> te invita a unirte a <strong>${business}</strong> en otracita.
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:#3a3a3a;padding-bottom:28px;">
                Tu acceso te permitirá ver tu agenda diaria, tus cobros y propinas, sin acceder a finanzas o ajustes técnicos del negocio.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:28px;">
                <a href="${acceptUrlSafe}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">Aceptar invitación</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.5;color:#7a7466;padding-bottom:24px;">
                O copia este enlace en tu navegador:<br>
                <a href="${acceptUrlSafe}" style="color:#7a7466;word-break:break-all;">${acceptUrlSafe}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.5;color:#9b9485;border-top:1px solid #ece6db;padding-top:20px;">
                El enlace caduca en 7 días. Si no esperabas esta invitación, ignora este email.
              </td>
            </tr>
          </table>
          <div style="font-size:12px;color:#9b9485;padding-top:16px;">— otracita</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendEmail({
    to: input.to,
    subject,
    html,
    text,
    tag: 'barber-invite',
  });
}
