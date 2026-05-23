import { sendEmail } from '@/lib/email/notify';
import { siteUrl } from '@/lib/site';

// -----------------------------------------------------------------------------
// Email transaccional de invitación al barbero. Postmark text-only. Si
// Postmark no está configurado, `sendEmail` devuelve `skipped: true` y el
// caller decide qué hacer (loguear, fallback a WhatsApp del jefe, etc.).
// -----------------------------------------------------------------------------

export interface InviteEmailInput {
  to: string;
  barberName: string;
  ownerName: string | null;
  businessName: string | null;
  token: string;
}

export async function sendBarberInviteEmail(input: InviteEmailInput) {
  const acceptUrl = siteUrl(`/aceptar-invitacion/${input.token}`);
  const owner = input.ownerName?.trim() || 'tu jefe';
  const business = input.businessName?.trim() || 'el negocio';

  const subject = `${owner} te invita a unirte a ${business} en otracita`;
  const textBody = [
    `Hola ${input.barberName.trim() || ''},`.trim(),
    '',
    `${owner} te invita a unirte a ${business} en otracita.`,
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

  return sendEmail({
    to: input.to,
    subject,
    textBody,
    tag: 'barber-invite',
  });
}
