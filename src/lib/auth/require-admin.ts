import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { isAdminUser } from '@/lib/auth/admin';

/**
 * Centralised admin check. Thin wrapper over `isAdminUser` that resolves the
 * current Better Auth session from request headers.
 *
 * Returns the session user on success, or null if unauthorised.
 * Use this in server components and route handlers that should be behind
 * the admin gate.
 */
export interface AdminSessionUser {
  id: string;
  email: string;
}

export async function getAdminUser(): Promise<AdminSessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return null;

  if (!isAdminUser(session)) return null;
  return { id: user.id, email: user.email || '' };
}
