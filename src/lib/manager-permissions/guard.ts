import {
  requireBarberRole,
  type BarberRoleAccess,
} from '@/lib/auth/require-barber-role';
import {
  hasManagerPermission,
  type ManagerPermission,
} from './index';

// -----------------------------------------------------------------------------
// requireManagerPermission — wrapper sobre requireBarberRole que además
// exige una clave concreta de MANAGER_PERMISSION_KEYS.
//
// Uso (en una route handler):
//
//   const access = await requireManagerPermission(req, 'view_finances');
//   if (!access.ok) return managerPermissionErrorResponse(access);
//   const { user, barber, client } = access;
//
// Devuelve la triple `{user, barber, client}` cuando OK (idéntica a
// requireBarberRole), o un `{ok:false, status, error}` listo para serializar.
// -----------------------------------------------------------------------------

export type ManagerPermissionAccess = BarberRoleAccess;

export async function requireManagerPermission(
  request: Request,
  perm: ManagerPermission,
): Promise<ManagerPermissionAccess> {
  const access = await requireBarberRole(request);
  if (!access.ok) return access;
  if (!hasManagerPermission(access.user, perm)) {
    return { ok: false, status: 403, error: 'No tienes permiso.' };
  }
  return access;
}

export function managerPermissionErrorResponse(
  access: Extract<ManagerPermissionAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status });
}
