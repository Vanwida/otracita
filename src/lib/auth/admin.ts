// -----------------------------------------------------------------------------
// Single source of truth for the admin gate.
//
// Historically the rule was duplicated across four places (`require-admin.ts`,
// `require-client-access.ts`, `src/app/admin/layout.tsx`, `src/app/dashboard/layout.tsx`)
// and each copy had drifted — one used `email.includes('aistudios')` which
// would accept a lookalike domain like `aistudios-scam@evil.com`. All admin
// checks MUST go through this helper.
//
// Rule:
//  - email ends with "@aistudios.pro" (domain allow-list), OR
//  - email contains the substring "alex" (operator personal addresses), OR
//  - the session carries `role === 'ADMIN'` on the user.
// -----------------------------------------------------------------------------

/** Email domains that are considered admins. */
const ADMIN_EMAIL_DOMAINS = ['@aistudios.pro'] as const;

/** Case-insensitive substrings that match operator personal addresses. */
const ADMIN_EMAIL_SUBSTRINGS = ['alex'] as const;

/** Minimal shape the admin check needs from Better Auth's session. */
export interface AdminSessionInput {
  user?: {
    email?: string | null;
    role?: string | null;
  } | null;
}

/**
 * Returns true when the session belongs to an admin operator.
 * Accepts a nullable session to keep call sites concise.
 *
 * NOTE: Keep this rule synchronous and free of I/O — it's hot-path on every
 * dashboard/admin page request.
 */
export function isAdminUser(session: AdminSessionInput | null | undefined): boolean {
  const user = session?.user;
  if (!user) return false;

  const rawEmail = typeof user.email === 'string' ? user.email : '';
  const email = rawEmail.toLowerCase();

  if (email) {
    if (ADMIN_EMAIL_DOMAINS.some((domain) => email.endsWith(domain))) return true;
    if (ADMIN_EMAIL_SUBSTRINGS.some((needle) => email.includes(needle))) return true;
  }

  if (user.role === 'ADMIN') return true;

  return false;
}

/**
 * Thin convenience over `isAdminUser` for call sites that only have an email
 * string (e.g. webhook-authenticated routes resolving a user by email). Keeps
 * the rule in one place.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  return isAdminUser({ user: { email: email ?? null } });
}
