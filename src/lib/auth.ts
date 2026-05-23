import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { SITE_ORIGIN } from './site';
import { sendEmail } from './email/notify';

/**
 * Connection string para `pg` con SSL `verify-full` EXPLÍCITO.
 *
 * Por qué: en `pg-connection-string` v3 / `pg` v9 los modos
 * 'prefer'/'require'/'verify-ca' dejarán de tratarse como aliases de
 * 'verify-full' y adoptarán semántica libpq (más débil). El warning
 * actual lo anuncia.
 *
 * Para producto fiscal/payments (Neon Postgres con datos de barberos,
 * facturas VeriFactu, Stripe) la seguridad máxima es no-negociable, así
 * que SIEMPRE forzamos `verify-full`:
 *   1. Elimina cualquier `sslmode=*` previo (Neon suele inyectar
 *      `sslmode=require`, que dispara el warning).
 *   2. Re-añade `sslmode=verify-full` al final.
 * El env var no se toca — la transformación sólo vive en runtime aquí.
 */
function databaseUrlWithSslVerifyFull(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  // Strip existing sslmode (cualquier valor) para no dejar dos sslmode= en
  // la query string. Mantiene el resto de params intactos.
  const stripped = raw
    .replace(/([?&])sslmode=[^&]*&?/i, (_m, sep) => (sep === '?' ? '?' : ''))
    .replace(/[?&]$/, '');
  const sep = stripped.includes('?') ? '&' : '?';
  return `${stripped}${sep}sslmode=verify-full`;
}

export const auth = betterAuth({
  database: new Pool({
    connectionString: databaseUrlWithSslVerifyFull(),
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Reset de contraseña. Better Auth genera el token y la URL; aquí
    // sólo enviamos el email. `url` ya incluye el token + el callbackURL
    // (que es el `redirectTo` que pasamos en `requestPasswordReset`).
    // Better Auth resuelve `/api/auth/reset-password/[token]` → redirige
    // al callbackURL con `?token=` para que la UI consuma `resetPassword`.
    sendResetPassword: async ({ user, url }) => {
      const safeUrl = url;
      await sendEmail({
        to: user.email,
        subject: 'Restablece tu contraseña — otracita',
        text: [
          'Hola,',
          '',
          'Hemos recibido una petición para restablecer tu contraseña en otracita.',
          '',
          `Restablécela aquí: ${safeUrl}`,
          '',
          'Si no fuiste tú, ignora este email. El enlace caduca en 1 hora.',
          '',
          '— otracita',
        ].join('\n'),
        html: `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:40px 32px;">
          <tr><td style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7466;padding-bottom:24px;">otracita</td></tr>
          <tr><td style="font-size:22px;line-height:1.35;font-weight:600;color:#1a1a1a;padding-bottom:16px;">Restablece tu contraseña</td></tr>
          <tr><td style="font-size:16px;line-height:1.6;color:#3a3a3a;padding-bottom:24px;">Hemos recibido una petición para restablecer tu contraseña en otracita. Pulsa el botón para crear una nueva.</td></tr>
          <tr><td style="padding-bottom:24px;"><a href="${safeUrl}" style="display:inline-block;background:#1a1a1a;color:#f5f1ea;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:8px;font-size:15px;">Restablecer contraseña</a></td></tr>
          <tr><td style="font-size:13px;line-height:1.6;color:#7a7466;padding-bottom:8px;">Si no fuiste tú, ignora este email. El enlace caduca en 1 hora.</td></tr>
          <tr><td style="font-size:13px;line-height:1.6;color:#7a7466;padding-top:24px;border-top:1px solid #e5dfd2;">— otracita</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
        tag: 'password-reset',
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  // Modo barbero v2 (#71) — campos aditivos en la tabla `user`:
  //   · role        — 'admin' | 'barber' (default 'admin' = el dueño).
  //   · clientId    — tenant del que es miembro.
  //   · barberId    — si role='barber', enlaza al `barbers` row.
  //   · disabledAt  — soft-disable (revocar acceso).
  // `input: false` evita que un cliente pueda setear estos campos en el
  // signup público. Los seteamos server-side al aceptar una invitación.
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'admin', input: false },
      clientId: { type: 'string', required: false, input: false },
      barberId: { type: 'string', required: false, input: false },
      disabledAt: { type: 'date', required: false, input: false },
      // Permisos granulares (#72) — capa Manager sobre rol Barber. Edita
      // solo el dueño (admin) desde /api/barbers/[id]/permissions. Aquí
      // los declaramos como `input: false` para que Better Auth nunca los
      // acepte por signup público.
      isManager: { type: 'boolean', defaultValue: false, input: false },
      managerPermissions: { type: 'string[]', defaultValue: [], input: false },
    },
  },
  trustedOrigins: [
    // SITE_ORIGIN puede variar por env (preview/staging) — los demás son
    // hosts legacy del producto que mantenemos para migraciones puntuales.
    SITE_ORIGIN,
    'https://www.otracita.es',
    'https://agendalo.aistudios.pro',
    'https://reserva.aistudios.pro',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
  ],
});
