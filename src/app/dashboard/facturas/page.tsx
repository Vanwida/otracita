export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, and, gte, lt, desc, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { monthRangeInclusive } from '@/lib/invoicing'
import { Download, ChevronRight, Receipt, AlertCircle, FileSpreadsheet, BookOpen, Plus } from 'lucide-react'
import { MonthSelect, TypeSelect, VoidedToggle } from './FiltersBar'
import PageShell from '@/app/dashboard/_components/PageShell'
import StatStrip from '@/app/dashboard/_components/StatStrip'
import VerifactuBadge, { type VerifactuStatus } from './_components/VerifactuBadge'
import VerifactuHelpPanel from './_components/VerifactuHelpPanel'

// -----------------------------------------------------------------------------
// /dashboard/facturas — lista mensual de tickets y facturas que el barbero
// emite a sus clientes. Auto-generadas tras cada booking confirmada con precio
// (hook en /api/bookings/create y /api/email/inbound).
// -----------------------------------------------------------------------------

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
  const verifactuErrorOnly = params.verifactuError === '1' || params.verifactuError === 'true'
  const range = monthRangeInclusive(month)

  // Empty state if invoicing disabled
  if (!client.invoicingEnabled) {
    return (
      <PageShell title="Facturación" maxWidth="4xl" back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}>
        <FacturasMonthLine month={month} />
        <div className="mt-8 bg-surface border border-line rounded-2xl p-8 md:p-12 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-softer border border-brand/20 flex items-center justify-center">
            <Receipt className="h-6 w-6 text-brand" />
          </div>
          <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-page-title)' }}>Activa la facturación</h2>
          <p className="mt-2 text-ink-2 max-w-md mx-auto">
            Emite tickets y facturas automáticamente con cada reserva confirmada. Exporta cada mes un CSV para tu gestor.
          </p>
          <Link
            href="/dashboard/caja"
            className="btn-primary mt-6"
          >
            Activar facturación
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </PageShell>
    )
  }

  if (!range) {
    return (
      <PageShell title="Facturación" maxWidth="4xl" back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}>
        <FacturasMonthLine month={currentMonth()} />
        <div className="mt-8 bg-surface border border-line rounded-2xl p-8 text-center text-ink-2">
          Mes inválido. <Link href="/dashboard/facturas" className="text-brand hover:underline">Ver mes actual</Link>.
        </div>
      </PageShell>
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
  const whereTypeFiltered = typeFilter === 'all'
    ? whereMonthForList
    : and(whereMonthForList, eq(invoices.type, typeFilter))
  // Cuando llegamos desde el banner de error VeriFactu, filtramos solo
  // las facturas que Hacienda rechazó o que fallaron técnicamente.
  const whereFiltered = verifactuErrorOnly
    ? and(whereTypeFiltered, sql`${invoices.verifactuStatus} IN ('rejected', 'error')`)
    : whereTypeFiltered

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

  // Cuenta facturas con problema VeriFactu (rechazo AEAT o error técnico)
  // en el cliente actual, sin filtro de mes — son asuntos que hay que
  // atender independientemente del mes que tengas seleccionado.
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

  return (
    <PageShell title="Facturación" back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}>
      <FacturasMonthLine month={month} />

      {/* Panel educativo VeriFactu — da contexto, tranquilidad y valor.
          Colocado arriba para que barberos nuevos lo vean al entrar. */}
      <VerifactuHelpPanel />

      {/* Stats — tira densa, no grid de cards de revista */}
      <div className="mt-6">
        <StatStrip
          ariaLabel="Resumen de facturación del mes"
          stats={[
            { label: 'Total facturado', value: `${formatEuros(stats.totalCents)} €`, hint: formatMonth(month) },
            { label: 'IVA recaudado', value: `${formatEuros(stats.ivaCents)} €`, hint: `${client.ivaRate}% aplicado` },
            { label: 'Documentos', value: stats.count.toString(), hint: stats.count === 1 ? 'factura' : 'facturas' },
          ]}
        />
      </div>

      {/* Primary action: new manual invoice / walk-in */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-brand-softer border border-brand/20 rounded-2xl p-4 md:p-5">
        <div>
          <p className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
            Nueva factura o walk-in
          </p>
          <p className="text-sm text-ink-2 mt-0.5">
            Emite un ticket o factura sin reserva previa en segundos.
          </p>
        </div>
        <Link
          href="/dashboard/facturas/nueva"
          className="btn-primary"
          prefetch={false}
        >
          <Plus className="h-4 w-4" />
          Nueva factura / walk-in
        </Link>
      </div>

      {/* Banner VeriFactu — solo visible si hay facturas con problema en Hacienda */}
      {verifactuErrorCount > 0 && (
        <div className="mt-6 rounded-xl border border-danger/30 bg-danger/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">
              {verifactuErrorCount} factura{verifactuErrorCount === 1 ? '' : 's'} con problema en Hacienda
            </p>
            <p className="text-xs text-ink-2 mt-0.5">
              Hacienda rechazó el envío o hubo un error técnico. Revisa los detalles para corregir o reintentar.
            </p>
          </div>
          <Link
            href={`/dashboard/facturas?showVoided=1&verifactuError=1`}
            className="inline-flex items-center gap-1 rounded-lg bg-danger hover:bg-danger/90 text-white px-3 py-2 text-xs font-semibold transition-colors"
          >
            Ver detalles
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Filter banner — visible cuando llegamos por el deep-link de errores. */}
      {verifactuErrorOnly && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-overlay border border-line px-4 py-2.5">
          <p className="text-xs text-ink-2">
            Mostrando solo facturas con problema en Hacienda.
          </p>
          <Link
            href={`/dashboard/facturas?month=${month}${showVoided ? '&showVoided=1' : ''}`}
            className="text-xs font-semibold text-brand hover:text-brand-strong transition-colors"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <MonthSelect currentMonth={month} currentType={typeFilter} showVoided={showVoided} />
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
            className="btn-primary"
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
                  <th className="px-4 md:px-6 py-3 font-semibold">Hacienda</th>
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
                        <VerifactuBadge status={row.verifactuStatus as VerifactuStatus} />
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
    </PageShell>
  )
}

// Línea de contexto del mes. El título "Facturación" + back-affordance los
// pone PageShell (header de panel); aquí solo el sub-contexto del periodo.
function FacturasMonthLine({ month }: { month: string }) {
  return (
    <p className="text-ink-2 mb-4" style={{ fontSize: 'var(--text-meta)' }}>
      Tickets y facturas que emites a tus clientes · <span className="text-ink">{formatMonth(month)}</span>
    </p>
  )
}

// MonthSelect, TypeSelect and VoidedToggle live in FiltersBar (Client
// Component) so their onChange handlers are legal under Next.js 16's RSC
// rules.
