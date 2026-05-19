export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { Scissors, ShoppingBag, Heart, Wallet } from 'lucide-react'
import { db } from '@/db'
import { bookings, productSales, products, tips } from '@/db/schema'
import { sql } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import DataTable, { type Column } from '../../_components/DataTable'
import ReportLayout from '../_components/ReportLayout'
import { INGRESOS_RAIL } from '../_components/report-rail-config'
import BarberBreakdown from '../../caja/BarberBreakdown'
import { loadReportContext } from '../_report-data'

// -----------------------------------------------------------------------------
// /dashboard/informes/ingresos — pestaña INGRESOS del área Informes.
//
// Reemplaza el placeholder "Próximamente" con el reporte real: de qué vienen
// los ingresos. Pura agregación sobre tablas existentes (bookings /
// product_sales / products / tips), cero schema nuevo. Tenant resuelto de la
// sesión (loadReportContext). Periodo por `?period=` (StatsPeriodTabs).
//
// `bookings.service` es texto libre → se agrupa por nombre exacto (limitación
// conocida y aceptada). `bookings.price` está en EUROS (foot-gun); el resto
// en céntimos — todo se normaliza a céntimos para formatear con un helper.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

interface ServiceRow {
  service: string
  count: number
  cents: number
}

interface ProductRow {
  name: string
  units: number
  cents: number
}

function formatCents(cents: number): string {
  const euros = cents / 100
  if (Number.isInteger(euros)) return `${euros.toLocaleString('es-ES')} €`
  return `${euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

export default async function InformesIngresosPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(rawPeriod)

  const dateLo = periodStartIso ?? '0001-01-01'

  // ── Ventas por servicio (top 10 por €). bookings.service es texto libre.
  const serviceRows =
    (await db
      .execute(sql`
    SELECT service,
           COUNT(*)::int AS count,
           COALESCE(SUM(price), 0)::bigint AS eur
    FROM ${bookings}
    WHERE client_id = ${client.id} AND status = 'completed'
      AND date >= ${dateLo} AND date < ${periodEndIso}
    GROUP BY service
    ORDER BY eur DESC, count DESC
    LIMIT 10
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: { service: string; count: number; eur: string | number }[]
            }
          ).rows,
      )) ?? []

  const services: ServiceRow[] = serviceRows.map((r) => ({
    service: r.service,
    count: Number(r.count),
    cents: Math.round(Number(r.eur) * 100),
  }))

  // ── Ventas por producto (uds + €), join a products para el nombre.
  const productRows =
    (await db
      .execute(sql`
    SELECT p.name AS name,
           COALESCE(SUM(ps.quantity), 0)::int AS units,
           COALESCE(SUM(ps.total_cents), 0)::bigint AS cents
    FROM ${productSales} ps
    JOIN ${products} p ON p.id = ps.product_id
    WHERE ps.client_id = ${client.id}
      AND ps.sold_at >= ${dateLo}::date AND ps.sold_at < ${periodEndIso}::date
    GROUP BY p.name
    ORDER BY cents DESC, units DESC
    LIMIT 10
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: { name: string; units: number; cents: string | number }[]
            }
          ).rows,
      )) ?? []

  const productItems: ProductRow[] = productRows.map((r) => ({
    name: r.name,
    units: Number(r.units),
    cents: Number(r.cents),
  }))

  // ── Ingreso por tipo de venta (split servicios/productos/propinas).
  const [typeRow] =
    (await db
      .execute(sql`
    SELECT
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        AND date >= ${dateLo} AND date < ${periodEndIso})::bigint AS servicios_eur,
      (SELECT COALESCE(SUM(total_cents), 0) FROM ${productSales}
        WHERE client_id = ${client.id}
        AND sold_at >= ${dateLo}::date AND sold_at < ${periodEndIso}::date)::bigint AS productos_cents,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
        WHERE client_id = ${client.id} AND status = 'paid'
        AND paid_at >= ${dateLo}::date AND paid_at < ${periodEndIso}::date)::bigint AS propinas_cents
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                servicios_eur: string | number
                productos_cents: string | number
                propinas_cents: string | number
              }[]
            }
          ).rows,
      )) ?? []

  const serviciosCents = Math.round(Number(typeRow?.servicios_eur ?? 0) * 100)
  const productosCents = Number(typeRow?.productos_cents ?? 0)
  const propinasCents = Number(typeRow?.propinas_cents ?? 0)
  const totalCents = serviciosCents + productosCents + propinasCents

  // ── Evolución mensual de ingresos por servicios (últimos 12 meses).
  const monthlyRows =
    (await db
      .execute(sql`
    SELECT to_char(date::date, 'YYYY-MM') AS ym,
           COALESCE(SUM(price), 0)::bigint AS eur
    FROM ${bookings}
    WHERE client_id = ${client.id} AND status = 'completed'
      AND date::date >= (${periodEndIso}::date - INTERVAL '12 months')
      AND date < ${periodEndIso}
    GROUP BY ym
    ORDER BY ym ASC
  `)
      .then(
        (r) =>
          (r as unknown as { rows: { ym: string; eur: string | number }[] })
            .rows,
      )) ?? []

  const monthly = monthlyRows.map((r) => ({
    ym: r.ym,
    cents: Math.round(Number(r.eur) * 100),
  }))
  const monthlyMax = Math.max(1, ...monthly.map((m) => m.cents))

  const hasData = totalCents > 0 || services.length > 0

  const serviceTotalCents = services.reduce((a, s) => a + s.cents, 0)
  const serviceColumns: Column<ServiceRow>[] = [
    {
      key: 'service',
      header: 'Servicio',
      cell: (r) => <span className="font-medium text-ink">{r.service}</span>,
    },
    {
      key: 'count',
      header: 'Nº',
      align: 'right',
      numeric: true,
      cell: (r) => r.count.toLocaleString('es-ES'),
    },
    {
      key: 'eur',
      header: 'Facturado',
      align: 'right',
      numeric: true,
      cell: (r) => <span className="text-ink">{formatCents(r.cents)}</span>,
    },
    {
      key: 'pct',
      header: '% del total',
      align: 'right',
      numeric: true,
      className: 'hidden sm:table-cell',
      cell: (r) => (
        <span className="text-ink-2">
          {serviceTotalCents > 0
            ? `${Math.round((r.cents / serviceTotalCents) * 100)}%`
            : '—'}
        </span>
      ),
    },
  ]

  const productColumns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'Producto',
      cell: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'units',
      header: 'Uds',
      align: 'right',
      numeric: true,
      cell: (r) => r.units.toLocaleString('es-ES'),
    },
    {
      key: 'cents',
      header: 'Ingreso',
      align: 'right',
      numeric: true,
      cell: (r) => <span className="text-ink">{formatCents(r.cents)}</span>,
    },
  ]

  const tipos = [
    { key: 'servicios', label: 'Servicios', icon: Scissors, cents: serviciosCents },
    { key: 'productos', label: 'Productos', icon: ShoppingBag, cents: productosCents },
    { key: 'propinas', label: 'Propinas', icon: Heart, cents: propinasCents },
  ]
  const tiposBase = totalCents || 1

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
                <Wallet className="h-5 w-5 text-ink-2" aria-hidden="true" />
              </div>
              <h2
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Sin datos en este periodo
              </h2>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2">
                No hay ingresos registrados en este {periodLabel}. Prueba otro
                periodo arriba a la derecha.
              </p>
            </div>
          </div>
        ) : (
          <ReportLayout rail={INGRESOS_RAIL}>
            {/* Ingreso por tipo de venta. */}
            <section className="rounded-control border border-line bg-surface overflow-hidden">
              <header
                className="border-b border-line px-[var(--space-card)] py-3"
                style={{ background: 'var(--table-head-bg)' }}
              >
                <h2 className="text-[0.8125rem] font-semibold text-ink">
                  Ingreso por tipo · {periodLabel}
                </h2>
                <p className="mt-0.5 text-[0.75rem] text-ink-2">
                  Total {formatCents(totalCents)} este periodo.
                </p>
              </header>
              <ul className="divide-y divide-line">
                {tipos.map((t) => {
                  const Icon = t.icon
                  const pct = Math.round((t.cents / tiposBase) * 100)
                  return (
                    <li
                      key={t.key}
                      className="flex items-center gap-3 px-[var(--space-card)] py-3"
                    >
                      <Icon
                        className="h-4 w-4 shrink-0 text-ink-2"
                        aria-hidden="true"
                      />
                      <span className="w-20 shrink-0 text-[0.8125rem] text-ink-2">
                        {t.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-[0.8125rem] tabular-nums text-ink">
                        {formatCents(t.cents)}
                        <span className="ml-1 text-[0.6875rem] text-ink-3">
                          {pct}%
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Ventas por servicio (top 10). */}
              <section className="rounded-control border border-line bg-surface overflow-hidden">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Ventas por servicio
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Los 10 que más facturan este periodo.
                  </p>
                </header>
                <DataTable
                  columns={serviceColumns}
                  rows={services}
                  rowKey={(r) => r.service}
                  ariaLabel="Ventas por servicio"
                  emptyLabel="Sin servicios facturados en este periodo"
                />
              </section>

              {/* Ventas por producto. */}
              <section className="rounded-control border border-line bg-surface overflow-hidden">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Ventas por producto
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Unidades e ingreso por producto.
                  </p>
                </header>
                <DataTable
                  columns={productColumns}
                  rows={productItems}
                  rowKey={(r) => r.name}
                  ariaLabel="Ventas por producto"
                  emptyLabel="Sin ventas de productos en este periodo"
                />
              </section>
            </div>

            {/* Ingresos por empleado — el barbero que viene de Booksy
                espera las stats del equipo dentro de Estadísticas (es la
                pestaña "Empleados" de Booksy 09.46.25). Reusamos
                BarberBreakdown (mismo componente/query que Ventas y
                Equipo, cero duplicación). Se autooculta con <2 barberos
                activos. */}
            <BarberBreakdown
              clientId={client.id}
              periodStartIso={periodStartIso}
              title="Por empleado"
              subtitle="Quién factura más, quién recibe más propinas, quién tiene mejor nota — este periodo."
              highlightTop
            />

            {/* Evolución mensual de ingresos por servicios. */}
            {monthly.length >= 2 && (
              <section className="rounded-control border border-line bg-surface overflow-hidden">
                <header className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3">
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Evolución mensual
                  </h2>
                  <p className="text-[0.75rem] text-ink-2">
                    Servicios · últimos {monthly.length} meses
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
                            height: `${Math.max(2, Math.round((m.cents / monthlyMax) * 100))}%`,
                          }}
                          title={`${m.ym}: ${formatCents(m.cents)}`}
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
          </ReportLayout>
        )}
      </AreaContent>
    </AreaShell>
  )
}
