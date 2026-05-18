import { AREAS, isAreaActive, type Area } from './area-config'
import type { LucideIcon } from 'lucide-react'

// -----------------------------------------------------------------------------
// Nav nivel-1 (rail desktop + bottom-nav móvil) DERIVADO de `area-config`.
//
// `area-config.ts` es la fuente única de verdad de toda la IA del dashboard
// (áreas + pestañas). Este módulo solo expone la vista que el rail necesita
// (href/icon/label + cálculo de "active"), sin duplicar la lista. Renombrar
// o reordenar un área se hace SOLO en `area-config`; el rail lo recoge solo.
//
// Modelo: 6 áreas estándar — Agenda · Ventas · Clientes · Equipo · Informes
// · Marketing · Ajustes. Nomenclatura convencional de software de gestión
// (sin nombres de marca "monos"). El resaltado por prefijos (incl. rutas
// legacy en migración) vive en `area-config.isAreaActive`.
// -----------------------------------------------------------------------------

export interface NavItem {
  href: string
  icon: LucideIcon
  label: string
}

export const NAV_ITEMS: NavItem[] = AREAS.map((a: Area) => ({
  href: a.href,
  icon: a.icon,
  label: a.label,
}))

export function isNavItemActive(itemHref: string, pathname: string): boolean {
  const area = AREAS.find((a) => a.href === itemHref)
  if (!area) return pathname === itemHref || pathname.startsWith(`${itemHref}/`)
  return isAreaActive(area, pathname)
}
