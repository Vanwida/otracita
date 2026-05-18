export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { Coins, Lock } from 'lucide-react'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import Payroll from '../../finanzas/Payroll'

// -----------------------------------------------------------------------------
// /dashboard/informes/nominas — pestaña NÓMINAS del área Informes.
//
// Contrato de IA: las Nóminas (lo que cobra cada barbero, parte del P&L)
// viven en Informes, no en Equipo. Movido 1:1 desde equipo/nominas — misma
// query (computeMonthlyPayroll vía /api/finanzas/payroll), mismo gate
// `controlFinanciero`, mismo mes Madrid. /dashboard/equipo/nominas redirige
// aquí. LÓGICA DE SERVIDOR INTACTA.
// -----------------------------------------------------------------------------

function currentMonthMadrid(): string {
  const iso = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Madrid',
  })
  return iso.slice(0, 7)
}

export default async function InformesNominasPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const payrollEnabled = hasFeature(client, 'controlFinanciero')
  const month = currentMonthMadrid()

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
        <div className="mb-3">
          <h2
            className="flex items-center gap-2 font-semibold text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            <Coins className="h-4 w-4 text-brand" />
            Nóminas del mes
          </h2>
          <p
            className="mt-0.5 text-ink-2"
            style={{ fontSize: 'var(--text-meta)' }}
          >
            Lo que cobra cada barbero este mes, desde servicios facturados,
            productos, propinas y bonos. Plegado por barbero — click para el
            desglose línea por línea.
          </p>
        </div>
        <Payroll month={month} />
      </AreaContent>
    </AreaShell>
  )
}
