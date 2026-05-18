// -----------------------------------------------------------------------------
// Config declarativa de sub-tabs (nivel-2 nav) por hub.
//
// Espeja la forma de `nav-config.ts` (nivel-1): una sola fuente de verdad,
// DRY. Cada hub mapea a su barra de pestañas horizontales — el patrón
// Booksy "EMPLEADOS / TURNOS / RECURSOS / COMISIONES" (screenshots
// 09.46.25, 10.17.08).
//
// Implementación = rutas anidadas (decisión de Alex). El `<SubTabs>` usa
// `useSelectedLayoutSegment()` para el estado activo: `seg: null` = la
// ruta índice del hub (pestaña por defecto), `seg: 'turnos'` = el segmento
// de la ruta hija `/dashboard/equipo/turnos`.
//
// Para añadir sub-tabs a otro hub: añade una entrada aquí + el layout.tsx
// del hub que renderiza `<SubTabs hub="..." />`. Nada más.
// -----------------------------------------------------------------------------

export interface SubTab {
  /** Segmento de ruta hija. `null` = ruta índice del hub (pestaña por defecto). */
  seg: string | null
  label: string
  /** Href absoluto al que navega la pestaña. */
  href: string
}

export type SubTabHub = 'equipo'

export const SUB_TABS: Record<SubTabHub, SubTab[]> = {
  equipo: [
    { seg: null, label: 'Empleados', href: '/dashboard/equipo' },
    { seg: 'turnos', label: 'Turnos', href: '/dashboard/equipo/turnos' },
    { seg: 'comisiones', label: 'Comisiones', href: '/dashboard/equipo/comisiones' },
  ],
}

/** True si `seg` (de useSelectedLayoutSegment) corresponde a esta pestaña. */
export function isSubTabActive(tab: SubTab, segment: string | null): boolean {
  return tab.seg === segment
}
