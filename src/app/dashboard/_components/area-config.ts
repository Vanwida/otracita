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
//   Ventas      · Nueva venta · Caja · Facturas · Productos
//   Clientes    · Lista · Atribución        (+ detalle [id]: Info·Citas·Notas)
//   Equipo      · Empleados · Turnos · Comisiones · Bonos · Competición
//   Crecimiento · App · Recepcionista IA · Bot WhatsApp · Promos · Fidelidad · Reseñas · Tracking
//   Informes    · Panel · Actividad · Ingresos · Transacciones · Gastos · Citas
//                 · Clientes · Nóminas · Propinas · Marketing · Fiscal
//   Ajustes     · Negocio · Pagos · Suscripción · Ayuda
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
      { seg: 'lista-espera', label: 'Lista de espera', href: '/dashboard/agenda/lista-espera' },
      { seg: 'importar', label: 'Importar', href: '/dashboard/agenda/importar' },
    ],
    prefixes: ['/dashboard/agenda'],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: ShoppingCart,
    href: '/dashboard/ventas',
    subtitle: 'Cobra lo que no viene de una cita y cuadra el día.',
    // U-13 — CUATRO pestañas, no ocho. Ventas llegó a tener 8 y cuatro
    // hablaban del mismo dinero (Resumen, Cobros, Transacciones, Propinas):
    // el barbero del día 1 abría Ventas y no sabía dónde cobrar. Regla de
    // corte: aquí SOLO vive lo que el barbero HACE con dinero (cobrar,
    // cuadrar, facturar, gestionar stock). Todo lo que solo se MIRA es un
    // informe y vive en Informes.
    //
    //   → Transacciones y Propinas se movieron a Informes (rutas nuevas,
    //     las viejas redirigen).
    //   → Resumen y Cobros salen del nav pero siguen vivos: Resumen se
    //     alcanza desde Caja ("ver otro día") y Cobros desde Informes →
    //     Fiscal y desde Ajustes → Pagos.
    //
    // Nueva venta es la ruta ÍNDICE (seg:null) → al entrar en Ventas caes
    // directo en el TPV, igual que Booksy.
    tabs: [
      { seg: null, label: 'Nueva venta', href: '/dashboard/ventas' },
      { seg: 'caja', label: 'Caja', href: '/dashboard/ventas/caja' },
      { seg: 'facturas', label: 'Facturas', href: '/dashboard/ventas/facturas' },
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
      { seg: 'actividad', label: 'Actividad', href: '/dashboard/informes/actividad' },
      { seg: 'ingresos', label: 'Ingresos', href: '/dashboard/informes/ingresos' },
      // Transacciones y Propinas llegaron desde Ventas (U-13): son dinero que
      // se MIRA, no que se cobra. Ver el comentario del área 'ventas'.
      { seg: 'transacciones', label: 'Transacciones', href: '/dashboard/informes/transacciones' },
      { seg: 'gastos', label: 'Gastos', href: '/dashboard/informes/gastos' },
      { seg: 'citas', label: 'Citas', href: '/dashboard/informes/citas' },
      { seg: 'clientes', label: 'Clientes', href: '/dashboard/informes/clientes' },
      { seg: 'nominas', label: 'Nóminas', href: '/dashboard/informes/nominas' },
      { seg: 'propinas', label: 'Propinas', href: '/dashboard/informes/propinas' },
      { seg: 'marketing', label: 'Marketing', href: '/dashboard/informes/marketing' },
      { seg: 'fiscal', label: 'Fiscal', href: '/dashboard/informes/fiscal' },
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
      { seg: 'bloqueo', label: 'Bloqueo con PIN', href: '/dashboard/ajustes/bloqueo' },
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

/**
 * Breadcrumb derivado para un pathname dado. Single source of truth para
 * cualquier afordance "← Volver" / breadcrumb / parent-link del dashboard.
 *
 * Devuelve:
 *  - `parent`: el ÁREA a la que pertenece la URL (label visible del rail
 *    nivel-1, no la key interna). `href` apunta a la ruta índice del área.
 *  - `current`: el label de la pestaña actual (si la URL coincide con un
 *    tab del área) — para mostrar la jerarquía completa "Área > Pestaña".
 *
 * Match por prefijo más largo (vía `activeArea`) + coincidencia exacta de
 * `tab.href`. Nada se hardcodea: si renombramos "Crecimiento" o movemos
 * una pestaña de área en area-config, todos los breadcrumbs se actualizan
 * automáticamente.
 *
 * Ejemplos:
 *   /dashboard/marketing/whatsapp        → Crecimiento > Bot WhatsApp
 *   /dashboard/app                       → Crecimiento > App
 *   /dashboard/ajustes/recepcionista     → Crecimiento > Recepcionista IA
 *   /dashboard/mi-plan                   → Ajustes > Suscripción
 *   /dashboard/ventas/productos          → Ventas > Productos
 *   /dashboard/informes/propinas         → Informes > Propinas
 *   /dashboard/informes/nominas          → Informes > Nóminas
 *   /dashboard/informes                  → Informes (raíz del área)
 */
export interface Breadcrumb {
  parent: { label: string; href: string } | null
  current: string | null
}

export function breadcrumbFor(pathname: string): Breadcrumb {
  const area = activeArea(pathname)
  if (!area) return { parent: null, current: null }

  // Si el pathname coincide con el href ÍNDICE del área, NO hay un parent
  // útil ("volver a sí mismo" es no-op). `current` = label del área.
  if (pathname === area.href) {
    return { parent: null, current: area.label }
  }

  // Match exacto de href de pestaña (más fiable que comparar segmentos:
  // hay rutas legacy donde el href del tab vive fuera del slug del área,
  // p.ej. tab "Recepcionista IA" → /dashboard/ajustes/recepcionista).
  let currentLabel: string | null = null
  let bestLen = -1
  for (const tab of area.tabs) {
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      if (tab.href.length > bestLen) {
        bestLen = tab.href.length
        currentLabel = tab.label
      }
    }
  }

  return {
    parent: { label: area.label, href: area.href },
    current: currentLabel,
  }
}

/**
 * Render plano de la IA (áreas + pestañas) para inyectar en el system prompt
 * del chat asistente. Single source of truth — si renombramos un área aquí,
 * el bot pasa a usar el nombre nuevo sin tocar el prompt.
 */
export function areasAsPlainText(): string {
  return AREAS.map((a) => {
    const tabs = a.tabs
      .map((t) => `${t.label} (${t.href})`)
      .join(' · ')
    return `- ${a.label} (${a.href}) — ${a.subtitle ?? ''}\n    tabs: ${tabs}`
  }).join('\n')
}
