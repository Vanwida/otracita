'use client'

import { usePathname } from 'next/navigation'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'

// -----------------------------------------------------------------------------
// VentasHeaderAction — gate del selector de periodo SOLO para el área Ventas.
//
// Ventas comparte chrome (AreaShell) entre 8 pestañas, pero el selector de
// periodo solo tiene sentido en las que son informe con ventana temporal
// (Resumen, Cobros). En Nueva venta (TPV), Transacciones, Cierre de caja y
// Facturas el selector confunde — esas tienen su propia ventana o no la
// necesitan. Patrón Booksy literal: el TPV "Nueva venta" (10.00.16) no
// muestra selector de periodo en el header.
//
// Se hace AQUÍ y no en StatsPeriodTabs porque ese componente lo comparten
// Equipo e Informes — tocarlo cambiaría su comportamiento global. Este gate
// es local al layout de Ventas.
// -----------------------------------------------------------------------------

const PERIOD_ROUTES = new Set([
  '/dashboard/ventas/resumen',
  '/dashboard/ventas/cobros',
])

export default function VentasHeaderAction() {
  const pathname = usePathname()
  if (!PERIOD_ROUTES.has(pathname)) return null
  return <StatsPeriodTabs />
}
