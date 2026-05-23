export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight, Settings } from 'lucide-react'
import AreaContent from '../../_components/AreaContent'
import OnlinePaymentsSummary from '../../_components/OnlinePaymentsSummary'
import { loadVentasData } from '../_data'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'

// -----------------------------------------------------------------------------
// /dashboard/ventas/cobros — pestaña COBROS del área Ventas (OPERATIVA).
//
// Qué ha entrado de tus clientes (Stripe Connect): total del mes + últimos
// movimientos. NO contiene configuración: la config canónica de cobros
// (caja efectivo, SumUp, Stripe Connect, datos fiscales) vive en Ajustes →
// Pagos — un solo editor por campo (DRY, regla dura). Aquí solo se ve y se
// enlaza a configurar.
//
// LÓGICA DE SERVIDOR INTACTA: el client se resuelve igual (loadVentasData);
// OnlinePaymentsSummary consume el mismo endpoint /api/payments/summary.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string; date?: string; start?: string; end?: string }>
}

export default async function VentasCobrosPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('ventas-cobros')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client } = await loadVentasData(params)

  return (
    <AreaContent scroll="region" maxWidth="5xl">
      <OnlinePaymentsSummary connectStatus={client.stripeConnectStatus} />

      <Link
        href="/dashboard/ajustes/pagos"
        className="mt-6 flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors hover:border-brand"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Settings className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-ink">
              Configurar cobros
            </p>
            <p className="mt-0.5 text-[0.75rem] text-ink-2">
              Caja efectivo, datáfono SumUp, Stripe Connect y datos fiscales —
              en Ajustes → Pagos.
            </p>
          </div>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-ink-2"
          aria-hidden="true"
        />
      </Link>
    </AreaContent>
  )
}
