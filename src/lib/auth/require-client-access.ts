import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Multi-tenancy access guard.
//
// Every authenticated API route that reads or mutates tenant data MUST go
// through one of these helpers so that we never trust a clientId supplied by
// the caller. The source of truth is Better Auth's session -> user.email, which
// we use to resolve the owning client record.
//
// Webhook routes (WhatsApp, Postmark, Stripe) bypass this because they
// authenticate via other mechanisms (signed payloads, per-tenant inbound
// addresses, signed events). Cron routes bypass via CRON_SECRET.
// -----------------------------------------------------------------------------

// Admin allow-list: these operators can act on any tenant. Matches the check
// used in `src/app/admin/layout.tsx`.
const ADMIN_EMAIL_DOMAINS = ['@aistudios.pro'] as const;
const ADMIN_EMAIL_SUBSTRINGS = ['alex'] as const;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (ADMIN_EMAIL_DOMAINS.some((d) => lower.endsWith(d))) return true;
  if (ADMIN_EMAIL_SUBSTRINGS.some((s) => lower.includes(s))) return true;
  return false;
}

export type ClientRow = typeof clients.$inferSelect;

export type ClientAccess =
  | {
      ok: true;
      client: ClientRow;
      user: { id: string; email: string };
      isAdmin: boolean;
    }
  | {
      ok: false;
      status: 401 | 403 | 404;
      error: string;
    };

interface RequireClientAccessOptions {
  /**
   * Optional clientId coming from the request (query, body, URL). When set,
   * we validate that the authenticated user owns that client — or is an admin.
   */
  expectedClientId?: string | null;
  /**
   * When true, admins without an owned client record still resolve — but only
   * if expectedClientId is provided (we use it to look up the target).
   * Default: true.
   */
  allowAdminImpersonation?: boolean;
}

/**
 * Resolves the tenant (client row) the current session is allowed to act on.
 *
 * Contract:
 *  - No session / no email -> { ok: false, status: 401 }
 *  - Admin email:
 *      - If expectedClientId given -> loads that client by id.
 *      - Else -> falls back to the admin's own client-by-email (if any).
 *      - If neither resolves -> 404.
 *  - Regular user:
 *      - Loads the client by email.
 *      - If missing -> 404.
 *      - If expectedClientId given and doesn't match -> 403.
 */
export async function requireClientAccess(
  request: Request,
  options: RequireClientAccessOptions = {},
): Promise<ClientAccess> {
  const { expectedClientId = null, allowAdminImpersonation = true } = options;

  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;

  if (!email || !userId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const admin = isAdminEmail(email);

  // Admins: prefer the expectedClientId target if provided, else own client.
  if (admin) {
    if (expectedClientId && allowAdminImpersonation) {
      const [target] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, expectedClientId));
      if (!target) {
        return { ok: false, status: 404, error: 'Client not found' };
      }
      return { ok: true, client: target, user: { id: userId, email }, isAdmin: true };
    }

    const [own] = await db
      .select()
      .from(clients)
      .where(eq(clients.email, email));
    if (!own) {
      return { ok: false, status: 404, error: 'Client not found' };
    }
    return { ok: true, client: own, user: { id: userId, email }, isAdmin: true };
  }

  // Regular tenant user: resolve by email only.
  const [own] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, email));

  if (!own) {
    return { ok: false, status: 404, error: 'Client not found' };
  }

  if (expectedClientId && expectedClientId !== own.id) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, client: own, user: { id: userId, email }, isAdmin: false };
}

/**
 * Small helper to convert a failed access result into a JSON Response. Lets
 * route handlers do: `if (!access.ok) return accessErrorResponse(access);`.
 */
export function accessErrorResponse(
  access: Extract<ClientAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status });
}
