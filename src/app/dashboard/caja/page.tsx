export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@/db'
import { bookings, clients, invoices, productSales, tips } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Wallet,
  Receipt,
  Heart,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  FileText,
  ChevronLeft,
  ShoppingBag,
} from 'lucide-react'
import { Suspense } from 'react'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'
import ConnectSettings from '../_components/ConnectSettings'
import InvoicingSettings from '../_components/InvoicingSettings'
import BarberBreakdown from './BarberBreakdown'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
} from '@/lib/dashboard/period'

// -----------------------------------------------------------------------------
// /dashboard/caja — panel financiero del barbero.
//
// Por qué existe esta sección (mover de /clientes y /negocio):
//   · Antes los KPIs financieros vivían en /dashboard/clientes — pero son
//     métricas DEL NEGOCIO, no DE clientes. Mal alocado.
//   · Cobros (Stripe Connect) vivía en /dashboard/negocio → tab Cobros — su
//     sitio natural es Caja, junto al resto de lo monetario.
//   · Datos fiscales vivirán también aquí (commit 4 — refactor InvoicingSettings
//     a self-contained con su propio API endpoint).
//
// Privacidad: la pantalla del barbero suele ser visible a clientes en
// mostrador. Caja es de ENTRADA EXPLÍCITA (click en menú), nunca aparece
// por defecto. El Inicio tampoco muestra cifras monetarias.
//
// KPIs con tabs Hoy / Semana / Mes / Año / Total + comparativa vs periodo
// anterior cuando aplica.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function CajaPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const period: Period = resolvePeriod(rawPeriod, 'month')

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Periodo actual y anterior — centralizado en lib/dashboard/period.
  const now = new Date()
  const periodStart = getPeriodStart(period, now)
  const periodStartIso = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`
    : null

  const previousPeriod = getPreviousPeriod(period, periodStart, now)

  const periodWhereDate = periodStartIso ? sql`AND date >= ${periodStartIso}` : sql``

  // ─── KPIs principales ────────────────────────────────────────────────────
  // bookings.price está en EUROS (foot-gun documentado en CLAUDE.md).
  const [kpiRow] = (await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        ${periodWhereDate})::bigint AS billed_eur,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        ${periodWhereDate})::int AS completed_count,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
        WHERE client_id = ${client.id} AND status = 'paid'
        ${periodStart ? sql`AND paid_at >= ${periodStart}` : sql``})::bigint AS tips_cents,
      (SELECT COALESCE(SUM(total_cents), 0) FROM ${productSales}
        WHERE client_id = ${client.id}
        ${periodStart ? sql`AND sold_at >= ${periodStart}` : sql``})::bigint AS upsells_cents,
      (SELECT COUNT(*) FROM ${productSales}
        WHERE client_id = ${client.id}
        ${periodStart ? sql`AND sold_at >= ${periodStart}` : sql``})::int AS upsells_count
  `).then((r) => (r as unknown as { rows: KpiRow[] }).rows)) ?? []

  const billedEur = Number(kpiRow?.billed_eur ?? 0)
  const completedCount = Number(kpiRow?.completed_count ?? 0)
  const tipsEur = Number(kpiRow?.tips_cents ?? 0) / 100
  const upsellsEur = Number(kpiRow?.upsells_cents ?? 0) / 100
  const upsellsCount = Number(kpiRow?.upsells_count ?? 0)
  const ticketMedio = completedCount > 0 ? billedEur / completedCount : 0

  // KPIs del periodo anterior (para flechas tendencia).
  let billedPrev: number | null = null
  let completedPrev: number | null = null
  let tipsPrevEur: number | null = null
  if (previousPeriod) {
    const [prevRow] = (await db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
          WHERE client_id = ${client.id} AND status = 'completed'
          AND date >= ${previousPeriod.startIso} AND date < ${periodStartIso ?? previousPeriod.endIso}
        )::bigint AS billed_eur,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${client.id} AND status = 'completed'
          AND date >= ${previousPeriod.startIso} AND date < ${periodStartIso ?? previousPeriod.endIso}
        )::int AS completed_count,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
          WHERE client_id = ${client.id} AND status = 'paid'
          AND paid_at >= ${previousPeriod.startDate} AND paid_at < ${periodStart ?? previousPeriod.endDate}
        )::bigint AS tips_cents
    `).then((r) => (r as unknown as {
      rows: { billed_eur: string | number; completed_count: number; tips_cents: string | number }[]
    }).rows)) ?? []
    billedPrev = prevRow ? Number(prevRow.billed_eur) : null
    completedPrev = prevRow ? Number(prevRow.completed_count) : null
    tipsPrevEur = prevRow ? Number(prevRow.tips_cents) / 100 : null
  }

  // ─── Facturas: contador este mes + flag hasEmittedInvoices para lock ────
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const nextMonthStartIso = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
  const [invoiceCountRow] = await db
    .select({
      thisMonth: sql<number>`count(*) FILTER (WHERE issue_date >= ${monthStartIso} AND issue_date < ${nextMonthStartIso})`,
      total: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(eq(invoices.clientId, client.id))
  const invoiceCountThisMonth = Number(invoiceCountRow?.thisMonth ?? 0)
  const hasEmittedInvoices = Number(invoiceCountRow?.total ?? 0) > 0

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
          <Wallet className="h-7 w-7 text-brand" />
          Caja
        </h1>
        <p className="text-ink-2">Tu dinero: facturado, propinas, cobros online y datos fiscales.</p>
      </header>

      {/* KPIs principales con tabs por periodo */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">Ingresos</h2>
          <Suspense>
            <StatsPeriodTabs />
          </Suspense>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi
            icon={Wallet}
            label="Facturado"
            value={billedEur > 0 ? `${billedEur.toFixed(0)} €` : '—'}
            trend={computeTrend(billedEur, billedPrev)}
          />
          <Kpi
            icon={Receipt}
            label="Ticket medio"
            value={completedCount > 0 ? `${ticketMedio.toFixed(2)} €` : '—'}
            hint={completedCount > 0 ? `${completedCount} servicios` : undefined}
          />
          <Kpi
            icon={CalendarCheck}
            label="Servicios"
            value={completedCount.toLocaleString('es-ES')}
            trend={computeTrend(completedCount, completedPrev)}
          />
          <Kpi
            icon={ShoppingBag}
            label="Productos"
            value={upsellsEur > 0 ? `${upsellsEur.toFixed(2)} €` : '—'}
            hint={upsellsCount > 0 ? `${upsellsCount} ${upsellsCount === 1 ? 'venta' : 'ventas'}` : undefined}
          />
          <Kpi
            icon={Heart}
            label="Propinas"
            value={tipsEur > 0 ? `${tipsEur.toFixed(2)} €` : '—'}
            trend={computeTrend(tipsEur, tipsPrevEur)}
          />
        </div>
      </section>

      {/* Desglose por barbero — solo se renderiza si hay ≥2 barberos activos.
          BarberBreakdown devuelve null si <2 (con 1 barbero es redundante con
          los KPIs globales de arriba). Usa el mismo periodStartIso. */}
      <section className="mb-8">
        <BarberBreakdown clientId={client.id} periodStartIso={periodStartIso} />
      </section>

      {/* Cobros online (Stripe Connect) */}
      <section className="mb-8 bg-surface border border-line rounded-2xl p-5 md:p-6">
        <ConnectSettings
          initial={{
            status: client.stripeConnectStatus,
            accountId: client.stripeConnectAccountId,
            activatedAt: client.stripeConnectActivatedAt
              ? client.stripeConnectActivatedAt.toISOString()
              : null,
          }}
        />
      </section>

      {/* Datos fiscales — InvoicingSettings self-contained (commit 4): toggle
          emisión + datos fiscales + numeración. Save via /api/invoicing/config. */}
      <section className="mb-8 bg-surface border border-line rounded-2xl p-5 md:p-6">
        <InvoicingSettings
          initial={{
            invoicingEnabled: client.invoicingEnabled,
            fiscalName: client.fiscalName || '',
            fiscalNif: client.fiscalNif || '',
            fiscalAddress: client.fiscalAddress || '',
            fiscalCity: client.fiscalCity || '',
            fiscalPostalCode: client.fiscalPostalCode || '',
            ivaRate: client.ivaRate,
            invoiceNumberPrefix: client.invoiceNumberPrefix,
            invoiceNumberNext: client.invoiceNumberNext,
            hasEmittedInvoices,
          }}
        />
      </section>

      {/* Facturas emitidas — link al detalle */}
      <section className="mb-8 bg-surface border border-line rounded-2xl p-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-brand-softer text-brand-strong">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-ink">Facturas emitidas</h3>
            <p className="text-sm text-ink-2 mt-1">
              {client.invoicingEnabled ? (
                <>
                  {invoiceCountThisMonth} {invoiceCountThisMonth === 1 ? 'factura' : 'facturas'} este mes ·{' '}
                  Próximo número: <span className="font-mono">{client.invoiceNumberPrefix}{client.invoiceNumberNext}</span>
                </>
              ) : (
                'Facturación desactivada. Actívala desde Datos fiscales.'
              )}
            </p>
          </div>
          <Link
            href="/dashboard/facturas"
            className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong"
          >
            Ver facturas
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="pt-4 border-t border-line">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ─────────────────────────────────────────────────────────────────────────────

interface KpiRow {
  billed_eur: number | string
  completed_count: number
  tips_cents: number | string
  upsells_cents: number | string
  upsells_count: number
}

interface Trend {
  direction: 'up' | 'down' | 'flat' | 'none'
  label: string
}

function Kpi({
  icon: Icon,
  label,
  value,
  trend,
  hint,
}: {
  icon: typeof Wallet
  label: string
  value: string
  trend?: Trend
  hint?: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold truncate">{label}</p>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-xl md:text-2xl font-bold text-ink tabular-nums">{value}</p>
        {trend && trend.direction !== 'none' && <TrendChip trend={trend} />}
      </div>
      {hint && <p className="text-[10px] text-ink-3 mt-1">{hint}</p>}
    </div>
  )
}

function TrendChip({ trend }: { trend: Trend }) {
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus
  const color = trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-danger' : 'text-ink-3'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
      <Icon className="h-3 w-3" />
      {trend.label}
    </span>
  )
}

function computeTrend(current: number, previous: number | null): Trend {
  if (previous === null) return { direction: 'none', label: '' }
  if (previous === 0 && current === 0) return { direction: 'flat', label: '=' }
  if (previous === 0) return { direction: 'up', label: 'nuevo' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { direction: 'flat', label: '=' }
  const sign = pct > 0 ? '+' : '−'
  return {
    direction: pct > 0 ? 'up' : 'down',
    label: `${sign}${Math.abs(pct)}%`,
  }
}
