export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, and, gte, lt, desc, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { monthRangeInclusive } from '@/lib/invoicing'
import {
  Download,
  ChevronRight,
  Receipt,
  AlertCircle,
  FileSpreadsheet,
  BookOpen,
  Plus,
} from 'lucide-react'
import { MonthSelect, TypeSelect, VoidedToggle } from '../../facturas/FiltersBar'
import AreaContent from '../../_components/AreaContent'
import StatStrip from '../../_components/StatStrip'
import DataTable, { type Column } from '../../_components/DataTable'
import EmptyState from '../../_components/EmptyState'
import VerifactuBadge, {
  type VerifactuStatus,
} from '../../facturas/_components/VerifactuBadge'
import VerifactuHelpPanel from '../../facturas/_components/VerifactuHelpPanel'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'

// -----------------------------------------------------------------------------
// /dashboard/ventas/facturas — pestaña FACTURAS del área Ventas.
//
// Lista mensual de tickets/facturas VeriFactu (auto-generadas tras cada
// booking confirmada con precio). El detalle de una factura sigue en
// /dashboard/facturas/[id] y la emisión manual en /dashboard/facturas/nueva
// — son drill-downs, no pestañas (patrón Booksy: lista → detalle en ruta
// hija, igual que ajustes→detalle).
//
// LÓGICA DE SERVIDOR INTACTA: las queries (rango medio-abierto del mes,
// filtros type/voided/verifactuError, stats issued-only, contador de
// errores AEAT) son las MISMAS del antiguo facturas/page.tsx, movidas 1:1.
// Solo cambia el shell (PageShell → AreaContent) y la tabla pasa a
// DataTable denso. `basePath` mantiene los filtros apuntando a esta ruta.
// -----------------------------------------------------------------------------

const BASE_PATH = '/dashboard/ventas/facturas'

interface SearchParams {
  month?: string
  type?: string
  showVoided?: string
  verifactuError?: string
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTH_NAMES[idx] ?? m} ${y}`
}

type InvoiceRow = typeof invoices.$inferSelect

export default async function VentasFacturasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const lockOverlay = await renderAdminLockGuard('ventas-facturas')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth()
  const typeFilter =
    params.type === 'ticket' || params.type === 'invoice'
      ? params.type
      : 'all'
  const showVoided = params.showVoided === '1' || params.showVoided === 'true'
  const verifactuErrorOnly =
    params.verifactuError === '1' || params.verifactuError === 'true'
  const range = monthRangeInclusive(month)

  // Empty state si la facturación está desactivada.
  if (!client.invoicingEnabled) {
    return (
      <AreaContent scroll="fixed" maxWidth="5xl">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Receipt}
            tone="brand"
            title="Activa la facturación"
            description="Emite tickets y facturas automáticamente con cada reserva confirmada. Exporta cada mes un CSV para tu gestor."
            action={
              <Link href="/dashboard/ventas/cobros" className="btn-primary">
                Activar facturación
                <ChevronRight className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      </AreaContent>
    )
  }

  if (!range) {
    return (
      <AreaContent scroll="fixed" maxWidth="5xl">
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-control border border-line bg-surface p-8 text-center text-[0.8125rem] text-ink-2">
            Mes inválido.{' '}
            <Link href={BASE_PATH} className="text-brand hover:underline">
              Ver mes actual
            </Link>
            .
          </div>
        </div>
      </AreaContent>
    )
  }

  // Rango medio-abierto [start, endExclusive). Anuladas excluidas por defecto.
  const whereIssuedMonth = and(
    eq(invoices.clientId, client.id),
    gte(invoices.issueDate, range.start),
    lt(invoices.issueDate, range.endExclusive),
    eq(invoices.status, 'issued'),
  )
  const whereMonthForList = showVoided
    ? and(
        eq(invoices.clientId, client.id),
        gte(invoices.issueDate, range.start),
        lt(invoices.issueDate, range.endExclusive),
      )
    : whereIssuedMonth
  const whereTypeFiltered =
    typeFilter === 'all'
      ? whereMonthForList
      : and(whereMonthForList, eq(invoices.type, typeFilter))
  const whereFiltered = verifactuErrorOnly
    ? and(
        whereTypeFiltered,
        sql`${invoices.verifactuStatus} IN ('rejected', 'error')`,
      )
    : whereTypeFiltered

  const rows = await db
    .select()
    .from(invoices)
    .where(whereFiltered)
    .orderBy(desc(invoices.issueDate), desc(invoices.number))

  const [statsRow] = await db
    .select({
      count: sql<number>`count(*)`,
      subtotalTotal: sql<number>`coalesce(sum(${invoices.subtotalCents}), 0)`,
      ivaTotal: sql<number>`coalesce(sum(${invoices.ivaAmountCents}), 0)`,
      total: sql<number>`coalesce(sum(${invoices.totalCents}), 0)`,
    })
    .from(invoices)
    .where(whereIssuedMonth)

  const stats = {
    count: Number(statsRow?.count ?? 0),
    subtotalCents: Number(statsRow?.subtotalTotal ?? 0),
    ivaCents: Number(statsRow?.ivaTotal ?? 0),
    totalCents: Number(statsRow?.total ?? 0),
  }

  const [errStatsRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, client.id),
        sql`${invoices.verifactuStatus} IN ('rejected', 'error')`,
      ),
    )
  const verifactuErrorCount = Number(errStatsRow?.n ?? 0)

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      header: 'Número',
      cell: (r) => (
        <span
          className={`font-mono text-ink ${r.status === 'voided' ? 'line-through' : ''}`}
        >
          {r.number}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Fecha',
      cell: (r) => <span className="text-ink-2">{r.issueDate}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'customer',
      header: 'Cliente',
      cell: (r) => <span className="text-ink">{r.customerName || '—'}</span>,
    },
    {
      key: 'service',
      header: 'Servicio',
      cell: (r) => <span className="text-ink-2">{r.serviceName}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key: 'base',
      header: 'Base',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="font-mono text-ink-2">
          {formatEuros(r.subtotalCents)}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'iva',
      header: 'IVA',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="font-mono text-ink-2">
          {formatEuros(r.ivaAmountCents)}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="font-mono font-semibold text-ink">
          {formatEuros(r.totalCents)} €
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-semibold ${
              r.type === 'invoice'
                ? 'bg-brand-softer text-brand-strong'
                : 'bg-overlay text-ink-2'
            }`}
          >
            {r.type === 'invoice' ? 'Factura' : 'Ticket'}
          </span>
          {r.status === 'voided' && (
            <span className="inline-flex w-fit items-center rounded bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
              Anulada
            </span>
          )}
        </div>
      ),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'verifactu',
      header: 'Hacienda',
      cell: (r) => (
        <VerifactuBadge status={r.verifactuStatus as VerifactuStatus} />
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (r) => (
        <Link
          href={`/dashboard/facturas/${r.id}`}
          className="inline-flex items-center gap-1 font-medium text-brand hover:text-brand-strong"
        >
          Ver
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ]

  return (
    <AreaContent scroll="region" maxWidth="7xl">
      <p
        className="mb-4 text-ink-2"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        Tickets y facturas que emites a tus clientes ·{' '}
        <span className="text-ink">{formatMonth(month)}</span>
      </p>

      <StatStrip
        ariaLabel="Resumen de facturación del mes"
        stats={[
          {
            label: 'Total facturado',
            value: `${formatEuros(stats.totalCents)} €`,
            hint: formatMonth(month),
          },
          {
            label: 'IVA recaudado',
            value: `${formatEuros(stats.ivaCents)} €`,
            hint: `${client.ivaRate}% aplicado`,
          },
          {
            label: 'Documentos',
            value: stats.count.toString(),
            hint: stats.count === 1 ? 'factura' : 'facturas',
          },
        ]}
      />

      {/* Banner VeriFactu — solo si hay facturas con problema en Hacienda. */}
      {verifactuErrorCount > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-control border border-danger/30 bg-danger/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-[0.8125rem] font-semibold text-ink">
              {verifactuErrorCount} factura
              {verifactuErrorCount === 1 ? '' : 's'} con problema en Hacienda
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              Hacienda rechazó el envío o hubo un error técnico. Revisa los
              detalles para corregir o reintentar.
            </p>
          </div>
          <Link
            href={`${BASE_PATH}?showVoided=1&verifactuError=1`}
            className="inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-danger/90"
          >
            Ver detalles
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {verifactuErrorOnly && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-control border border-line bg-overlay px-4 py-2.5">
          <p className="text-xs text-ink-2">
            Mostrando solo facturas con problema en Hacienda.
          </p>
          <Link
            href={`${BASE_PATH}?month=${month}${showVoided ? '&showVoided=1' : ''}`}
            className="text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      {/* Controles: filtros + nueva + exportar. */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <MonthSelect
            currentMonth={month}
            currentType={typeFilter}
            showVoided={showVoided}
            basePath={BASE_PATH}
          />
          <TypeSelect
            currentType={typeFilter}
            currentMonth={month}
            showVoided={showVoided}
            basePath={BASE_PATH}
          />
          <VoidedToggle
            month={month}
            typeFilter={typeFilter}
            showVoided={showVoided}
            basePath={BASE_PATH}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/api/invoices/libro-pdf?month=${month}`}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-brand hover:text-brand-strong"
            prefetch={false}
            title="Libro de facturas emitidas — PDF para el Modelo 303"
          >
            <BookOpen className="h-4 w-4" />
            Libro PDF
          </Link>
          <Link
            href={`/api/invoices/export-xlsx?month=${month}`}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-brand hover:text-brand-strong"
            prefetch={false}
            title="Exportar a Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Link>
          <Link
            href={`/api/invoices/export?month=${month}`}
            className="btn-primary"
            prefetch={false}
            title="Exportar CSV compatible con Excel ES"
          >
            <Download className="h-4 w-4" />
            CSV
          </Link>
          <Link
            href="/dashboard/facturas/nueva"
            className="btn-primary"
            prefetch={false}
          >
            <Plus className="h-4 w-4" />
            Nueva
          </Link>
        </div>
      </div>

      {/* Panel educativo VeriFactu — colapsable (<details>), cerrado por
          defecto: da tranquilidad fiscal al barbero sin romper el fit de
          viewport. Preserva el contenido del facturas/page.tsx original. */}
      <div className="mt-4">
        <VerifactuHelpPanel />
      </div>

      {/* Tabla densa — DataTable. */}
      <div className="mt-4 overflow-hidden rounded-control border border-line bg-surface">
        <DataTable
          ariaLabel="Facturas y tickets del mes"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) =>
            r.status === 'voided' ? 'opacity-60' : undefined
          }
          emptyLabel={`No hay ${
            typeFilter === 'ticket'
              ? 'tickets'
              : typeFilter === 'invoice'
                ? 'facturas'
                : 'documentos'
          } emitidos en ${formatMonth(month)}. Se generan al confirmar reservas con precio, o emite una manualmente.`}
        />
      </div>
    </AreaContent>
  )
}
