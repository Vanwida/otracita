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
//  - email is in the exact operator allow-list (env ADMIN_EMAILS), OR
//  - the session carries `role === 'ADMIN'` on the user.
//
// SECURITY: la regla antigua aceptaba cualquier email que CONTUVIERA la
// subcadena "alex". Con el signup público de Better Auth (autoSignIn, sin
// disableSignUp), alguien se registraba como `alexandra@gmail.com` y obtenía
// admin global → fuga cross-tenant de TODAS las barberías. Ahora es match
// EXACTO contra una allow-list, nunca por subcadena.
// -----------------------------------------------------------------------------

/** Email domains that are considered admins (operator company domain). */
const ADMIN_EMAIL_DOMAINS = ['@aistudios.pro'] as const;

/**
 * Allow-list EXACTA de emails operadores. Fuente: env `ADMIN_EMAILS`
 * (separada por comas, p.ej. "alexsole@gmail.com,reni@otracita.es"). El email
 * del owner se incluye SIEMPRE como red de seguridad para no quedar bloqueado
 * si la env var no está puesta en algún entorno. Match exacto, nunca subcadena.
 */
const OWNER_FALLBACK_EMAILS = ['alexsole@gmail.com'];
const ADMIN_EMAIL_ALLOWLIST = new Set<string>(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .concat(OWNER_FALLBACK_EMAILS),
);

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
    if (ADMIN_EMAIL_ALLOWLIST.has(email)) return true;
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
