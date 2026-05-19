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
// Patrón Booksy "Empleados" (10.16.45 / 10.16.58): MASTER-DETAIL — lista
// buscable del equipo a la izquierda, detalle del seleccionado a la derecha.
// El ex-Booksy abre Equipo y reconoce el mismo modelo (solo nuestros
// colores), en vez del acordeón de tarjetas apiladas de antes.
//
// El split llena el frame del área (la página NUNCA scrollea — regla
// AreaShell; el master y el detalle hacen su propio scroll interno). El
// "Rendimiento del equipo" (BarberBreakdown, requisito V1) se conserva como
// bloque colapsable AL PIE, cerrado por defecto, para no romper el
// viewport-fit del master-detail ni duplicar la query (mismo componente que
// el Resumen de Ventas e Informes).
//
// El selector de periodo es LOCAL a esta pestaña (no en el layout del área:
// Turnos/Comisiones/Bonos/Competición no lo necesitan). Filtra solo el
// desglose; la lista de empleados es atemporal.
//
// LÓGICA DE SERVIDOR INTACTA: mismo resolve de tenant por sesión, mismo
// `hasFeature(client, 'controlFinanciero')` para el flag de payroll. El
// periodo reutiliza el helper puro compartido.
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

  // Catálogo de servicios del local (jsonb, mismo shape que usan
  // comisiones/recepcionista). Lo pasamos al detalle para la asignación
  // "qué servicios hace este barbero" (match por nombre — sin ID estable).
  const rawServices = (client.chatbotServices ?? []) as Array<{
    name?: unknown
    duration?: unknown
    price?: unknown
  }>
  const serviceCatalog = Array.isArray(rawServices)
    ? rawServices
        .map((s) => ({
          name: typeof s?.name === 'string' ? s.name.trim() : '',
          duration: Number(s?.duration) || 0,
          price: Number(s?.price) || 0,
        }))
        .filter((s) => s.name.length > 0)
    : []

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
    <AreaContent scroll="region" maxWidth="full" bleed>
      <div className="flex h-full min-h-0 flex-col p-[var(--space-page)]">
        {/* Master-detail: llena el frame del área. */}
        <div className="min-h-0 flex-1">
          <BarbersManager
            payrollEnabled={payrollEnabled}
            serviceCatalog={serviceCatalog}
          />
        </div>

        {/* Rendimiento del equipo — colapsable, cerrado por defecto. Mismo
            componente que el Resumen de Ventas (BarberBreakdown, una sola
            query, sin duplicar). */}
        <details className="group mt-4 shrink-0 rounded-control border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <span
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Rendimiento del equipo
              </span>
              <span
                className="ml-2 text-ink-2"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                Quién factura más · {periodLabel}
              </span>
            </div>
            <span
              className="shrink-0 text-ink-3 transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <div className="border-t border-line p-4">
            <div className="mb-3 flex justify-end">
              <Suspense>
                <StatsPeriodTabs />
              </Suspense>
            </div>
            <BarberBreakdown
              clientId={client.id}
              periodStartIso={periodStartIso}
              title="Por barbero"
              subtitle="Quién factura más, quién recibe más propinas, quién tiene mejor nota."
              highlightTop
            />
          </div>
        </details>
      </div>
    </AreaContent>
  )
}
