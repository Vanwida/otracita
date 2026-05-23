import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { clients, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isAdminUser } from '@/lib/auth/admin';
import type { ManagerPermission } from '@/lib/manager-permissions';

// -----------------------------------------------------------------------------
// requireTenantActor — guard COMPARTIDO admin+barber-role para endpoints que
// el modo barbero (`/yo/*`) y el dashboard admin reusan (agenda, ventas,
// crear cita…).
//
// A diferencia de `requireClientAccess` (que resuelve client SOLO por email
// del owner del tenant), este helper acepta también a un user con
// `role='barber'` y resuelve el tenant via `users.clientId` — el campo que
// se setea al aceptar la invitación.
//
// Devuelve además los campos del actor (isAdmin, barberId, isManager,
// managerPermissions) para que el caller pueda hacer los checks de
// ownership / permiso adicionales que correspondan (p. ej. forzar
// barberId=own en creación, o exigir `edit_others_bookings` para PATCH
// ajeno). Este helper NO hace ese check: solo identifica al actor.
// -----------------------------------------------------------------------------

export type ClientRow = typeof clients.$inferSelect;

export type TenantActorAccess =
  | {
      ok: true;
      client: ClientRow;
      user: { id: string; email: string };
      /** `true` si el caller es admin (sin restricción de ownership). */
      isAdmin: boolean;
      /** Para role='barber', el `barbers.id` del actor. null para admins. */
      barberId: string | null;
      /** Para role='barber', si el flag manager está activo. false para admin. */
      isManager: boolean;
      /** Claves de permisos manager activas (vacío para admin u operator puro). */
      managerPermissions: ManagerPermission[];
    }
  | {
      ok: false;
      status: 401 | 403 | 404;
      error: string;
    };

/**
 * Resuelve el tenant + actor a partir de la sesión Better Auth.
 *
 * Contract:
 *  · Sin sesión / sin email → 401
 *  · Admin: se resuelve client por email (igual que requireClientAccess).
 *  · role='barber': se resuelve client via `users.clientId`.
 *  · Sin client resoluble → 404.
 *  · Cuenta desactivada (`users.disabledAt`) → 401.
 */
export async function requireTenantActor(
  request: Request,
): Promise<TenantActorAccess> {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;

  if (!email || !userId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (user.disabledAt) {
    return { ok: false, status: 401, error: 'Cuenta desactivada.' };
  }

  const isAdmin = isAdminUser(session);

  // Admin: resolver client por email (su tenant principal). Si no tiene
  // tenant propio (operador puro de Anthropic), 404 — los admins puros
  // deberían usar `requireClientAccess({expectedClientId})` para
  // impersonar; este helper es para el flujo "soy parte del tenant".
  if (isAdmin) {
    const [own] = await db
      .select()
      .from(clients)
      .where(eq(clients.email, email));
    if (!own) {
      return { ok: false, status: 404, error: 'Tenant no encontrado.' };
    }
    return {
      ok: true,
      client: own,
      user: { id: userId, email },
      isAdmin: true,
      barberId: null,
      isManager: false,
      managerPermissions: [],
    };
  }

  // role='barber': resolver client via users.clientId. NUNCA por email
  // (el email del barbero no coincide con clients.email del owner).
  if (user.role === 'barber') {
    if (!user.clientId) {
      return { ok: false, status: 403, error: 'Cuenta sin tenant asignado.' };
    }
    const [tenant] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, user.clientId));
    if (!tenant) {
      return { ok: false, status: 404, error: 'Tenant no encontrado.' };
    }

    const isManager = user.isManager === true;
    const managerPermissions = isManager
      ? ((user.managerPermissions ?? []) as ManagerPermission[])
      : [];

    return {
      ok: true,
      client: tenant,
      user: { id: userId, email },
      isAdmin: false,
      barberId: user.barberId ?? null,
      isManager,
      managerPermissions,
    };
  }

  // Owner regular (no admin, no barber): resolver por email (mismo que
  // requireClientAccess). Cubre el dueño del negocio sin role='admin'.
  const [own] = await db.select().from(clients).where(eq(clients.email, email));
  if (!own) {
    return { ok: false, status: 404, error: 'Tenant no encontrado.' };
  }
  return {
    ok: true,
    client: own,
    user: { id: userId, email },
    isAdmin: false,
    barberId: null,
    isManager: false,
    managerPermissions: [],
  };
}

/** Helper: convierte un fallo de acceso en una Response JSON. */
export function tenantActorErrorResponse(
  access: Extract<TenantActorAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status });
}

/** Sugar: `actor.isAdmin || actor.managerPermissions.includes(key)`. */
export function actorHasManagerPermission(
  actor: Extract<TenantActorAccess, { ok: true }>,
  key: ManagerPermission,
): boolean {
  if (actor.isAdmin) return true;
  return actor.managerPermissions.includes(key);
}
