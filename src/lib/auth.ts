import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { SITE_ORIGIN } from './site';

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
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
