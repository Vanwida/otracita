import type { ReportRailItem } from './ReportRail'

// -----------------------------------------------------------------------------
// report-rail-config — sub-reportes curados del rail derecho de Booksy, por
// pestaña de Informes. FUENTE ÚNICA: cada page.tsx importa su lista de aquí,
// cero duplicación de etiquetas/hrefs.
//
// REGLA DURA: solo entran sub-reportes que llevan a un destino REAL y
// filtrado, construible con datos que ya tenemos hoy. Nada de enlaces a
// reportes que no existen (Booksy lista cosas que sí abren; nosotros igual,
// pero sin inventar). Nomenclatura calcada de Booksy (el barbero la
// reconoce: "Lista de clientes", "Inasistencias", "Ventas por servicio").
//
// Destinos reales disponibles hoy:
//   · /dashboard/clientes?status=inactivo|noshow|blocked  (lista filtrada)
//   · /dashboard/clientes?sort=spent|visits|recent        (lista ordenada)
//   · /dashboard/clientes/atribucion                      (origen de clientes)
//   · /dashboard/informes/{ingresos,citas,clientes,marketing} (?period= se
//     arrastra vía carryPeriod para mantener el periodo seleccionado)
//   · /dashboard/ventas/{facturas,productos}              (fiscal / catálogo)
//   · /dashboard/equipo                                   (Empleados: stats)
// -----------------------------------------------------------------------------

// ── CITAS ──────────────────────────────────────────────────────────────────
// Booksy 09.49.19: Resumen de visitas · Lista de reservas · Citas por
// empleados · Cancelaciones · Inasistencias. Curamos las accionables.
export const CITAS_RAIL: ReportRailItem[] = [
  {
    label: 'Inasistencias',
    href: '/dashboard/clientes?status=noshow',
  },
  {
    label: 'Citas por empleados',
    href: '/dashboard/equipo?breakdown=open',
  },
  {
    label: 'Ingresos por citas',
    href: '/dashboard/informes/ingresos',
    carryPeriod: true,
  },
  {
    label: 'Clientes que no vuelven',
    href: '/dashboard/clientes?status=inactivo',
  },
]

// ── INGRESOS ─────────────────────────────────────────────────────────────────
// Booksy 09.51.30: Ventas por servicio · Ventas por producto · Lista de
// ventas · Informe fiscal · Facturas pendientes. Mapeamos a lo real.
export const INGRESOS_RAIL: ReportRailItem[] = [
  {
    label: 'Ventas por producto',
    href: '/dashboard/ventas/productos',
  },
  {
    label: 'Resumen fiscal (IVA/IRPF)',
    href: '/dashboard/informes/fiscal',
  },
  {
    label: 'Ingresos por empleado',
    href: '/dashboard/equipo?breakdown=open',
  },
  {
    label: 'Citas del periodo',
    href: '/dashboard/informes/citas',
    carryPeriod: true,
  },
]

// ── GASTOS ───────────────────────────────────────────────────────────────────
// Vista de gastos por periodo (read-only). Enlaza a los destinos reales más
// próximos: el resumen fiscal (donde el gasto deducible importa), el catálogo
// de ventas por producto y los ingresos del mismo periodo (arrastra `?period=`).
export const GASTOS_RAIL: ReportRailItem[] = [
  {
    label: 'Resumen fiscal (IVA/IRPF)',
    href: '/dashboard/informes/fiscal',
  },
  {
    label: 'Ventas por producto',
    href: '/dashboard/ventas/productos',
  },
  {
    label: 'Ingresos del periodo',
    href: '/dashboard/informes/ingresos',
    carryPeriod: true,
  },
]

// ── CLIENTES ─────────────────────────────────────────────────────────────────
// Booksy 09.50.00: Lista de clientes · Clientes nuevos · Clientes
// habituales · Clientes poco frecuentes · Inasistencias y cancelaciones.
export const CLIENTES_RAIL: ReportRailItem[] = [
  {
    label: 'Lista de clientes',
    href: '/dashboard/clientes',
  },
  {
    label: 'Mejores clientes',
    href: '/dashboard/clientes?sort=spent',
  },
  {
    label: 'Clientes poco frecuentes',
    href: '/dashboard/clientes?status=inactivo',
  },
  {
    label: 'Inasistencias',
    href: '/dashboard/clientes?status=noshow',
  },
  {
    label: 'De dónde vienen',
    href: '/dashboard/clientes/atribucion',
  },
]

// ── MARKETING ────────────────────────────────────────────────────────────────
// No es Booksy Boost (anti-marca). Curamos hacia donde se acciona el
// marketing real de otracita: configurar promos / fidelidad / reseñas.
export const MARKETING_RAIL: ReportRailItem[] = [
  {
    label: 'Configurar promos',
    href: '/dashboard/marketing/promos',
  },
  {
    label: 'Reseñas',
    href: '/dashboard/marketing/resenas',
  },
  {
    label: 'Clientes a recuperar',
    href: '/dashboard/clientes?status=inactivo',
  },
  {
    label: 'De dónde vienen',
    href: '/dashboard/clientes/atribucion',
  },
]
