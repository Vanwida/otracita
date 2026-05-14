export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@/db'
import { bookings, clients, invoices, productSales, tips } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Receipt,
  Heart,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react'
import { Suspense } from 'react'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'
import ConnectSettings from '../_components/ConnectSettings'
import InvoicingSettings from '../_components/InvoicingSettings'
import CashRegisterPanel from '../_components/CashRegisterPanel'
import CashRegisterToggle from '../_components/CashRegisterToggle'
import SumupConnect from '../_components/SumupConnect'
import MobileAppConnect from '../_components/MobileAppConnect'
import KpiCard, { computeTrend, type Trend } from '../_components/KpiCard'
import BarberBreakdown from './BarberBreakdown'
import BonusTracker from './BonusTracker'
import { hasFeature } from '@/lib/billing/tier'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
  PERIOD_OPTIONS,
} from '@/lib/dashboard/period'
import { formatEuros, pluralizeEs } from '@/lib/i18n/plural-es'

// -----------------------------------------------------------------------------
// /dashboard/caja — panel financiero del barbero.
//
// Estructura post-distill:
//   1. Header (volver + título Caja + period tabs alineados a la derecha)
//   2. CashRegisterPanel — "ahora": cuadre del día (solo si activado)
//   3. FacturadoHero — total facturado del periodo, número Fraunces grande
//   4. KPI strip secundario (4 cards) — Servicios / Ticket medio / Productos / Propinas
//   5. BarberBreakdown — desglose por barbero
//   6. "Ajustes de cobro" — toggle caja, SumUp, app móvil, Stripe, fiscal,
//      facturas. Subsecciones separadas por hairlines, sin nested cards. La
//      jerarquía visual se demota porque son configs raras vez tocadas, no
//      la operativa diaria.
//
// Privacidad: la pantalla del barbero suele ser visible a clientes en
// mostrador. Caja es de ENTRADA EXPLÍCITA (click en menú), nunca aparece
// por defecto. El Inicio tampoco muestra cifras monetarias.
//
// bookings.price está en EUROS (foot-gun documentado en CLAUDE.md). Los
// tips, productSales e invoices viven en céntimos.
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

  const now = new Date()
  const periodStart = getPeriodStart(period, now)
  const periodStartIso = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`
    : null

  const previousPeriod = getPreviousPeriod(period, periodStart, now)
  const periodWhereDate = periodStartIso ? sql`AND date >= ${periodStartIso}` : sql``

  // ─── KPIs principales ────────────────────────────────────────────────────
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

  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label.toLowerCase() ?? period
  const billedTrend = computeTrend(billedEur, billedPrev)

  return (
    <div className="px-4 md:px-8 lg:px-12 max-w-4xl mx-auto pb-16">
      {/* max-w-4xl es la baseline de páginas operativas. /dashboard (home)
          queda max-w-3xl por elección editorial — el masthead Fraunces
          respira mejor en una columna más estrecha. */}
      {/* Header — título + period tabs. Caja es un tab top-level, el usuario
          vuelve al Inicio desde el logo o desde el bottom-nav. Un back-link
          aquí sería redundante. */}
      <header className="pt-10 lg:pt-14 pb-8 border-b border-line">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink leading-tight">
            Caja
          </h1>
          <Suspense>
            <StatsPeriodTabs />
          </Suspense>
        </div>
      </header>

      {/* Cuadre del día — solo si activado. La operativa AHORA va arriba. */}
      {client.cashRegisterEnabled && (
        <section className="mt-8">
          <CashRegisterPanel />
        </section>
      )}

      {/* Hero: Facturado del periodo en Fraunces grande */}
      <section className="mt-12 lg:mt-16">
        <FacturadoHero
          amount={billedEur}
          periodLabel={periodLabel}
          trend={billedTrend}
        />
      </section>

      {/* KPI strip secundario — 4 stats menores */}
      <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Receipt}
          label="Ticket medio"
          value={completedCount > 0 ? formatEuros(ticketMedio) : '—'}
          hint={completedCount > 0 ? pluralizeEs(completedCount, 'servicio', 'servicios') : undefined}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Servicios"
          value={completedCount.toLocaleString('es-ES')}
          trend={computeTrend(completedCount, completedPrev)}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Productos"
          value={upsellsEur > 0 ? formatEuros(upsellsEur) : '—'}
          hint={
            upsellsCount > 0
              ? pluralizeEs(upsellsCount, 'venta', 'ventas')
              : undefined
          }
        />
        <KpiCard
          icon={Heart}
          label="Propinas"
          value={tipsEur > 0 ? formatEuros(tipsEur) : '—'}
          trend={computeTrend(tipsEur, tipsPrevEur)}
        />
      </section>

      {/* Control financiero — link al módulo de gastos, costes fijos e IVA */}
      <section className="mt-8">
        <Link
          href="/dashboard/finanzas"
          className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-line bg-surface hover:border-brand hover:shadow-[0_4px_20px_rgba(201,101,60,0.07)] transition-all group"
        >
          <div>
            <p className="font-semibold text-ink text-sm">Control financiero</p>
            <p className="text-xs text-ink-2 mt-0.5">Gastos, costes fijos, IVA estimado — tu P&amp;L real</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3 group-hover:text-brand transition-colors shrink-0" aria-hidden="true" />
        </Link>
      </section>

      {/* Desglose por barbero — solo se renderiza si hay ≥2 barberos activos. */}
      <section className="mt-12">
        <BarberBreakdown clientId={client.id} periodStartIso={periodStartIso} />
      </section>

      {/* Bonos del equipo — UNA sola card que combina progreso del mes y
          log del día. Client component con SWR: al guardar, refresh
          automático sin tocar la página. Se auto-oculta si no hay bonos
          configurados (cero ruido para quien no usa el módulo). */}
      {hasFeature(client, 'teamBonuses') && (
        <section className="mt-8">
          <BonusTracker />
        </section>
      )}

      {/* Ajustes — sección demotada visualmente. Subsecciones con hairline,
          sin cards anidadas. El barbero las toca rara vez; cuando entra a
          /caja a las 21:10 quiere cerrar caja, no configurar. */}
      <section className="mt-16 pt-10 border-t border-line">
        <h2 className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-2 mb-1">
          Ajustes de cobro
        </h2>
        <p className="text-sm text-ink-2 mb-8">
          Caja efectivo, datáfono, cobros online y datos fiscales.
        </p>

        <div className="space-y-10">
          <div>
            <CashRegisterToggle initialEnabled={client.cashRegisterEnabled} />
          </div>

          {client.cashRegisterEnabled && (
            <div className="border-t border-line pt-10">
              <SumupConnect
                initialConnected={!!client.sumupAccessToken && !!client.sumupMerchantCode}
                initialMerchantCode={client.sumupMerchantCode}
                initialReaderId={client.sumupReaderId}
                initialReaderName={client.sumupReaderName}
              />
            </div>
          )}

          {client.cashRegisterEnabled && client.sumupAccessToken && (
            <div className="border-t border-line pt-10">
              <MobileAppConnect />
            </div>
          )}

          <div className="border-t border-line pt-10">
            <ConnectSettings
              initial={{
                status: client.stripeConnectStatus,
                accountId: client.stripeConnectAccountId,
                activatedAt: client.stripeConnectActivatedAt
                  ? client.stripeConnectActivatedAt.toISOString()
                  : null,
              }}
            />
          </div>

          <div className="border-t border-line pt-10">
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
          </div>

          <FacturasEmittedRow
            invoicingEnabled={client.invoicingEnabled}
            invoiceCountThisMonth={invoiceCountThisMonth}
            invoiceNumberPrefix={client.invoiceNumberPrefix}
            invoiceNumberNext={client.invoiceNumberNext}
          />
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FacturadoHero — protagonista de la página: número grande + tendencia.
// ─────────────────────────────────────────────────────────────────────────────

function FacturadoHero({
  amount,
  periodLabel,
  trend,
}: {
  amount: number
  periodLabel: string
  trend: Trend
}) {
  const TrendIcon =
    trend.direction === 'up'
      ? TrendingUp
      : trend.direction === 'down'
      ? TrendingDown
      : Minus
  const trendColor =
    trend.direction === 'up'
      ? 'text-success'
      : trend.direction === 'down'
      ? 'text-danger'
      : 'text-ink-2'
  const showTrend = trend.direction !== 'none'
  const showAmount = amount > 0

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-2 mb-2">
        Facturado · {periodLabel}
      </p>
      <div className="flex items-baseline gap-4 flex-wrap">
        <p
          className="font-display font-semibold text-ink tabular-nums leading-[1] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(2.75rem, 8vw, 5rem)' }}
        >
          {showAmount ? formatEuros(amount) : '—'}
        </p>
        {showAmount && showTrend && (
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${trendColor}`}>
            <TrendIcon className="h-4 w-4" aria-hidden="true" />
            {trend.label}
            {trend.direction !== 'flat' && (
              <span className="text-ink-2 font-medium ml-1">vs anterior</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FacturasEmittedRow — fila inline para el link a facturas, sin card.
// ─────────────────────────────────────────────────────────────────────────────

function FacturasEmittedRow({
  invoicingEnabled,
  invoiceCountThisMonth,
  invoiceNumberPrefix,
  invoiceNumberNext,
}: {
  invoicingEnabled: boolean
  invoiceCountThisMonth: number
  invoiceNumberPrefix: string
  invoiceNumberNext: number
}) {
  return (
    <div className="border-t border-line pt-10 flex items-start gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-ink mb-1">Facturas emitidas</h3>
        <p className="text-sm text-ink-2">
          {invoicingEnabled ? (
            <>
              {pluralizeEs(invoiceCountThisMonth, 'factura', 'facturas')} este mes. Próximo número:{' '}
              <span className="font-mono">
                {invoiceNumberPrefix}
                {invoiceNumberNext}
              </span>
              .
            </>
          ) : (
            'Facturación desactivada. Actívala desde Datos fiscales.'
          )}
        </p>
      </div>
      <Link
        href="/dashboard/facturas"
        className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong transition-colors min-h-[40px]"
      >
        Ver facturas
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

interface KpiRow {
  billed_eur: number | string
  completed_count: number
  tips_cents: number | string
  upsells_cents: number | string
  upsells_count: number
}
