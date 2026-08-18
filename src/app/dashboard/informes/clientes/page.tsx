export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { Users, UserPlus, UserCheck, AlertTriangle } from 'lucide-react'
import { db } from '@/db'
import { bookings, customers } from '@/db/schema'
import { sql } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import StatStrip, { type Stat } from '../../_components/StatStrip'
import DataTable, { type Column } from '../../_components/DataTable'
import SourceBreakdown from '../../clientes/SourceBreakdown'
import ReportLayout from '../_components/ReportLayout'
import { CLIENTES_RAIL } from '../_components/report-rail-config'
import EmptyState from '../../_components/EmptyState'
import { loadReportContext } from '../_report-data'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'
import {
  getClientSourceBreakdown,
  sumSourceBreakdown,
} from '@/lib/marketing/sources-breakdown'

// -----------------------------------------------------------------------------
// /dashboard/informes/clientes — pestaña CLIENTES del área Informes.
//
// Reemplaza el placeholder con el reporte real de cartera: quién gasta más,
// quién está en riesgo de no volver, % de retención, mezcla nuevos vs
// habituales y de dónde llegan los nuevos (SourceBreakdown reutilizado).
//
// Pura agregación sobre tablas existentes (bookings / customers), cero
// schema nuevo. Tenant resuelto de la sesión (loadReportContext). El periodo
// (?period=) acota el "top clientes" y "nuevos vs habituales"; "en riesgo"
// y "retención" son métricas de CARTERA (lifetime), no de periodo — un
// cliente está en riesgo por no volver, no por un rango de fechas.
//
// `bookings.price_cents` está en CÉNTIMOS, igual que el resto del schema.
// -----------------------------------------------------------------------------

// Cliente "en riesgo": sin cita desde hace ≥ N días pero con ≥2 citas
// históricas (era recurrente y se ha enfriado — accionable, vale la pena
// recuperarlo). 45 días = ~1,5 ciclos típicos de corte.
const RISK_DAYS = 45

interface PageProps {
  searchParams: Promise<{ period?: string; date?: string; start?: string; end?: string }>
}

interface TopClientRow {
  name: string
  phone: string
  count: number
  cents: number
}

interface RiskRow {
  name: string
  phone: string
  totalBookings: number
  daysSince: number
}

import { formatCents as formatCentsBase } from '@/lib/format'
function formatCents(cents: number): string {
  return formatCentsBase(cents, { compact: true })
}

export default async function InformesClientesPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(params)

  const dateLo = periodStartIso ?? '0001-01-01'

  // ── Top 10 clientes por € gastado (completed, en periodo). Agrupado por
  //    teléfono (identidad del customer per-tenant); nombre = el último
  //    no-nulo visto en bookings.
  const topRows =
    (await db
      .execute(sql`
    SELECT
      customer_phone AS phone,
      COALESCE(MAX(customer_name), customer_phone) AS name,
      COUNT(*)::int AS count,
      COALESCE(SUM(price_cents), 0)::bigint AS cents
    FROM ${bookings}
    WHERE client_id = ${client.id} AND status = 'completed'
      AND date >= ${dateLo} AND date < ${periodEndIso}
    GROUP BY customer_phone
    ORDER BY cents DESC, count DESC
    LIMIT 10
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                phone: string
                name: string
                count: number
                cents: string | number
              }[]
            }
          ).rows,
      )) ?? []

  const topClients: TopClientRow[] = topRows.map((r) => ({
    name: r.name,
    phone: r.phone,
    count: Number(r.count),
    cents: Number(r.cents),
  }))

  // ── Clientes en riesgo (cartera, lifetime): ≥2 citas históricas y sin
  //    venir desde hace ≥ RISK_DAYS. Ordenados por más tiempo sin volver.
  const riskRows =
    (await db
      .execute(sql`
    SELECT
      COALESCE(name, phone) AS name,
      phone,
      COALESCE(total_bookings, 0)::int AS total_bookings,
      EXTRACT(DAY FROM (NOW() - last_booking_at))::int AS days_since
    FROM ${customers}
    WHERE client_id = ${client.id}
      AND COALESCE(total_bookings, 0) >= 2
      AND last_booking_at IS NOT NULL
      AND last_booking_at < NOW() - (${RISK_DAYS} || ' days')::interval
    ORDER BY last_booking_at ASC
    LIMIT 15
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                name: string
                phone: string
                total_bookings: number
                days_since: number
              }[]
            }
          ).rows,
      )) ?? []

  const riskClients: RiskRow[] = riskRows.map((r) => ({
    name: r.name,
    phone: r.phone,
    totalBookings: Number(r.total_bookings),
    daysSince: Number(r.days_since),
  }))

  // ── Nuevos vs habituales (en periodo) + retención (cartera).
  //    Retención = % de customers con ≥2 citas completadas cuya 2ª cae
  //    ≤60 días tras la 1ª (volvieron pronto → fidelizados).
  const [mixRow] =
    (await db
      .execute(sql`
    WITH first_completed AS (
      SELECT customer_phone, MIN(date) AS first_date
      FROM ${bookings}
      WHERE client_id = ${client.id} AND status = 'completed'
      GROUP BY customer_phone
    ),
    in_period AS (
      SELECT DISTINCT customer_phone
      FROM ${bookings}
      WHERE client_id = ${client.id} AND status = 'completed'
        AND date >= ${dateLo} AND date < ${periodEndIso}
    ),
    retention AS (
      SELECT customer_phone,
             (array_agg(date ORDER BY date))[1] AS d1,
             (array_agg(date ORDER BY date))[2] AS d2,
             COUNT(*) AS n
      FROM ${bookings}
      WHERE client_id = ${client.id} AND status = 'completed'
      GROUP BY customer_phone
    )
    SELECT
      (SELECT COUNT(*) FROM in_period ip
        JOIN first_completed fc ON fc.customer_phone = ip.customer_phone
        WHERE fc.first_date >= ${dateLo} AND fc.first_date < ${periodEndIso})::int AS nuevos,
      (SELECT COUNT(*) FROM in_period ip
        JOIN first_completed fc ON fc.customer_phone = ip.customer_phone
        WHERE fc.first_date < ${dateLo})::int AS habituales,
      (SELECT COUNT(*) FROM retention WHERE n >= 2)::int AS con_2,
      (SELECT COUNT(*) FROM retention
        WHERE n >= 2 AND (d2::date - d1::date) <= 60)::int AS retenidos
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                nuevos: number
                habituales: number
                con_2: number
                retenidos: number
              }[]
            }
          ).rows,
      )) ?? []

  const nuevos = Number(mixRow?.nuevos ?? 0)
  const habituales = Number(mixRow?.habituales ?? 0)
  const mixTotal = nuevos + habituales
  const con2 = Number(mixRow?.con_2 ?? 0)
  const retenidos = Number(mixRow?.retenidos ?? 0)
  const retencionPct = con2 > 0 ? Math.round((retenidos / con2) * 100) : 0

  // ── Origen de clientes nuevos (últimos 30 días) — helper compartido,
  //    misma fuente que /clientes/atribucion y el panel de Marketing.
  const since30d = new Date()
  since30d.setDate(since30d.getDate() - 30)
  const sourceRows = await getClientSourceBreakdown(client.id, { since: since30d })
  const sourceTotal = sumSourceBreakdown(sourceRows)

  const hasData = topClients.length > 0 || mixTotal > 0

  const nuevosPct = mixTotal > 0 ? Math.round((nuevos / mixTotal) * 100) : 0

  const stats: Stat[] = [
    {
      label: `Clientes · ${periodLabel}`,
      value: mixTotal.toLocaleString('es-ES'),
      icon: Users,
      hint: mixTotal > 0 ? 'Atendidos este periodo' : undefined,
    },
    {
      label: 'Nuevos',
      value: nuevos.toLocaleString('es-ES'),
      icon: UserPlus,
      hint: mixTotal > 0 ? `${nuevosPct}% del total` : undefined,
    },
    {
      label: 'Retención',
      value: con2 > 0 ? `${retencionPct}%` : '—',
      icon: UserCheck,
      hint: con2 > 0 ? '2ª cita ≤60 días' : 'Sin recurrentes aún',
    },
    {
      label: 'En riesgo',
      value: riskClients.length.toLocaleString('es-ES'),
      icon: AlertTriangle,
      hint: `Sin volver +${RISK_DAYS} días`,
    },
  ]

  const topColumns: Column<TopClientRow>[] = [
    {
      key: 'name',
      header: 'Cliente',
      cell: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'count',
      header: 'Citas',
      align: 'right',
      numeric: true,
      cell: (r) => r.count.toLocaleString('es-ES'),
    },
    {
      key: 'cents',
      header: 'Gastado',
      align: 'right',
      numeric: true,
      cell: (r) => <span className="text-ink">{formatCents(r.cents)}</span>,
    },
  ]

  const riskColumns: Column<RiskRow>[] = [
    {
      key: 'name',
      header: 'Cliente',
      cell: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'total',
      header: 'Citas',
      align: 'right',
      numeric: true,
      className: 'hidden sm:table-cell',
      cell: (r) => r.totalBookings.toLocaleString('es-ES'),
    },
    {
      key: 'days',
      header: 'Sin volver',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="text-danger">{r.daysSince} días</span>
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
            <EmptyState
              icon={Users}
              title="Sin datos en este periodo"
              description={`No hay clientes atendidos en este ${periodLabel}. Prueba otro periodo arriba a la derecha.`}
            />
          </div>
        ) : (
          <ReportLayout rail={CLIENTES_RAIL}>
            <StatStrip
              stats={stats}
              ariaLabel={`Resumen de clientes · ${periodLabel}`}
            />

            <SourceBreakdown items={sourceRows} total={sourceTotal} />

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Top clientes por € gastado. */}
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Mejores clientes
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Los 10 que más gastan este periodo.
                  </p>
                </header>
                <DataTable
                  columns={topColumns}
                  rows={topClients}
                  rowKey={(r) => r.phone}
                  ariaLabel="Mejores clientes por gasto"
                  emptyLabel="Sin clientes con gasto en este periodo"
                />
              </section>

              {/* Clientes en riesgo (cartera). */}
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    En riesgo de no volver
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Eran recurrentes y llevan +{RISK_DAYS} días sin venir.
                  </p>
                </header>
                <DataTable
                  columns={riskColumns}
                  rows={riskClients}
                  rowKey={(r) => r.phone}
                  ariaLabel="Clientes en riesgo"
                  emptyLabel="Ningún cliente en riesgo — buena retención"
                />
              </section>
            </div>

            {/* Nuevos vs habituales. */}
            {mixTotal > 0 && (
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Nuevos vs habituales · {periodLabel}
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Cuántos vienen por primera vez y cuántos ya te conocían.
                  </p>
                </header>
                <div className="px-[var(--space-card)] py-4">
                  <div className="flex h-3 overflow-hidden rounded-full bg-overlay">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${nuevosPct}%` }}
                    />
                    <div
                      className="h-full bg-success"
                      style={{ width: `${100 - nuevosPct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[0.75rem]">
                    <span className="text-ink-2">
                      <span className="font-semibold text-ink">{nuevos}</span>{' '}
                      nuevos ({nuevosPct}%)
                    </span>
                    <span className="text-ink-2">
                      <span className="font-semibold text-ink">
                        {habituales}
                      </span>{' '}
                      habituales ({100 - nuevosPct}%)
                    </span>
                  </div>
                </div>
              </section>
            )}
          </ReportLayout>
        )}
      </AreaContent>
    </AreaShell>
  )
}
