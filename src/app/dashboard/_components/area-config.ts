// -----------------------------------------------------------------------------
// Config declarativa de ÁREAS y PESTAÑAS — fuente única de verdad de toda la
// information architecture del dashboard (patrón Booksy "Estadísticas e
// informes": rail de iconos a la izquierda + BARRA DE PESTAÑAS HORIZONTAL,
// cada pestaña = una pantalla que cabe en viewport, la página NUNCA scrollea).
//
// Un área = un tab del rail nivel-1. Sus pestañas = nivel-2 (rutas anidadas:
// deep-link + botón atrás del navegador funcionan sin estado extra). La
// pestaña `seg: null` es la ruta índice del área (pestaña por defecto).
//
// Nomenclatura ESTÁNDAR — palabras que un barbero no técnico y cualquier
// usuario de software de gestión reconoce al instante. Sin nombres de marca
// "monos" (Caja→Ventas, Crecer→Marketing).
//
// Para añadir/cambiar una pestaña: edítalo AQUÍ + crea la ruta anidada. El
// `<AreaTabs>` y el resaltado del rail consumen esta misma lista — cero
// duplicación.
// -----------------------------------------------------------------------------

import {
  Calendar,
  ShoppingCart,
  Contact,
  Users,
  BarChart3,
  Megaphone,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface AreaTab {
  /** Segmento de ruta hija. `null` = ruta índice del área (pestaña por defecto). */
  seg: string | null
  label: string
  /** Href absoluto al que navega la pestaña. */
  href: string
}

export interface Area {
  /** Slug raíz del área (segmento bajo /dashboard). */
  key: string
  /** Etiqueta del rail nivel-1 + título de pantalla. */
  label: string
  /** Icono del rail. */
  icon: LucideIcon
  /** Href del rail (= ruta índice del área). */
  href: string
  /** Subtítulo corto bajo el título (panel, no revista — sin párrafos). */
  subtitle?: string
  /** Pestañas horizontales del área. >1 → se renderiza la barra AreaTabs. */
  tabs: AreaTab[]
  /**
   * Prefijos de ruta que pertenecen al área (resaltan el tab del rail).
   * Incluye rutas legacy que aún viven fuera del slug raíz mientras se
   * migran. El primero debe ser `/dashboard/<key>`.
   */
  prefixes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Las 6 áreas. Orden = orden del rail (desktop) y bottom-nav (móvil).
//
//   Agenda     · diario    · operativa (cliente esperando)
//   Ventas     · diario    · cobros · cierre de caja · facturas · productos
//   Clientes   · semanal   · ficha cliente · fidelidad · reseñas
//   Equipo     · mensual   · empleados · turnos · comisiones
//   Informes   · semanal   · panel · ingresos · citas · clientes (stats)
//   Marketing  · semanal   · promos · bot · tienda
//   Ajustes    · raro      · negocio · facturación · app · plan
// ─────────────────────────────────────────────────────────────────────────────

export const AREAS: Area[] = [
  {
    key: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    href: '/dashboard/agenda',
    tabs: [{ seg: null, label: 'Agenda', href: '/dashboard/agenda' }],
    prefixes: ['/dashboard/agenda'],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: ShoppingCart,
    href: '/dashboard/ventas',
    subtitle: 'Cobros, cierre de caja y facturas del día.',
    tabs: [
      { seg: null, label: 'Resumen', href: '/dashboard/ventas' },
      { seg: 'caja', label: 'Cierre de caja', href: '/dashboard/ventas/caja' },
      { seg: 'facturas', label: 'Facturas', href: '/dashboard/ventas/facturas' },
      { seg: 'cobros', label: 'Cobros', href: '/dashboard/ventas/cobros' },
    ],
    prefixes: [
      '/dashboard/ventas',
      '/dashboard/caja',
      '/dashboard/facturas',
    ],
  },
  {
    key: 'clientes',
    label: 'Clientes',
    icon: Contact,
    href: '/dashboard/clientes',
    subtitle: 'Ficha de cliente, fidelidad y reseñas.',
    // Hrefs = rutas reales (hermanas legacy, sin migrar a nested para no
    // arriesgar los enlaces internos). AreaTabs resuelve el activo por
    // prefix-match del pathname, así que funciona igual.
    tabs: [
      { seg: null, label: 'Clientes', href: '/dashboard/clientes' },
      { seg: 'fidelidad', label: 'Fidelidad', href: '/dashboard/fidelidad' },
      { seg: 'resenas', label: 'Reseñas', href: '/dashboard/resenas' },
    ],
    prefixes: [
      '/dashboard/clientes',
      '/dashboard/fidelidad',
      '/dashboard/resenas',
    ],
  },
  {
    key: 'equipo',
    label: 'Equipo',
    icon: Users,
    href: '/dashboard/equipo',
    subtitle: 'Quién está, cómo cobra y qué tiene activo este mes.',
    tabs: [
      { seg: null, label: 'Empleados', href: '/dashboard/equipo' },
      { seg: 'turnos', label: 'Turnos', href: '/dashboard/equipo/turnos' },
      { seg: 'comisiones', label: 'Comisiones', href: '/dashboard/equipo/comisiones' },
      { seg: 'bonos', label: 'Bonos', href: '/dashboard/equipo/bonos' },
      { seg: 'nominas', label: 'Nóminas', href: '/dashboard/equipo/nominas' },
    ],
    prefixes: ['/dashboard/equipo'],
  },
  {
    key: 'informes',
    label: 'Informes',
    icon: BarChart3,
    href: '/dashboard/informes',
    subtitle: 'Tu P&L real: ingresos, gastos, IVA y beneficio.',
    // Una sola vista: el P&L. FinanzasClient es una herramienta
    // autocontenida viewport-locked con header propio (mes + imprimir);
    // no se tabula para no inventar datos ni operar sobre un componente
    // de 91KB. Cuando existan reports Booksy (Ingresos/Citas/Clientes con
    // sus queries) se añaden aquí como pestañas.
    tabs: [{ seg: null, label: 'Panel', href: '/dashboard/informes' }],
    prefixes: [
      '/dashboard/informes',
      '/dashboard/finanzas',
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    href: '/dashboard/marketing',
    subtitle: 'Promociones, bot de WhatsApp y tienda online.',
    tabs: [
      { seg: null, label: 'Promociones', href: '/dashboard/marketing' },
      { seg: 'bot', label: 'Bot WhatsApp', href: '/dashboard/bot' },
      { seg: 'tienda', label: 'Tienda', href: '/dashboard/marketing/tienda' },
    ],
    prefixes: [
      '/dashboard/marketing',
      '/dashboard/crecer',
      '/dashboard/bot',
    ],
  },
  {
    key: 'ajustes',
    label: 'Ajustes',
    icon: Settings,
    href: '/dashboard/ajustes',
    subtitle: 'Configuración del negocio. Lo defines una vez y se queda así.',
    // Hrefs = rutas reales (no nested aún). El índice es una rejilla de
    // cards Booksy (09.53.25) que funciona como drill-down; las pestañas
    // dan navegación directa al mismo destino.
    tabs: [
      { seg: null, label: 'General', href: '/dashboard/ajustes' },
      { seg: 'negocio', label: 'Negocio', href: '/dashboard/negocio' },
      { seg: 'app', label: 'App', href: '/dashboard/app' },
      { seg: 'plan', label: 'Plan', href: '/dashboard/mi-plan' },
      { seg: 'ayuda', label: 'Ayuda', href: '/dashboard/ayuda' },
    ],
    prefixes: [
      '/dashboard/ajustes',
      '/dashboard/negocio',
      '/dashboard/app',
      '/dashboard/mi-plan',
      '/dashboard/ayuda',
    ],
  },
]

/** Lookup por key. */
export const AREA_BY_KEY: Record<string, Area> = Object.fromEntries(
  AREAS.map((a) => [a.key, a]),
)

/** True si `pathname` cae dentro del área (para resaltar el rail nivel-1). */
export function isAreaActive(area: Area, pathname: string): boolean {
  return area.prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

/** True si `seg` (de useSelectedLayoutSegment) corresponde a esta pestaña. */
export function isAreaTabActive(tab: AreaTab, segment: string | null): boolean {
  return tab.seg === segment
}
