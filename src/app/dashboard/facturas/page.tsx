export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, and, gte, lt, desc, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { monthRangeInclusive } from '@/lib/invoicing'
import { FileText, Download, ChevronRight, Receipt, AlertCircle, FileSpreadsheet, BookOpen, Plus } from 'lucide-react'
import { MonthSelect, TypeSelect, VoidedToggle } from './FiltersBar'

// -----------------------------------------------------------------------------
// /dashboard/facturas — lista mensual de tickets y facturas que el barbero
// emite a sus clientes. Auto-generadas tras cada booking confirmada con precio
// (hook en /api/bookings/create y /api/email/inbound).
// -----------------------------------------------------------------------------

interface SearchParams {
  month?: string
  type?: string
  showVoided?: string
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const idx = parseInt(m, 10) - 1
  return `${monthNames[idx] ?? m} ${y}`
}

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth()
  const typeFilter = params.type === 'ticket' || params.type === 'invoice' ? params.type : 'all'
  // By default hide voided invoices (they don't count toward stats or the
  // gestor's book). User can opt into seeing them with ?showVoided=1.
  const showVoided = params.showVoided === '1' || params.showVoided === 'true'
  const range = monthRangeInclusive(month)

  // Empty state if invoicing disabled
  if (!client.invoicingEnabled) {
    return (
      <div className="p-4 md:p-8 max-w-4xl">
        <Header month={month} />
        <div className="mt-8 bg-surface border border-line rounded-2xl p-8 md:p-12 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-softer border border-brand/20 flex items-center justify-center">
            <Receipt className="h-6 w-6 text-brand" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink">Activa la facturación</h2>
          <p className="mt-2 text-ink-2 max-w-md mx-auto">
            Emite tickets y facturas automáticamente con cada reserva confirmada. Exporta cada mes un CSV para tu gestor.
          </p>
          <Link
            href="/dashboard/negocio?tab=facturacion"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-ink transition-colors"
          >
            Activar facturación
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    )
  }

  if (!range) {
    return (
      <div className="p-4 md:p-8 max-w-4xl">
        <Header month={currentMonth()} />
        <div className="mt-8 bg-surface border border-line rounded-2xl p-8 text-center text-ink-2">
          Mes inválido. <Link href="/dashboard/facturas" className="text-brand hover:underline">Ver mes actual</Link>.
        </div>
      </div>
    )
  }

  // Query invoices for the month. Half-open range [start, endExclusive) so the
  // first day of the following month is NOT pulled in (off-by-one if we used
  // `lte` with an inclusive end). Voided invoices are excluded by default.
  const whereIssuedMonth = and(
    eq(invoices.clientId, client.id),
    gte(invoices.issueDate, range.start),
    lt(invoices.issueDate, range.endExclusive),
    eq(invoices.status, 'issued'),
  )
  // When `showVoided` is on, relax the status filter to include both issued
  // and voided rows in the listing (stats always stay on issued-only).
  const whereMonthForList = showVoided
    ? and(
        eq(invoices.clientId, client.id),
        gte(invoices.issueDate, range.start),
        lt(invoices.issueDate, range.endExclusive),
      )
    : whereIssuedMonth
  const whereFiltered = typeFilter === 'all'
    ? whereMonthForList
    : and(whereMonthForList, eq(invoices.type, typeFilter))

  const rows = await db
    .select()
    .from(invoices)
    .where(whereFiltered)
    .orderBy(desc(invoices.issueDate), desc(invoices.number))

  // Stats over unfiltered month (so the cards don't change when user toggles
  // type). Voided rows never count — they were issued but the underlying
  // booking was cancelled, so they are legally annulled.
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

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <Header month={month} />

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total facturado" value={`${formatEuros(stats.totalCents)} €`} hint={formatMonth(month)} />
        <StatCard label="IVA recaudado" value={`${formatEuros(stats.ivaCents)} €`} hint={`${client.ivaRate}% aplicado`} />
        <StatCard label="Documentos emitidos" value={stats.count.toString()} hint={stats.count === 1 ? 'factura' : 'facturas'} />
      </div>

      {/* Primary action: new manual invoice / walk-in */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-brand-softer border border-brand/20 rounded-2xl p-4 md:p-5">
        <div>
          <p className="font-display text-lg font-semibold text-ink">
            Nueva factura o walk-in
          </p>
          <p className="text-sm text-ink-2 mt-0.5">
            Emite un ticket o factura sin reserva previa en segundos.
          </p>
        </div>
        <Link
          href="/dashboard/facturas/nueva"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-ink transition-colors"
          prefetch={false}
        >
          <Plus className="h-4 w-4" />
          Nueva factura / walk-in
        </Link>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <MonthSelect currentMonth={month} />
          <TypeSelect currentType={typeFilter} currentMonth={month} showVoided={showVoided} />
          <VoidedToggle month={month} typeFilter={typeFilter} showVoided={showVoided} />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href={`/api/invoices/libro-pdf?month=${month}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-line hover:border-brand hover:text-brand-strong px-4 py-3 text-sm font-semibold text-ink transition-colors"
            prefetch={false}
            title="Libro de facturas emitidas — PDF para adjuntar al Modelo 303"
          >
            <BookOpen className="h-4 w-4" />
            Libro PDF
          </Link>
          <Link
            href={`/api/invoices/export-xlsx?month=${month}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-line hover:border-brand hover:text-brand-strong px-4 py-3 text-sm font-semibold text-ink transition-colors"
            prefetch={false}
            title="Exportar a Excel (.xlsx) con fórmulas"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Link>
          <Link
            href={`/api/invoices/export?month=${month}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-3 text-sm font-semibold text-brand-ink transition-colors"
            prefetch={false}
            title="Exportar CSV compatible con Excel ES"
          >
            <Download className="h-4 w-4" />
            CSV
          </Link>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="mt-6 bg-surface border border-line rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-ink-3 mb-3" />
          <p className="text-ink-2">
            No hay {typeFilter === 'ticket' ? 'tickets' : typeFilter === 'invoice' ? 'facturas' : 'documentos'} emitidos en {formatMonth(month)}.
          </p>
          <p className="text-sm text-ink-3 mt-2">
            Se generarán automáticamente cuando se confirmen reservas con precio, o puedes emitir una manualmente.
          </p>
        </div>
      ) : (
        <div className="mt-6 bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-overlay border-b border-line">
                <tr className="text-left text-ink-2 uppercase text-xs tracking-wider">
                  <th className="px-4 md:px-6 py-3 font-semibold">Número</th>
                  <th className="px-4 md:px-6 py-3 font-semibold">Fecha</th>
                  <th className="px-4 md:px-6 py-3 font-semibold">Cliente</th>
                  <th className="px-4 md:px-6 py-3 font-semibold">Servicio</th>
                  <th className="px-4 md:px-6 py-3 font-semibold text-right">Base</th>
                  <th className="px-4 md:px-6 py-3 font-semibold text-right">IVA</th>
                  <th className="px-4 md:px-6 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 md:px-6 py-3 font-semibold">Tipo</th>
                  <th className="px-4 md:px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => {
                  const isVoided = row.status === 'voided'
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-overlay/50 transition-colors ${isVoided ? 'opacity-60' : ''}`}
                    >
                      <td className={`px-4 md:px-6 py-3 font-mono text-ink ${isVoided ? 'line-through' : ''}`}>{row.number}</td>
                      <td className="px-4 md:px-6 py-3 text-ink-2">{row.issueDate}</td>
                      <td className="px-4 md:px-6 py-3 text-ink">{row.customerName || '—'}</td>
                      <td className="px-4 md:px-6 py-3 text-ink-2">{row.serviceName}</td>
                      <td className="px-4 md:px-6 py-3 text-ink-2 text-right font-mono">{formatEuros(row.subtotalCents)}</td>
                      <td className="px-4 md:px-6 py-3 text-ink-2 text-right font-mono">{formatEuros(row.ivaAmountCents)}</td>
                      <td className="px-4 md:px-6 py-3 text-ink font-semibold text-right font-mono">{formatEuros(row.totalCents)} €</td>
                      <td className="px-4 md:px-6 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold w-fit ${
                            row.type === 'invoice'
                              ? 'bg-brand-softer text-brand-strong'
                              : 'bg-overlay text-ink-2'
                          }`}>
                            {row.type === 'invoice' ? 'Factura' : 'Ticket'}
                          </span>
                          {isVoided && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-danger/15 text-danger w-fit">
                              Anulada
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 md:px-6 py-3">
                        <Link
                          href={`/dashboard/facturas/${row.id}`}
                          className="text-brand hover:text-brand-strong font-medium inline-flex items-center gap-1"
                        >
                          Ver
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Header({ month }: { month: string }) {
  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
        <FileText className="h-7 w-7 text-brand" />
        Facturación
      </h1>
      <p className="text-ink-2">
        Tickets y facturas que emites a tus clientes · <span className="text-ink">{formatMonth(month)}</span>
      </p>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">{label}</p>
      <p className="font-display text-3xl font-semibold text-ink mt-2">{value}</p>
      {hint && <p className="text-xs text-ink-2 mt-1">{hint}</p>}
    </div>
  )
}

// MonthSelect, TypeSelect and VoidedToggle live in FiltersBar (Client
// Component) so their onChange handlers are legal under Next.js 16's RSC
// rules.
