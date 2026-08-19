export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import {
  Scissors,
  ShoppingBag,
  Heart,
  Wallet,
  Banknote,
  CreditCard,
  Smartphone,
  Globe,
  HelpCircle,
} from 'lucide-react'
import { db } from '@/db'
import { bookings, productSales, products, tips, payments } from '@/db/schema'
import { sql } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import DataTable, { type Column } from '../../_components/DataTable'
import ReportLayout from '../_components/ReportLayout'
import { INGRESOS_RAIL } from '../_components/report-rail-config'
import BarberBreakdown from '../../caja/BarberBreakdown'
import EmptyState from '../../_components/EmptyState'
import { loadReportContext } from '../_report-data'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'

// -----------------------------------------------------------------------------
// /dashboard/informes/ingresos — pestaña INGRESOS del área Informes.
//
// Reemplaza el placeholder "Próximamente" con el reporte real: de qué vienen
// los ingresos. Pura agregación sobre tablas existentes (bookings /
// product_sales / products / tips), cero schema nuevo. Tenant resuelto de la
// sesión (loadReportContext). Periodo por `?period=` (StatsPeriodTabs).
//
// `bookings.service` es texto libre → se agrupa por nombre exacto (limitación
// conocida y aceptada). Todos los importes están en CÉNTIMOS; el resto
// en céntimos — todo se normaliza a céntimos para formatear con un helper.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string; date?: string; start?: string; end?: string }>
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

import { formatCents as formatCentsBase } from '@/lib/format'
function formatCents(cents: number): string {
  return formatCentsBase(cents, { compact: true })
}

export default async function InformesIngresosPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(params)

  const dateLo = periodStartIso ?? '0001-01-01'

  // ── Ventas por servicio (top 10 por €). bookings.service es texto libre.
  const serviceRows =
    (await db
      .execute(sql`
    SELECT service,
           COUNT(*)::int AS count,
           COALESCE(SUM(price_cents), 0)::bigint AS cents
    FROM ${bookings}
    WHERE client_id = ${client.id} AND status = 'completed'
      AND date >= ${dateLo} AND date < ${periodEndIso}
    GROUP BY service
    ORDER BY cents DESC, count DESC
    LIMIT 10
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: { service: string; count: number; cents: string | number }[]
            }
          ).rows,
      )) ?? []

  const services: ServiceRow[] = serviceRows.map((r) => ({
    service: r.service,
    count: Number(r.count),
    cents: Number(r.cents),
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
      AND ps.consumption_kind IS NULL
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
      (SELECT COALESCE(SUM(price_cents), 0) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        AND date >= ${dateLo} AND date < ${periodEndIso})::bigint AS servicios_cents,
      (SELECT COALESCE(SUM(total_cents), 0) FROM ${productSales}
        WHERE client_id = ${client.id} AND consumption_kind IS NULL
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
                servicios_cents: string | number
                productos_cents: string | number
                propinas_cents: string | number
              }[]
            }
          ).rows,
      )) ?? []

  const serviciosCents = Number(typeRow?.servicios_cents ?? 0)
  const productosCents = Number(typeRow?.productos_cents ?? 0)
  const propinasCents = Number(typeRow?.propinas_cents ?? 0)
  const totalCents = serviciosCents + productosCents + propinasCents

  // ── Desglose por método de pago. Suma sobre las MISMAS 3 fuentes que
  // `Ingreso por tipo` (bookings + productSales + tips) para que el total
  // cuadre. Granularidad:
  //
  //   · bookings.payment_method  → cash | card_physical | bizum | card_online
  //                                | mixed | NULL (legacy / sin caja activa)
  //   · product_sales.payment_method → cash | card | online  (legacy coarse)
  //   · tips.payment_method      → cash | card | NULL  (NULL = legacy card)
  //
  // Normalizamos los coarse de products/tips al set granular:
  //   productos card → card_physical (típico datáfono),
  //   tips card/NULL → card_online (flow Stripe Checkout — ver comment en
  //   schema.ts líneas 1027-1033).
  //
  // Bookings con `mixed` SE DESPLIEGAN via tabla `payments` (status='succeeded'):
  // si una cita 100€ es 50€ cash + 50€ card_physical, NO sumamos 100€ a
  // "mixed", sumamos 50€ a cash + 50€ a card_physical. Esto refleja el
  // dinero real entrado por cada vía (mismo criterio que ClosingReport y
  // load-breakdown.ts). Decir "300€ en fraccionado" oculta cuánto efectivo
  // real entró en caja.
  //
  // Edge: si un booking marcado 'mixed' NO tiene rows en `payments` (legacy
  // o estado inconsistente), cae al bucket 'unknown' antes que mentir.
  //
  // Bookings con paymentMethod NULL → bucket "unknown" (legacy / cobrados
  // antes de activar caja efectivo). Se oculta si es 0.
  const methodRows =
    (await db
      .execute(sql`
    WITH
      -- Bookings 'mixed' del periodo (los que necesitan despliegue via payments).
      mixed_bookings AS (
        SELECT b.id, b.price_cents::bigint AS booking_cents
        FROM ${bookings} b
        WHERE b.client_id = ${client.id}
          AND b.status = 'completed'
          AND b.date >= ${dateLo}
          AND b.date < ${periodEndIso}
          AND b.price_cents IS NOT NULL
          AND b.price_cents > 0
          AND b.payment_method = 'mixed'
      ),
      -- Splits cobrados de esos bookings (granular cash/card_physical/bizum/card_online).
      mixed_splits AS (
        SELECT
          COALESCE(NULLIF(p.method, ''), 'unknown') AS method,
          p.amount_cents::bigint AS cents,
          p.booking_id
        FROM ${payments} p
        JOIN mixed_bookings mb ON mb.id = p.booking_id
        WHERE p.client_id = ${client.id}
          AND p.status = 'succeeded'
          AND p.amount_cents > 0
      ),
      -- Bookings 'mixed' SIN payments asociados (edge: legacy o inconsistente)
      -- van a 'unknown' para no inventar granularidad.
      mixed_orphans AS (
        SELECT 'unknown'::text AS method, mb.booking_cents AS cents
        FROM mixed_bookings mb
        WHERE NOT EXISTS (
          SELECT 1 FROM mixed_splits ms WHERE ms.booking_id = mb.id
        )
      ),
      all_rows AS (
        -- Bookings NO-mixed: granular method directo, o 'unknown' si NULL.
        SELECT COALESCE(NULLIF(b.payment_method, ''), 'unknown') AS method,
               b.price_cents::bigint AS cents
        FROM ${bookings} b
        WHERE b.client_id = ${client.id}
          AND b.status = 'completed'
          AND b.date >= ${dateLo}
          AND b.date < ${periodEndIso}
          AND b.price_cents IS NOT NULL
          AND b.price_cents > 0
          AND (b.payment_method IS DISTINCT FROM 'mixed')

        UNION ALL

        -- Bookings 'mixed' desplegados: una row por split.
        SELECT method, cents FROM mixed_splits

        UNION ALL

        SELECT method, cents FROM mixed_orphans

        UNION ALL

        -- Product sales: coarse → granular (card → card_physical).
        SELECT CASE ps.payment_method
                 WHEN 'card' THEN 'card_physical'
                 WHEN 'online' THEN 'card_online'
                 WHEN 'cash' THEN 'cash'
                 ELSE COALESCE(ps.payment_method, 'unknown')
               END AS method,
               ps.total_cents::bigint AS cents
        FROM ${productSales} ps
        WHERE ps.client_id = ${client.id}
          AND ps.consumption_kind IS NULL
          AND ps.sold_at >= ${dateLo}::date
          AND ps.sold_at < ${periodEndIso}::date

        UNION ALL

        -- Tips: cash → cash, card/NULL → card_online (flow Stripe Checkout).
        SELECT CASE COALESCE(t.payment_method, 'card')
                 WHEN 'cash' THEN 'cash'
                 WHEN 'card' THEN 'card_online'
                 ELSE COALESCE(t.payment_method, 'card_online')
               END AS method,
               t.amount_cents::bigint AS cents
        FROM ${tips} t
        WHERE t.client_id = ${client.id}
          AND t.status = 'paid'
          AND t.paid_at >= ${dateLo}::date
          AND t.paid_at < ${periodEndIso}::date
      )
    SELECT method,
           COUNT(*)::int AS count,
           COALESCE(SUM(cents), 0)::bigint AS cents
    FROM all_rows
    GROUP BY method
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                method: string
                count: number
                cents: string | number
              }[]
            }
          ).rows,
      )) ?? []

  const byMethod = new Map<string, { cents: number; count: number }>()
  for (const r of methodRows) {
    byMethod.set(r.method, {
      cents: Number(r.cents),
      count: Number(r.count),
    })
  }

  // Orden fijo: efectivo primero (lo más físico/relevante para cuadre),
  // tarjeta física, bizum, online, sin clasificar. `mixed` ya no es bucket
  // visible — los splits se desplegaron al método real. Cualquier categoría
  // con 0 € se oculta — petición explícita del usuario.
  const methods = [
    { key: 'cash', label: 'Efectivo', icon: Banknote },
    { key: 'card_physical', label: 'Tarjeta · Datáfono', icon: CreditCard },
    { key: 'bizum', label: 'Bizum', icon: Smartphone },
    { key: 'card_online', label: 'Online · Stripe', icon: Globe },
    { key: 'unknown', label: 'Sin clasificar', icon: HelpCircle },
  ]
    .map((m) => ({
      ...m,
      cents: byMethod.get(m.key)?.cents ?? 0,
      count: byMethod.get(m.key)?.count ?? 0,
    }))
    .filter((m) => m.cents > 0)

  const methodsTotalCents = methods.reduce((a, m) => a + m.cents, 0)
  const methodsBase = methodsTotalCents || 1

  // ── Evolución mensual de ingresos por servicios (últimos 12 meses).
  const monthlyRows =
    (await db
      .execute(sql`
    SELECT to_char(date::date, 'YYYY-MM') AS ym,
           COALESCE(SUM(price_cents), 0)::bigint AS cents
    FROM ${bookings}
    WHERE client_id = ${client.id} AND status = 'completed'
      AND date::date >= (${periodEndIso}::date - INTERVAL '12 months')
      AND date < ${periodEndIso}
    GROUP BY ym
    ORDER BY ym ASC
  `)
      .then(
        (r) =>
          (r as unknown as { rows: { ym: string; cents: string | number }[] })
            .rows,
      )) ?? []

  const monthly = monthlyRows.map((r) => ({
    ym: r.ym,
    cents: Number(r.cents),
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
          {/* defaultPeriod="month" mantiene UI y server sincronizados:
              `loadReportContext` resuelve a 'month' cuando no hay ?period=,
              así que el chip "Mes" debe estar activo por defecto. Sin esta
              prop, el componente caería en su fallback histórico 'lifetime'
              y la chip activa no coincidiría con los datos pintados. */}
          <StatsPeriodTabs defaultPeriod="month" />
        </Suspense>
      }
    >
      <AreaContent scroll="region" maxWidth="7xl">
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              icon={Wallet}
              title="Sin datos en este periodo"
              description={`No hay ingresos registrados en este ${periodLabel}. Prueba otro periodo arriba a la derecha.`}
            />
          </div>
        ) : (
          <ReportLayout rail={INGRESOS_RAIL}>
            {/* Ingreso por tipo de venta. */}
            <section className="panel">
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

            {/* Desglose por método de pago — qué entra por cada vía
                (efectivo / datáfono / Bizum / online / fraccionado). Las
                categorías a 0 se ocultan. */}
            {methods.length > 0 && (
              <section className="panel">
                <header
                  className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Por método de pago · {periodLabel}
                  </h2>
                  <p className="text-[0.75rem] text-ink-2">
                    {formatCents(methodsTotalCents)} en {methods.length}{' '}
                    {methods.length === 1 ? 'método' : 'métodos'}
                  </p>
                </header>
                <div
                  className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5"
                  // Cuando hay <5 métodos visibles, el grid no llena la fila
                  // lg:5 — auto-fit no funciona con grid-cols-N, así que
                  // forzamos columnas dinámicas via inline (más simple que
                  // tener un mapa de clases `grid-cols-${N}` que Tailwind no
                  // puede purgar).
                  style={
                    methods.length < 5
                      ? {
                          gridTemplateColumns: `repeat(${methods.length}, minmax(0, 1fr))`,
                        }
                      : undefined
                  }
                >
                  {methods.map((m) => {
                    const Icon = m.icon
                    const pct = Math.round((m.cents / methodsBase) * 100)
                    return (
                      <div
                        key={m.key}
                        className="px-[var(--space-card)] py-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon
                            className="h-3.5 w-3.5 shrink-0 text-ink-2"
                            aria-hidden="true"
                          />
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2">
                            {m.label}
                          </p>
                        </div>
                        <p
                          className="mt-1 font-bold text-ink tabular-nums leading-none"
                          style={{ fontSize: 'var(--text-figure)' }}
                        >
                          {formatCents(m.cents)}
                        </p>
                        <p className="mt-1 text-[0.75rem] text-ink-2 tabular-nums">
                          {pct}% · {m.count.toLocaleString('es-ES')}{' '}
                          {m.count === 1 ? 'cobro' : 'cobros'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Ventas por servicio (top 10). */}
              <section className="panel">
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
              <section className="panel">
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
              <section className="panel">
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
