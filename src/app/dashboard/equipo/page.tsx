export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { resolvePeriod, getPeriodStart, PERIOD_OPTIONS } from '@/lib/dashboard/period'
import AreaContent from '../_components/AreaContent'
import BarbersManager from '../_components/BarbersManager'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'
import BarberBreakdown from '../caja/BarberBreakdown'

// -----------------------------------------------------------------------------
// /dashboard/equipo — pestaña EMPLEADOS (ruta índice del área Equipo).
//
// Patrón Booksy "Empleados" (10.16.45): la lista del equipo + su
// RENDIMIENTO. El barbero abre Equipo y ve quién tira del carro (factura,
// propinas, nota, % de cuota) con badge TOP en el que más factura — la
// substancia que el dueño pedía. El desglose es el mismo componente que
// usa el Resumen de Ventas (BarberBreakdown, una sola query, sin duplicar);
// solo se renderiza con ≥2 barberos activos.
//
// El selector de periodo es LOCAL a esta pestaña (no en el layout del área:
// Turnos/Comisiones/Bonos/Competición no lo necesitan y ensuciarlo rompería
// sus headers). Filtra solo el desglose; la lista de empleados es atemporal.
//
// LÓGICA DE SERVIDOR INTACTA: mismo resolve de tenant por sesión, mismo
// `hasFeature(client, 'controlFinanciero')` para el flag de payroll que
// BarbersManager necesita. El periodo reutiliza el helper puro compartido.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function EquipoEmpleadosPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const payrollEnabled = hasFeature(client, 'controlFinanciero')

  // Periodo del desglose por barbero (default "mes": lo que el dueño mira a
  // diario). periodStartIso null = lifetime (sin filtro de fecha).
  const period = resolvePeriod(rawPeriod, 'month')
  const periodStart = getPeriodStart(period, new Date())
  const periodStartIso = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`
    : null
  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.key === period)?.label.toLowerCase() ?? period

  return (
    <AreaContent scroll="region" maxWidth="7xl">
      <BarbersManager payrollEnabled={payrollEnabled} />

      {/* Rendimiento del equipo — mismo componente que el Resumen de
          Ventas (BarberBreakdown). Solo aparece con ≥2 barberos activos:
          con uno es redundante con el resto de la pestaña. */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              Rendimiento del equipo
            </h2>
            <p className="mt-0.5 text-ink-2" style={{ fontSize: 'var(--text-meta)' }}>
              Quién factura más este periodo · {periodLabel}.
            </p>
          </div>
          <div className="shrink-0">
            <Suspense>
              <StatsPeriodTabs />
            </Suspense>
          </div>
        </div>
        <BarberBreakdown
          clientId={client.id}
          periodStartIso={periodStartIso}
          title="Por barbero"
          subtitle="Quién factura más, quién recibe más propinas, quién tiene mejor nota."
          highlightTop
        />
      </div>
    </AreaContent>
  )
}
