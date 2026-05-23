export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { Lock } from 'lucide-react'
import { parseMonth } from '@/lib/dashboard/month'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import EmptyState from '../../_components/EmptyState'
import PayrollMonthView from './PayrollMonthView'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'

// -----------------------------------------------------------------------------
// /dashboard/informes/nominas — pestaña NÓMINAS del área Informes.
//
// Contrato de IA: las Nóminas (lo que cobra cada barbero, parte del P&L)
// viven en Informes, no en Equipo. Misma query (computeMonthlyPayroll vía
// /api/finanzas/payroll), mismo gate `controlFinanciero`.
// /dashboard/equipo/nominas redirige aquí. LÓGICA DE SERVIDOR INTACTA.
//
// El mes ya NO está clavado al actual: se navega con MonthStepper en
// PayrollMonthView (mismo patrón que el resto de Informes/Finanzas). El
// servidor solo resuelve el mes inicial desde `?month` (o mes Madrid).
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function InformesNominasPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const { month: rawMonth } = await searchParams

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const payrollEnabled = hasFeature(client, 'controlFinanciero')
  const initialMonth = parseMonth(rawMonth)

  if (!payrollEnabled) {
    return (
      <AreaShell area="informes">
        <AreaContent scroll="fixed" maxWidth="5xl">
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Lock}
              tone="brand"
              title="Nóminas del equipo"
              description="Calcula automáticamente lo que cobra cada barbero desde sus servicios, productos, propinas y bonos. Disponible en el plan Pro."
            />
          </div>
        </AreaContent>
      </AreaShell>
    )
  }

  return (
    <AreaShell area="informes">
      <AreaContent scroll="region" maxWidth="6xl">
        <PayrollMonthView initialMonth={initialMonth} />
      </AreaContent>
    </AreaShell>
  )
}
