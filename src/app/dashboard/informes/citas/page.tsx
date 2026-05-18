export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { CalendarCheck, UserX, CalendarX, TrendingDown } from 'lucide-react'
import { db } from '@/db'
import { bookings, customers } from '@/db/schema'
import { sql } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import StatStrip, { type Stat } from '../../_components/StatStrip'
import DataTable, { type Column } from '../../_components/DataTable'
import { loadReportContext } from '../_report-data'

// -----------------------------------------------------------------------------
// /dashboard/informes/citas — pestaña CITAS del área Informes.
//
// Reemplaza el placeholder con el reporte real de citas, con foco en lo que
// duele: NO-SHOWS y cancelaciones. Tasa no-show %, tasa cancelación %,
// € perdido estimado (nº no-shows × ticket medio del periodo) y ranking de
// clientes con más no-shows (customers.noShows, cartera lifetime). Más
// citas por estado y evolución mensual de completadas (mismas piezas que
// el Panel del operador).
//
// Pura agregación sobre tablas existentes (bookings / customers), cero
// schema nuevo. Tenant resuelto de la sesión. Periodo por `?period=`.
// `bookings.price` está en EUROS (foot-gun); normalizamos a céntimos.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

interface NoShowClientRow {
  name: string
  phone: string
  noShows: number
  cancellations: number
}

function formatCents(cents: number): string {
  const euros = cents / 100
  if (Number.isInteger(euros)) return `${euros.toLocaleString('es-ES')} €`
  return `${euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

const STATUS_META: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  completed: { label: 'Completadas', dot: 'bg-success', text: 'text-success' },
  confirmed: { label: 'Confirmadas', dot: 'bg-brand', text: 'text-brand-strong' },
  no_show: { label: 'No-shows', dot: 'bg-danger', text: 'text-danger' },
  cancelled: { label: 'Canceladas', dot: 'bg-ink-3', text: 'text-ink-2' },
}
const STATUS_ORDER = ['completed', 'confirmed', 'no_show', 'cancelled'] as const

export default async function InformesCitasPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(rawPeriod)

  const dateLo = periodStartIso ?? '0001-01-01'

  // ── Citas por estado + ticket medio del periodo (para el € perdido).
  const [row] =
    (await db
      .execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COALESCE(AVG(price) FILTER (WHERE status = 'completed'), 0) AS ticket_medio_eur
    FROM ${bookings}
    WHERE client_id = ${client.id}
      AND date >= ${dateLo} AND date < ${periodEndIso}
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                completed: number
                confirmed: number
                no_show: number
                cancelled: number
                ticket_medio_eur: string | number
              }[]
            }
          ).rows,
      )) ?? []

  const counts = {
    completed: Number(row?.completed ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    no_show: Number(row?.no_show ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
  }
  const totalCitas =
    counts.completed + counts.confirmed + counts.no_show + counts.cancelled
  const ticketMedioCents = Math.round(
    Number(row?.ticket_medio_eur ?? 0) * 100,
  )

  const noShowPct =
    totalCitas > 0 ? Math.round((counts.no_show / totalCitas) * 100) : 0
  const cancelPct =
    totalCitas > 0 ? Math.round((counts.cancelled / totalCitas) * 100) : 0
  // € perdido estimado: cada no-show es un hueco que pudo facturar el
  // ticket medio del periodo. Estimación honesta, no exacta.
  const lostCents = counts.no_show * ticketMedioCents

  const statusBreakdown = STATUS_ORDER.map((s) => ({
    status: s,
    count: counts[s],
    pct: totalCitas > 0 ? Math.round((counts[s] / totalCitas) * 100) : 0,
  }))

  // ── Ranking clientes con más no-shows (cartera lifetime, customers.noShows).
  const noShowRows =
    (await db
      .execute(sql`
    SELECT
      COALESCE(name, phone) AS name,
      phone,
      COALESCE(no_shows, 0)::int AS no_shows,
      COALESCE(cancellations, 0)::int AS cancellations
    FROM ${customers}
    WHERE client_id = ${client.id}
      AND COALESCE(no_shows, 0) > 0
    ORDER BY no_shows DESC, cancellations DESC
    LIMIT 15
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                name: string
                phone: string
                no_shows: number
                cancellations: number
              }[]
            }
          ).rows,
      )) ?? []

  const noShowClients: NoShowClientRow[] = noShowRows.map((r) => ({
    name: r.name,
    phone: r.phone,
    noShows: Number(r.no_shows),
    cancellations: Number(r.cancellations),
  }))

  // ── Evolución mensual de citas completadas (últimos 12 meses).
  const monthlyRows =
    (await db
      .execute(sql`
    SELECT to_char(date::date, 'YYYY-MM') AS ym,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
    FROM ${bookings}
    WHERE client_id = ${client.id}
      AND date::date >= (${periodEndIso}::date - INTERVAL '12 months')
      AND date < ${periodEndIso}
    GROUP BY ym
    ORDER BY ym ASC
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: { ym: string; completed: number }[]
            }
          ).rows,
      )) ?? []

  const monthly = monthlyRows.map((r) => ({
    ym: r.ym,
    count: Number(r.completed),
  }))
  const monthlyMax = Math.max(1, ...monthly.map((m) => m.count))

  const hasData = totalCitas > 0

  const stats: Stat[] = [
    {
      label: `Citas · ${periodLabel}`,
      value: totalCitas.toLocaleString('es-ES'),
      icon: CalendarCheck,
      hint:
        totalCitas > 0
          ? `${counts.completed} completadas (${statusBreakdown[0].pct}%)`
          : undefined,
    },
    {
      label: 'Tasa no-show',
      value: `${noShowPct}%`,
      icon: UserX,
      hint: `${counts.no_show} de ${totalCitas} citas`,
    },
    {
      label: 'Tasa cancelación',
      value: `${cancelPct}%`,
      icon: CalendarX,
      hint: `${counts.cancelled} canceladas`,
    },
    {
      label: 'Perdido (est.)',
      value: lostCents > 0 ? formatCents(lostCents) : '—',
      icon: TrendingDown,
      hint: 'No-shows × ticket medio',
    },
  ]

  const noShowColumns: Column<NoShowClientRow>[] = [
    {
      key: 'name',
      header: 'Cliente',
      cell: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'cancel',
      header: 'Canceladas',
      align: 'right',
      numeric: true,
      className: 'hidden sm:table-cell',
      cell: (r) => (
        <span className="text-ink-2">
          {r.cancellations.toLocaleString('es-ES')}
        </span>
      ),
    },
    {
      key: 'noshow',
      header: 'No-shows',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="font-semibold text-danger">
          {r.noShows.toLocaleString('es-ES')}
        </span>
      ),
    },
  ]

  return (
    <AreaShell
      area="informes"
      action={
        <Suspense>
          <StatsPeriodTabs />
        </Suspense>
      }
    >
      <AreaContent scroll="region" maxWidth="7xl">
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="max-w-md rounded-control border border-line bg-surface p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control border border-line bg-overlay">
                <CalendarCheck
                  className="h-5 w-5 text-ink-2"
                  aria-hidden="true"
                />
              </div>
              <h2
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Sin datos en este periodo
              </h2>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2">
                No hay citas registradas en este {periodLabel}. Prueba otro
                periodo arriba a la derecha.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <StatStrip
              stats={stats}
              ariaLabel={`Resumen de citas · ${periodLabel}`}
            />

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Citas por estado. */}
              <section className="rounded-control border border-line bg-surface overflow-hidden">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Citas por estado
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    {totalCitas.toLocaleString('es-ES')} citas en total este
                    periodo.
                  </p>
                </header>
                <ul className="divide-y divide-line">
                  {statusBreakdown.map((s) => {
                    const meta = STATUS_META[s.status]
                    return (
                      <li
                        key={s.status}
                        className="flex items-center gap-3 px-[var(--space-card)] py-3"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                          aria-hidden="true"
                        />
                        <span className="flex-1 text-[0.8125rem] text-ink">
                          {meta.label}
                        </span>
                        <span
                          className={`text-[0.8125rem] font-semibold tabular-nums ${meta.text}`}
                        >
                          {s.count.toLocaleString('es-ES')}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-2">
                          {s.pct}%
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {/* Clientes con más no-shows. */}
              <section className="rounded-control border border-line bg-surface overflow-hidden">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Clientes con más no-shows
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Histórico de cartera — los que más huecos te dejan.
                  </p>
                </header>
                <DataTable
                  columns={noShowColumns}
                  rows={noShowClients}
                  rowKey={(r) => r.phone}
                  ariaLabel="Clientes con más no-shows"
                  emptyLabel="Ningún no-show registrado — clientes formales"
                />
              </section>
            </div>

            {/* Evolución mensual de citas completadas. */}
            {monthly.length >= 2 && (
              <section className="rounded-control border border-line bg-surface overflow-hidden">
                <header className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3">
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Citas completadas por mes
                  </h2>
                  <p className="text-[0.75rem] text-ink-2">
                    Últimos {monthly.length} meses
                  </p>
                </header>
                <div className="flex items-end gap-1.5 px-[var(--space-card)] py-4">
                  {monthly.map((m) => (
                    <div
                      key={m.ym}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    >
                      <div className="flex h-24 w-full items-end">
                        <div
                          className="w-full rounded-t bg-brand"
                          style={{
                            height: `${Math.max(2, Math.round((m.count / monthlyMax) * 100))}%`,
                          }}
                          title={`${m.ym}: ${m.count} citas`}
                        />
                      </div>
                      <span className="truncate text-[0.625rem] text-ink-3">
                        {m.ym.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </AreaContent>
    </AreaShell>
  )
}
