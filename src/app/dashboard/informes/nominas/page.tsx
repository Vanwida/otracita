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
import PayrollMonthView from './PayrollMonthView'

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
            <div className="max-w-md rounded-control border border-line bg-surface p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control border border-brand/20 bg-brand-softer">
                <Lock className="h-5 w-5 text-brand" />
              </div>
              <h2
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Nóminas del equipo
              </h2>
              <p className="mt-2 text-[0.8125rem] text-ink-2">
                Calcula automáticamente lo que cobra cada barbero desde sus
                servicios, productos, propinas y bonos. Disponible en el plan
                Pro.
              </p>
            </div>
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
