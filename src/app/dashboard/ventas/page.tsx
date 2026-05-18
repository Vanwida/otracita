export const dynamic = 'force-dynamic'

import { Heart, CalendarCheck, ShoppingBag, Wallet } from 'lucide-react'
import AreaContent from '../_components/AreaContent'
import StatStrip, { type Stat } from '../_components/StatStrip'
import { computeTrend } from '../_components/KpiCard'
import BarberBreakdown from '../caja/BarberBreakdown'
import { loadVentasData } from './_data'
import { formatEuros, pluralizeEs } from '@/lib/i18n/plural-es'

// -----------------------------------------------------------------------------
// /dashboard/ventas — pestaña RESUMEN (ruta índice del área Ventas).
//
// Patrón Booksy "Panel de control" (09.48.41): tira de KPIs + desglose,
// todo cabe en pantalla. El chrome (título "Ventas" + periodo + pestañas)
// vive en `ventas/layout.tsx`. Esta página solo aporta el contenido.
//
// LÓGICA DE SERVIDOR INTACTA: los KPIs salen de `loadVentasData`, que es el
// mismo bloque de queries del antiguo `caja/page.tsx` extraído 1:1. Privacidad
// igual: Ventas es de ENTRADA EXPLÍCITA (click en el rail), nunca por defecto.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function VentasResumenPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const d = await loadVentasData(rawPeriod)

  const stats: Stat[] = [
    {
      label: `Facturado · ${d.periodLabel}`,
      value: d.billedEur > 0 ? formatEuros(d.billedEur) : '—',
      icon: Wallet,
      trend: computeTrend(d.billedEur, d.billedPrev),
    },
    {
      label: 'Servicios',
      value: d.completedCount.toLocaleString('es-ES'),
      icon: CalendarCheck,
      trend: computeTrend(d.completedCount, d.completedPrev),
      hint:
        d.completedCount > 0
          ? `Ticket medio ${formatEuros(d.ticketMedio)}`
          : undefined,
    },
    {
      label: 'Productos',
      value: d.upsellsEur > 0 ? formatEuros(d.upsellsEur) : '—',
      icon: ShoppingBag,
      hint:
        d.upsellsCount > 0
          ? pluralizeEs(d.upsellsCount, 'venta', 'ventas')
          : undefined,
    },
    {
      label: 'Propinas',
      value: d.tipsEur > 0 ? formatEuros(d.tipsEur) : '—',
      icon: Heart,
      trend: computeTrend(d.tipsEur, d.tipsPrevEur),
    },
  ]

  return (
    <AreaContent scroll="region" maxWidth="7xl">
      {/* KPI strip denso — protagonista del periodo. */}
      <StatStrip stats={stats} ariaLabel="Resumen financiero del periodo" />

      {/* Desglose por barbero — solo si hay ≥2 barberos activos. */}
      <div className="mt-6">
        <BarberBreakdown
          clientId={d.client.id}
          periodStartIso={d.periodStartIso}
        />
      </div>
    </AreaContent>
  )
}
