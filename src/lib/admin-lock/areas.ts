// -----------------------------------------------------------------------------
// Áreas del dashboard que el jefe puede MARCAR COMO SENSIBLES (admin-lock).
//
// El dashboard vive por defecto en modo barbero (cualquiera del equipo opera
// el iPad tras el login admin inicial). Aquí declaramos qué áreas pueden
// ponerse bajo candado — al tocarlas pedirán el PIN del jefe. Si el jefe NO
// las marca, siguen accesibles a todo el equipo.
//
// Claves estables (NUNCA renombrar — viven en clients.adminLockedAreas jsonb):
// -----------------------------------------------------------------------------

export const ADMIN_LOCKABLE_AREA_KEYS = [
  'informes',
  'equipo-comisiones',
  'equipo-bonos',
  'ventas-facturas',
  'ventas-cobros',
  'ajustes',
  'mi-plan',
  'admin',
] as const

export type AdminLockableAreaKey = (typeof ADMIN_LOCKABLE_AREA_KEYS)[number]

export const ADMIN_LOCKABLE_AREA_LABELS: Record<AdminLockableAreaKey, string> = {
  informes: 'Informes (P&L, ingresos, nóminas)',
  'equipo-comisiones': 'Equipo — Comisiones',
  'equipo-bonos': 'Equipo — Bonos',
  'ventas-facturas': 'Ventas — Facturas',
  'ventas-cobros': 'Ventas — Cobros',
  ajustes: 'Ajustes (negocio, pagos, plan)',
  'mi-plan': 'Mi plan / Suscripción',
  admin: 'Panel admin',
}

export function isAdminLockableAreaKey(value: unknown): value is AdminLockableAreaKey {
  return (
    typeof value === 'string' &&
    (ADMIN_LOCKABLE_AREA_KEYS as readonly string[]).includes(value)
  )
}

/**
 * Normaliza el jsonb crudo a un Set de keys válidas (filtra basura).
 * Vacío / null / inválido → Set vacío (nada bloqueado).
 */
export function normalizeLockedAreas(raw: unknown): Set<AdminLockableAreaKey> {
  if (!Array.isArray(raw) || raw.length === 0) return new Set()
  const out = new Set<AdminLockableAreaKey>()
  for (const k of raw) {
    if (isAdminLockableAreaKey(k)) out.add(k)
  }
  return out
}
