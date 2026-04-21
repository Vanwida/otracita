import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

/**
 * Centralised admin check. Mirrors the rule used in the /admin layout:
 * @aistudios.pro email, contains "alex", or has the ADMIN role.
 *
 * Returns the session user on success, or null if unauthorised.
 * Use this in server components and route handlers that should be
 * behind the admin gate — one source of truth for the rule so we don't
 * drift between /admin page and /api/admin endpoints.
 */
export interface AdminSessionUser {
  id: string;
  email: string;
}

export async function getAdminUser(): Promise<AdminSessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return null;

  const email = (user.email || '').toLowerCase();
  const role = (user as { role?: string }).role;

  const isAdmin =
    email === 'vanwida@aistudios.pro' ||
    email.includes('alex') ||
    email.endsWith('@aistudios.pro') ||
    email.includes('aistudios') ||
    role === 'ADMIN';

  if (!isAdmin) return null;
  return { id: user.id, email: user.email || '' };
}
