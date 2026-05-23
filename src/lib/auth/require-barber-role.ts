import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { barbers, clients, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Modo barbero v2 (#71) — guard de sesión Better Auth con role='barber'.
//
// Cada page/endpoint dentro de `/yo/*` o de operaciones del barbero
// debe pasar por aquí. Devuelve la triple {user, barber, client} si la
// sesión es válida y el user es un barbero ACTIVO (no `disabledAt`)
// con `barberId` que resuelve a un `barbers` row también activo.
//
// El motivo de cargar las tres rows: el shell de la app móvil
// muestra nombre/foto del barber, el nombre del negocio (client), y
// muchas operaciones validan ownership contra barber.id + client.id.
// Hacer una sola query orquestada aquí evita 3 round-trips por request.
// -----------------------------------------------------------------------------

export type UserRow = typeof users.$inferSelect;
export type BarberRow = typeof barbers.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;

export type BarberRoleAccess =
  | {
      ok: true;
      user: UserRow;
      barber: BarberRow;
      client: ClientRow;
    }
  | {
      ok: false;
      status: 401 | 403 | 404;
      error: string;
    };

/**
 * Resuelve la sesión del barbero a partir de la cookie Better Auth.
 *
 * Contract:
 *   · Sin sesión / sin user / disabledAt set → 401
 *   · Sesión OK pero role != 'barber'          → 403
 *   · role='barber' pero sin barberId o sin client/barber row → 404
 *   · barber.active = false                    → 403
 */
export async function requireBarberRole(
  request: Request,
): Promise<BarberRoleAccess> {
  const session = await auth.api.getSession({ headers: request.headers });
  const sessionUserId = session?.user?.id ?? null;

  if (!sessionUserId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  // Cargamos el user completo (con role/clientId/barberId/disabledAt).
  // Better Auth `session.user` puede no incluir todos los additionalFields
  // según versión — vamos a DB siempre para tener la fuente fiable.
  const [user] = await db.select().from(users).where(eq(users.id, sessionUserId));
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (user.disabledAt) {
    return { ok: false, status: 401, error: 'Cuenta desactivada.' };
  }
  if (user.role !== 'barber') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (!user.barberId || !user.clientId) {
    return { ok: false, status: 404, error: 'Cuenta sin barbero asignado.' };
  }

  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, user.barberId));
  if (!barber || !barber.active) {
    return { ok: false, status: 403, error: 'Acceso revocado.' };
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, user.clientId));
  if (!client) {
    return { ok: false, status: 404, error: 'Negocio no encontrado.' };
  }

  return { ok: true, user, barber, client };
}

/** Helper para convertir un fallo de acceso en una Response JSON. */
export function barberRoleErrorResponse(
  access: Extract<BarberRoleAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status });
}
