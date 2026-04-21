export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { FileText, Download, ChevronRight, Receipt, AlertCircle } from 'lucide-react'

// -----------------------------------------------------------------------------
// /dashboard/facturas — lista mensual de tickets y facturas que el barbero
// emite a sus clientes. Auto-generadas tras cada booking confirmada con precio
// (hook en /api/bookings/create y /api/email/inbound).
// -----------------------------------------------------------------------------

interface SearchParams {
  month?: string
  type?: string
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Parse `YYYY-MM` to [firstOfMonth, firstOfNextMonth) range as ISO dates. */
function monthRange(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const m = parseInt(match[2], 10) - 1
  if (m < 0 || m > 11) return null
  const start = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, m + 1, 1)).toISOString().slice(0, 10)
  return { start, end }
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
  const range = monthRange(month)

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

  // Query invoices for the month (+ optional type filter)
  const whereMonth = and(
    eq(invoices.clientId, client.id),
    gte(invoices.issueDate, range.start),
    lte(invoices.issueDate, range.end),
  )
  const whereFiltered = typeFilter === 'all'
    ? whereMonth
    : and(whereMonth, eq(invoices.type, typeFilter))

  const rows = await db
    .select()
    .from(invoices)
    .where(whereFiltered)
    .orderBy(desc(invoices.issueDate), desc(invoices.number))

  // Stats over unfiltered month (so the cards don't change when user toggles type)
  const [statsRow] = await db
    .select({
      count: sql<number>`count(*)`,
      subtotalTotal: sql<number>`coalesce(sum(${invoices.subtotalCents}), 0)`,
      ivaTotal: sql<number>`coalesce(sum(${invoices.ivaAmountCents}), 0)`,
      total: sql<number>`coalesce(sum(${invoices.totalCents}), 0)`,
    })
    .from(invoices)
    .where(whereMonth)

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

      {/* Controls */}
      <div className="mt-6 flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
        <div className="flex flex-col md:flex-row gap-3">
          <MonthSelect currentMonth={month} />
          <TypeSelect currentType={typeFilter} currentMonth={month} />
        </div>
        <Link
          href={`/api/invoices/export?month=${month}`}
          className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-ink transition-colors"
          prefetch={false}
        >
          <Download className="h-4 w-4" />
          Exportar CSV del mes
        </Link>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="mt-6 bg-surface border border-line rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-ink-3 mb-3" />
          <p className="text-ink-2">
            No hay {typeFilter === 'ticket' ? 'tickets' : typeFilter === 'invoice' ? 'facturas' : 'documentos'} emitidos en {formatMonth(month)}.
          </p>
          <p className="text-sm text-ink-3 mt-2">
            Se generarán automáticamente cuando se confirmen reservas con precio.
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
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-overlay/50 transition-colors">
                    <td className="px-4 md:px-6 py-3 font-mono text-ink">{row.number}</td>
                    <td className="px-4 md:px-6 py-3 text-ink-2">{row.issueDate}</td>
                    <td className="px-4 md:px-6 py-3 text-ink">{row.customerName || '—'}</td>
                    <td className="px-4 md:px-6 py-3 text-ink-2">{row.serviceName}</td>
                    <td className="px-4 md:px-6 py-3 text-ink-2 text-right font-mono">{formatEuros(row.subtotalCents)}</td>
                    <td className="px-4 md:px-6 py-3 text-ink-2 text-right font-mono">{formatEuros(row.ivaAmountCents)}</td>
                    <td className="px-4 md:px-6 py-3 text-ink font-semibold text-right font-mono">{formatEuros(row.totalCents)} €</td>
                    <td className="px-4 md:px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        row.type === 'invoice'
                          ? 'bg-brand-softer text-brand-strong'
                          : 'bg-overlay text-ink-2'
                      }`}>
                        {row.type === 'invoice' ? 'Factura' : 'Ticket'}
                      </span>
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
                ))}
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

/** Last 12 months as options. Keeps the link fresh across year boundaries. */
function MonthSelect({ currentMonth }: { currentMonth: string }) {
  const options: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <form method="get" className="flex items-center gap-2">
      <label className="sr-only" htmlFor="month">Mes</label>
      <select
        id="month"
        name="month"
        defaultValue={currentMonth}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}
        className="bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      >
        {options.map((m) => (
          <option key={m} value={m}>{formatMonth(m)}</option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm text-brand hover:underline">Ver</button>
      </noscript>
    </form>
  )
}

function TypeSelect({ currentType, currentMonth }: { currentType: string; currentMonth: string }) {
  return (
    <form method="get" className="flex items-center gap-2">
      <input type="hidden" name="month" value={currentMonth} />
      <select
        name="type"
        defaultValue={currentType}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}
        className="bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      >
        <option value="all">Todos los tipos</option>
        <option value="ticket">Tickets</option>
        <option value="invoice">Facturas</option>
      </select>
    </form>
  )
}
