export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { Receipt } from 'lucide-react'
import { db } from '@/db'
import { expenses } from '@/db/schema'
import { and, eq, gte, lt, desc } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import DataTable, { type Column } from '../../_components/DataTable'
import ReportLayout from '../_components/ReportLayout'
import { GASTOS_RAIL } from '../_components/report-rail-config'
import EmptyState from '../../_components/EmptyState'
import { loadReportContext } from '../_report-data'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'
import { categoryLabel } from '@/app/dashboard/finanzas/_components/helpers'
import { formatCents as formatCentsBase } from '@/lib/format'

// -----------------------------------------------------------------------------
// /dashboard/informes/gastos — pestaña GASTOS del área Informes.
//
// Vista de SOLO LECTURA de los gastos variables (tabla `expenses`) filtrables
// por cualquier periodo (Día/Semana/Mes/Año/rango vía StatsPeriodTabs). NO es
// el P&L fiscal mensual de /dashboard/informes — es una lista plana con total
// y desglose por categoría, pensada para revisar "¿cuánto me he gastado y en
// qué?" en el periodo que sea.
//
// `expenses.amountCents` YA está en céntimos (a diferencia de bookings.price).
// El tenant se resuelve de la sesión (loadReportContext), nunca del request.
// Periodo por `?period=` + opcional `?date=`/`?start=&end=`; periodEndIso es
// exclusivo (YYYY-MM-DD), igual que la página de ingresos.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    period?: string
    date?: string
    start?: string
    end?: string
  }>
}

interface ExpenseRow {
  id: string
  date: string
  amountCents: number
  category: string
  notes: string | null
}

function formatCents(cents: number): string {
  return formatCentsBase(cents, { compact: true })
}

/** YYYY-MM-DD → "5 may 2026" (locale es-ES, formato corto). */
function formatDateShort(iso: string): string {
  const [year, mon, day] = iso.split('-').map(Number)
  return new Date(year, mon - 1, day).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function InformesGastosPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(params)

  const dateLo = periodStartIso ?? '0001-01-01'

  const rows = (await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.clientId, client.id),
        gte(expenses.date, dateLo),
        lt(expenses.date, periodEndIso),
      ),
    )
    .orderBy(desc(expenses.date), desc(expenses.createdAt))) as ExpenseRow[]

  const totalCents = rows.reduce((a, r) => a + r.amountCents, 0)

  // Desglose por categoría (orden descendente por importe). Solo categorías
  // con gasto en el periodo entran en las barras.
  const byCategory = new Map<string, number>()
  for (const r of rows) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amountCents)
  }
  const categories = [...byCategory.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents)
  const categoriesBase = totalCents || 1

  const hasData = rows.length > 0

  const columns: Column<ExpenseRow>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (r) => (
        <span className="whitespace-nowrap text-ink-2">
          {formatDateShort(r.date)}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      cell: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-ink">
            {categoryLabel(r.category)}
          </span>
          {r.notes ? (
            <span className="ml-2 text-ink-3">· {r.notes}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      numeric: true,
      cell: (r) => <span className="text-ink">{formatCents(r.amountCents)}</span>,
    },
  ]

  return (
    <AreaShell
      area="informes"
      action={
        <Suspense>
          <StatsPeriodTabs defaultPeriod="month" />
        </Suspense>
      }
    >
      <AreaContent scroll="region" maxWidth="7xl">
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              icon={Receipt}
              title="Sin gastos en este periodo"
              description={`No hay gastos registrados en este ${periodLabel}. Prueba otro periodo arriba a la derecha.`}
            />
          </div>
        ) : (
          <ReportLayout rail={GASTOS_RAIL}>
            {/* Total del periodo. */}
            <section className="panel">
              <header
                className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3"
                style={{ background: 'var(--table-head-bg)' }}
              >
                <h2 className="text-[0.8125rem] font-semibold text-ink">
                  Total · {periodLabel}
                </h2>
                <p className="text-[0.75rem] text-ink-2">
                  {rows.length.toLocaleString('es-ES')}{' '}
                  {rows.length === 1 ? 'gasto' : 'gastos'}
                </p>
              </header>
              <div className="px-[var(--space-card)] py-4">
                <p
                  className="font-bold text-ink tabular-nums leading-none"
                  style={{ fontSize: 'var(--text-figure)' }}
                >
                  {formatCents(totalCents)}
                </p>
              </div>
            </section>

            {/* Desglose por categoría. */}
            <section className="panel">
              <header
                className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3"
                style={{ background: 'var(--table-head-bg)' }}
              >
                <h2 className="text-[0.8125rem] font-semibold text-ink">
                  Por categoría · {periodLabel}
                </h2>
                <p className="text-[0.75rem] text-ink-2">
                  {categories.length}{' '}
                  {categories.length === 1 ? 'categoría' : 'categorías'}
                </p>
              </header>
              <ul className="divide-y divide-line">
                {categories.map((c) => {
                  const pct = Math.round((c.cents / categoriesBase) * 100)
                  return (
                    <li
                      key={c.category}
                      className="flex items-center gap-3 px-[var(--space-card)] py-3"
                    >
                      <span className="w-24 shrink-0 text-[0.8125rem] text-ink-2">
                        {categoryLabel(c.category)}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-[0.8125rem] tabular-nums text-ink">
                        {formatCents(c.cents)}
                        <span className="ml-1 text-[0.6875rem] text-ink-3">
                          {pct}%
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* Lista detallada de gastos. */}
            <section className="panel">
              <header
                className="border-b border-line px-[var(--space-card)] py-3"
                style={{ background: 'var(--table-head-bg)' }}
              >
                <h2 className="text-[0.8125rem] font-semibold text-ink">
                  Detalle de gastos
                </h2>
                <p className="mt-0.5 text-[0.75rem] text-ink-2">
                  Todos los gastos de este periodo, del más reciente al más
                  antiguo.
                </p>
              </header>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                ariaLabel="Detalle de gastos del periodo"
                emptyLabel="Sin gastos en este periodo"
              />
            </section>
          </ReportLayout>
        )}
      </AreaContent>
    </AreaShell>
  )
}
