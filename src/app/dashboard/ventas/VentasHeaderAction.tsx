'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'

// -----------------------------------------------------------------------------
// VentasHeaderAction — qué ocupa la esquina derecha del header del área Ventas.
//
// Por defecto: LA LÍNEA (U-13). El fallo del día 1 es que el barbero abre
// Ventas buscando cobrar la cita que acaba de hacer, y Ventas es el TPV de
// ventas SUELTAS — el cobro de una cita se hace desde la agenda, pulsando la
// cita. Esa frase tiene que estar visible en el área donde se produce la duda,
// no en un onboarding que ya cerró. Va en el header (chrome del layout) → se ve
// en las 4 pestañas y no toca el layout viewport-locked de ninguna página.
//
// Excepción: /dashboard/ventas/cobros (fuera del nav desde U-13, pero viva y
// enlazada desde Informes → Fiscal) necesita el selector de periodo para
// acotar la ventana de movimientos Stripe.
//
// El gate se hace AQUÍ y no en StatsPeriodTabs porque ese componente lo
// comparten Equipo e Informes — tocarlo cambiaría su comportamiento global.
// -----------------------------------------------------------------------------

/** Rutas del área Ventas que sí quieren el selector de periodo en el header. */
const PERIOD_ROUTES = new Set(['/dashboard/ventas/cobros'])

export default function VentasHeaderAction() {
  const pathname = usePathname()

  if (PERIOD_ROUTES.has(pathname)) return <StatsPeriodTabs />

  return (
    <Link
      href="/dashboard/agenda"
      className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-2 transition-colors hover:border-brand hover:text-ink"
    >
      <CalendarDays className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
      <span>
        El cobro de una cita se hace{' '}
        <span className="font-semibold text-ink">desde la agenda</span>
      </span>
    </Link>
  )
}
