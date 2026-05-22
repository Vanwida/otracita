// -----------------------------------------------------------------------------
// Config declarativa de ÁREAS y PESTAÑAS — fuente única de verdad de toda la
// information architecture del dashboard (patrón Booksy "Estadísticas e
// informes": rail de iconos a la izquierda + BARRA DE PESTAÑAS HORIZONTAL,
// cada pestaña = una pantalla que cabe en viewport, la página NUNCA scrollea).
//
// Este fichero ES EL CONTRATO de IA (auditado contra el código real). NO se
// improvisan pestañas: 7 áreas top-level, nombres estándar de software de
// gestión. nav-config deriva de aquí; AreaTabs y el resaltado del rail
// consumen esta misma lista — cero duplicación.
//
//   Agenda      · Día · Semana · Importar
//   Ventas      · Resumen · Cobros · Cierre de caja · Propinas · Facturas · Productos
//   Clientes    · Lista · Atribución        (+ detalle [id]: Info·Citas·Notas)
//   Equipo      · Empleados · Turnos · Comisiones · Bonos · Competición
//   Crecimiento · App · Recepcionista IA · Bot WhatsApp · Promos · Fidelidad · Reseñas · Tracking
//   Informes    · Panel · Ingresos · Citas · Clientes · Nóminas · Marketing
//   Ajustes     · Negocio · Pagos · Reservas online · Suscripción · Ayuda
//
// `/dashboard` → redirige a Agenda (sin "home" en nav). `setup` y `admin`
// viven fuera del nav del barbero.
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
  /** Segmento de ruta (para deep-link). `null` = ruta índice del área. */
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
   * Incluye rutas legacy que aún viven fuera del slug raíz. El primero
   * debe ser `/dashboard/<key>`.
   */
  prefixes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Las 7 áreas. Orden = orden del rail (desktop) y bottom-nav (móvil).
// ─────────────────────────────────────────────────────────────────────────────

export const AREAS: Area[] = [
  {
    key: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    href: '/dashboard/agenda',
    subtitle: 'Tu día y tu semana de un vistazo.',
    // Día/Semana/Mes ya viven como conmutador NATIVO dentro de
    // CalendarView (calendario operativo con drag&drop + SWR keyed por
    // vista): es la misma funcionalidad "Día · Semana" del contrato,
    // renderizada como toggle in-component, no como rutas (forzar rutas
    // rompería el estado/DnD de un componente de ~1850 líneas). La barra
    // de pestañas del área solo añade Importar como hermano navegable.
    tabs: [
      { seg: null, label: 'Calendario', href: '/dashboard/agenda' },
      { seg: 'importar', label: 'Importar', href: '/dashboard/agenda/importar' },
    ],
    prefixes: ['/dashboard/agenda'],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: ShoppingCart,
    href: '/dashboard/ventas',
    subtitle: 'Cobra, mira lo vendido y cuadra caja.',
    // Los 4 PRIMEROS son el set Booksy literal ("Nueva venta · Transacciones
    // · Cierre de caja · Facturas") para que un barbero que viene de Booksy
    // encuentre lo de siempre en el mismo orden. Nueva venta es la ruta
    // ÍNDICE (seg:null) → al entrar en Ventas cae directo en el TPV, igual
    // que Booksy. Resumen/Cobros/Propinas/Productos quedan como secundarias
    // detrás (siguen existiendo, no se pierde nada).
    tabs: [
      { seg: null, label: 'Nueva venta', href: '/dashboard/ventas' },
      { seg: 'transacciones', label: 'Transacciones', href: '/dashboard/ventas/transacciones' },
      { seg: 'caja', label: 'Cierre de caja', href: '/dashboard/ventas/caja' },
      { seg: 'facturas', label: 'Facturas', href: '/dashboard/ventas/facturas' },
      { seg: 'resumen', label: 'Resumen', href: '/dashboard/ventas/resumen' },
      { seg: 'cobros', label: 'Cobros', href: '/dashboard/ventas/cobros' },
      { seg: 'propinas', label: 'Propinas', href: '/dashboard/ventas/propinas' },
      { seg: 'productos', label: 'Productos', href: '/dashboard/ventas/productos' },
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
    subtitle: 'Tu cartera: quién no viene, quién falla, de dónde vienen.',
    tabs: [
      { seg: null, label: 'Lista', href: '/dashboard/clientes' },
      { seg: 'atribucion', label: 'Atribución', href: '/dashboard/clientes/atribucion' },
      { seg: 'importar', label: 'Importar', href: '/dashboard/clientes/importar' },
    ],
    prefixes: ['/dashboard/clientes'],
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
      { seg: 'competicion', label: 'Competición', href: '/dashboard/equipo/competicion' },
    ],
    prefixes: ['/dashboard/equipo'],
  },
  {
    key: 'informes',
    label: 'Informes',
    icon: BarChart3,
    href: '/dashboard/informes',
    subtitle: 'Tu negocio en números: P&L, ingresos, citas y clientes.',
    tabs: [
      { seg: null, label: 'Panel', href: '/dashboard/informes' },
      { seg: 'ingresos', label: 'Ingresos', href: '/dashboard/informes/ingresos' },
      { seg: 'citas', label: 'Citas', href: '/dashboard/informes/citas' },
      { seg: 'clientes', label: 'Clientes', href: '/dashboard/informes/clientes' },
      { seg: 'nominas', label: 'Nóminas', href: '/dashboard/informes/nominas' },
      { seg: 'marketing', label: 'Marketing', href: '/dashboard/informes/marketing' },
    ],
    prefixes: [
      '/dashboard/informes',
      '/dashboard/finanzas',
    ],
  },
  {
    // key='marketing' preservada — URLs `/dashboard/marketing/*` siguen vivas
    // para no romper deep-links (PWA installs, emails históricos, bookmarks).
    // Solo el label visible cambia a "Crecimiento" (operación, no marca).
    key: 'marketing',
    label: 'Crecimiento',
    icon: Megaphone,
    href: '/dashboard/marketing',
    subtitle: 'Lo que hace que vuelvan más clientes: promos, bot, fidelidad, reseñas.',
    tabs: [
      { seg: 'app', label: 'App', href: '/dashboard/app' },
      { seg: 'recepcionista', label: 'Recepcionista IA', href: '/dashboard/ajustes/recepcionista' },
      { seg: 'whatsapp', label: 'Bot WhatsApp', href: '/dashboard/marketing/whatsapp' },
      { seg: 'promos', label: 'Promos', href: '/dashboard/marketing/promos' },
      { seg: null, label: 'Fidelidad', href: '/dashboard/marketing' },
      { seg: 'resenas', label: 'Reseñas', href: '/dashboard/marketing/resenas' },
      { seg: 'tracking', label: 'Tracking', href: '/dashboard/marketing/tracking' },
    ],
    prefixes: [
      '/dashboard/marketing',
      '/dashboard/crecer',
      '/dashboard/bot',
      '/dashboard/fidelidad',
      '/dashboard/resenas',
      '/dashboard/app',
      '/dashboard/ajustes/recepcionista',
      '/dashboard/voice-test',
    ],
  },
  {
    key: 'ajustes',
    label: 'Ajustes',
    icon: Settings,
    href: '/dashboard/ajustes',
    subtitle: 'Configuración del negocio. Lo defines una vez y se queda así.',
    tabs: [
      { seg: null, label: 'Negocio', href: '/dashboard/ajustes' },
      { seg: 'pagos', label: 'Pagos', href: '/dashboard/ajustes/pagos' },
      { seg: 'reservas', label: 'Reservas online', href: '/dashboard/ajustes/reservas' },
      { seg: 'suscripcion', label: 'Suscripción', href: '/dashboard/mi-plan' },
      { seg: 'ayuda', label: 'Ayuda', href: '/dashboard/ayuda' },
    ],
    prefixes: [
      '/dashboard/ajustes',
      '/dashboard/negocio',
      '/dashboard/mi-plan',
      '/dashboard/ayuda',
    ],
  },
]

/** Lookup por key. */
export const AREA_BY_KEY: Record<string, Area> = Object.fromEntries(
  AREAS.map((a) => [a.key, a]),
)

/**
 * Devuelve el área a resaltar en el rail nivel-1 para un pathname dado.
 *
 * Match por prefijo MÁS LARGO (más específico gana). Necesario porque
 * algunas sub-rutas legacy viven dentro del slug de otra área (p.ej.
 * `/dashboard/ajustes/recepcionista` pertenece al área "Crecimiento"
 * aunque la URL esté bajo `/dashboard/ajustes/`). Sin esta resolución,
 * el rail resaltaría DOS áreas a la vez — confuso.
 */
export function activeArea(pathname: string): Area | null {
  let best: { area: Area; len: number } | null = null
  for (const area of AREAS) {
    for (const p of area.prefixes) {
      if (pathname === p || pathname.startsWith(`${p}/`)) {
        if (!best || p.length > best.len) best = { area, len: p.length }
      }
    }
  }
  return best?.area ?? null
}

/** True si `pathname` cae dentro del área (para resaltar el rail nivel-1). */
export function isAreaActive(area: Area, pathname: string): boolean {
  return activeArea(pathname)?.key === area.key
}

/** True si `seg` (de useSelectedLayoutSegment) corresponde a esta pestaña. */
export function isAreaTabActive(tab: AreaTab, segment: string | null): boolean {
  return tab.seg === segment
}
