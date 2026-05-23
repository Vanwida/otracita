import { randomBytes } from 'node:crypto';

// -----------------------------------------------------------------------------
// Token de invitación — 32 bytes random hex (64 chars), igual que el
// modelo viejo. Sin firma porque la DB ya es la fuente de verdad
// (`barber_invites.token` unique + `expiresAt` + `revokedAt`).
// -----------------------------------------------------------------------------

/** Genera un token URL-safe de 64 chars (32 bytes hex). */
export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

/** Default TTL de una invitación: 7 días. */
export const INVITE_TTL_DAYS = 7;
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

export function inviteExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}
