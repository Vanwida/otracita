// -----------------------------------------------------------------------------
// Permisos granulares por barbero (#72) — catálogo + helpers.
//
// Cada `user` con role='barber' nace como OPERATOR puro (isManager=false):
// solo ve sus citas/ventas/propinas y cobra lo suyo. El dueño (admin) puede
// elevarlo a MANAGER y activar individualmente cada permiso del catálogo
// (`MANAGER_PERMISSION_KEYS`) desde el editor del barbero en `/dashboard/equipo`.
//
// Los permisos se evalúan en runtime con `hasManagerPermission(user, perm)`:
//   · isManager=false  → siempre false (operator puro).
//   · isManager=true   → true si la clave está en `managerPermissions`.
//
// Los endpoints/páginas que se gateen deben usar `requireManagerPermission`
// (guard.ts) — nunca confiar en input del cliente. La lista canónica:
//
//   view_finances        Ver ingresos brutos del local (no por barbero).
//   view_commissions     Ver comisiones globales del equipo.
//   edit_team_clients    Ver/editar clientes del equipo (no solo los suyos).
//   edit_others_bookings Crear/editar citas de otros barberos del local.
//   edit_services        Editar servicios del catálogo (precio/duración).
//   close_register       Cerrar caja del día.
//   mark_tips_paid       Marcar propinas tarjeta como pagadas al equipo.
//
// Stripe / SumUp / plan / Ajustes técnicos quedan SIEMPRE admin-only — no
// existe permiso granular para ellos.
// -----------------------------------------------------------------------------

export const MANAGER_PERMISSION_KEYS = [
  'view_finances',
  'view_commissions',
  'edit_team_clients',
  'edit_others_bookings',
  'edit_services',
  'close_register',
  'mark_tips_paid',
] as const;

export type ManagerPermission = (typeof MANAGER_PERMISSION_KEYS)[number];

export const MANAGER_PERMISSION_LABELS: Record<ManagerPermission, string> = {
  view_finances: 'Ver finanzas del local',
  view_commissions: 'Ver comisiones del equipo',
  edit_team_clients: 'Editar clientes del equipo',
  edit_others_bookings: 'Editar citas de otros barberos',
  edit_services: 'Editar servicios',
  close_register: 'Cerrar caja del día',
  mark_tips_paid: 'Marcar propinas pagadas',
};

export const MANAGER_PERMISSION_HINTS: Record<ManagerPermission, string> = {
  view_finances: 'Ingresos brutos del local por periodo. No incluye desglose por barbero.',
  view_commissions: 'Acceso a comisiones por barbero del equipo.',
  edit_team_clients: 'Acceso completo a la lista de clientes del local.',
  edit_others_bookings: 'Crear/mover/cancelar citas de cualquier barbero.',
  edit_services: 'Cambiar precio, duración y descripción de los servicios.',
  close_register: 'Hacer cierre de caja al final del día.',
  mark_tips_paid: 'Marcar las propinas de tarjeta como liquidadas al equipo.',
};

// -----------------------------------------------------------------------------
// Helpers puros sobre el shape user. Aceptan `unknown` para que no obliguen
// al caller a tipar manualmente; validan en runtime.
// -----------------------------------------------------------------------------

/**
 * Comprueba si un user tiene un permiso manager concreto.
 * - Operator puro (isManager=false) siempre devuelve false.
 * - managerPermissions no array → false (defensa contra datos corruptos).
 */
export function hasManagerPermission(
  user: { isManager?: unknown; managerPermissions?: unknown } | null | undefined,
  perm: ManagerPermission,
): boolean {
  if (!user) return false;
  if (user.isManager !== true) return false;
  if (!Array.isArray(user.managerPermissions)) return false;
  return user.managerPermissions.includes(perm);
}

/** Type-guard: ¿el string es una clave válida del catálogo? */
export function isValidManagerPermission(v: unknown): v is ManagerPermission {
  return (
    typeof v === 'string' &&
    (MANAGER_PERMISSION_KEYS as readonly string[]).includes(v)
  );
}

/**
 * Sanitiza un input arbitrario a un array canónico de permisos:
 *   · Filtra entradas que no sean claves válidas.
 *   · Deduplica.
 *   · Ordena en el orden canónico del catálogo (estable).
 */
export function normalizeManagerPermissions(raw: unknown): ManagerPermission[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<ManagerPermission>();
  for (const v of raw) {
    if (isValidManagerPermission(v)) set.add(v);
  }
  return MANAGER_PERMISSION_KEYS.filter((k) => set.has(k));
}

/**
 * Devuelve el subset de permisos activos del user (vacío si operator puro).
 * Util para UI que pinta el resumen "tiene X permisos".
 */
export function activeManagerPermissions(
  user: { isManager?: unknown; managerPermissions?: unknown } | null | undefined,
): ManagerPermission[] {
  if (!user || user.isManager !== true) return [];
  return normalizeManagerPermissions(user.managerPermissions);
}
