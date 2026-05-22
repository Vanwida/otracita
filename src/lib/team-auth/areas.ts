// -----------------------------------------------------------------------------
// Áreas top-level que el dueño puede HABILITAR para el modo equipo.
//
// Espejo declarativo del menú principal (area-config.ts), pero filtrado: las
// claves SENSIBLES que NUNCA se ofrecen al equipo (aunque su área padre esté
// activa) se restringen aparte en el layout — aquí solo declaramos qué
// áreas se pueden tocar a nivel grueso. Las sub-áreas restringidas
// (facturas, nóminas, comisiones, finanzas, configuración técnica) se
// filtran adicionalmente en el render del menú del modo equipo.
// -----------------------------------------------------------------------------

export const TEAM_AREA_KEYS = [
  'agenda',
  'clientes',
  'equipo',
  'ventas',
  'marketing',
  'informes',
  'ajustes',
] as const

export type TeamAreaKey = (typeof TEAM_AREA_KEYS)[number]

export const TEAM_AREA_LABELS: Record<TeamAreaKey, string> = {
  agenda: 'Agenda',
  clientes: 'Clientes',
  equipo: 'Equipo',
  ventas: 'Ventas',
  marketing: 'Crecimiento',
  informes: 'Informes',
  ajustes: 'Ajustes',
}

/** Áreas que NO pueden activarse para el equipo (sólo dueño). */
export const TEAM_AREA_FORBIDDEN: ReadonlySet<TeamAreaKey> = new Set([
  // No exponemos suscripción/pagos/datos fiscales — todo eso vive en
  // Ajustes. Si el dueño activa Ajustes para el equipo, el sub-menú
  // filtrará: no facturas, no Stripe, no nóminas, no comisiones.
])

export function isTeamAreaKey(value: unknown): value is TeamAreaKey {
  return typeof value === 'string' && (TEAM_AREA_KEYS as readonly string[]).includes(value)
}

/**
 * Normaliza un array crudo (lo que viene de DB jsonb) a un Set de keys
 * válidas. Filtra cualquier cosa que no sea reconocida.
 *
 * Regla de mínima sorpresa: array vacío / null / inválido → SOLO "agenda".
 * El dueño activa el acceso del equipo y por defecto el equipo solo ve
 * la agenda; tiene que tildar el resto a mano.
 */
export function normalizeAllowedAreas(raw: unknown): Set<TeamAreaKey> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return new Set(['agenda'])
  }
  const out = new Set<TeamAreaKey>()
  for (const k of raw) {
    if (isTeamAreaKey(k) && !TEAM_AREA_FORBIDDEN.has(k)) {
      out.add(k)
    }
  }
  // Si tras filtrar quedó vacío, fallback a agenda — nunca devolvemos
  // "ninguna área", eso bloquearía el login al equipo entero.
  if (out.size === 0) out.add('agenda')
  return out
}
