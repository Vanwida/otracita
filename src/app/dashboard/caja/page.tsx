export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@/db'
import { bookings, cashSessions, clients, invoices, productSales, tips } from '@/db/schema'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Heart,
  CalendarCheck,
  ChevronRight,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { Suspense } from 'react'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'
import PageShell from '../_components/PageShell'
import ConnectSettings from '../_components/ConnectSettings'
import InvoicingSettings from '../_components/InvoicingSettings'
import CashRegisterToggle from '../_components/CashRegisterToggle'
import SumupConnect from '../_components/SumupConnect'
import MobileAppConnect from '../_components/MobileAppConnect'
import StatStrip, { type Stat } from '../_components/StatStrip'
import { computeTrend } from '../_components/KpiCard'
import BarberBreakdown from './BarberBreakdown'
import CajaRegisters, { type ClosedRegister } from './CajaRegisters'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
  PERIOD_OPTIONS,
} from '@/lib/dashboard/period'
import { formatEuros, pluralizeEs } from '@/lib/i18n/plural-es'

// -----------------------------------------------------------------------------
// /dashboard/caja — panel de control financiero del barbero (UI0 / Booksy).
//
// Estructura post-rebuild (densa, no editorial):
//   1. Header compacto (PageShell, sans, sin Fraunces) + period tabs.
//   2. StatStrip — tira de KPIs densa (Facturado / Servicios / Productos /
//      Propinas). Reemplaza al FacturadoHero editorial (font-display 5rem).
//   3. CajaRegisters — "Cajas registradoras" estructura Booksy: lista de
//      cajas (histórico) a la izquierda + panel de detalle acoplado a la
//      derecha (solo si client.cashRegisterEnabled).
//   4. Accesos operativos: Facturas a clientes / Control financiero.
//   5. BarberBreakdown — desglose por barbero (solo ≥2 barberos).
//   6. Ajustes de cobro — sección demotada, hairlines, sin nested cards.
//
// Privacidad: la pantalla del barbero suele ser visible a clientes en
// mostrador. Caja es de ENTRADA EXPLÍCITA (click en menú), nunca aparece
// por defecto. El Inicio tampoco muestra cifras monetarias.
//
// bookings.price está en EUROS (foot-gun documentado en CLAUDE.md). Los
// tips, productSales e invoices viven en céntimos. LÓGICA DE SERVIDOR
// INTACTA respecto a la versión anterior — solo se añade una query
// read-only del histórico de cash_sessions para la lista de cajas.
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

  // ─── Histórico de cajas cerradas (read-only, multi-tenant por client.id).
  //     Solo presentación: alimenta la lista de cajas a la izquierda del
  //     panel Booksy. No añade lógica de negocio — los datos ya existen.
  let registerHistory: ClosedRegister[] = []
  if (client.cashRegisterEnabled) {
    const closed = await db
      .select({
        id: cashSessions.id,
        openingCents: cashSessions.openingCents,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        closingCentsExpected: cashSessions.closingCentsExpected,
        closingCentsCounted: cashSessions.closingCentsCounted,
        cashDescuadreCents: cashSessions.cashDescuadreCents,
        cardTerminalExpectedCents: cashSessions.cardTerminalExpectedCents,
        cardDescuadreCents: cashSessions.cardDescuadreCents,
      })
      .from(cashSessions)
      .where(and(eq(cashSessions.clientId, client.id), isNotNull(cashSessions.closedAt)))
      .orderBy(desc(cashSessions.closedAt))
      .limit(60)
    registerHistory = closed.map((r) => ({
      id: r.id,
      openingCents: r.openingCents,
      openedAt: r.openedAt.toISOString(),
      closedAt: (r.closedAt as Date).toISOString(),
      closingCentsExpected: r.closingCentsExpected,
      closingCentsCounted: r.closingCentsCounted,
      cashDescuadreCents: r.cashDescuadreCents,
      cardTerminalExpectedCents: r.cardTerminalExpectedCents,
      cardDescuadreCents: r.cardDescuadreCents,
    }))
  }

  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label.toLowerCase() ?? period
  const ticketMedio = completedCount > 0 ? billedEur / completedCount : 0

  // KPIs densos — el "Facturado" del periodo es el protagonista (primero),
  // pero ya NO es un hero editorial Fraunces: es la primera celda de la
  // tira, sans bold tabular.
  const stats: Stat[] = [
    {
      label: `Facturado · ${periodLabel}`,
      value: billedEur > 0 ? formatEuros(billedEur) : '—',
      icon: Wallet,
      trend: computeTrend(billedEur, billedPrev),
    },
    {
      label: 'Servicios',
      value: completedCount.toLocaleString('es-ES'),
      icon: CalendarCheck,
      trend: computeTrend(completedCount, completedPrev),
      hint:
        completedCount > 0
          ? `Ticket medio ${formatEuros(ticketMedio)}`
          : undefined,
    },
    {
      label: 'Productos',
      value: upsellsEur > 0 ? formatEuros(upsellsEur) : '—',
      icon: ShoppingBag,
      hint: upsellsCount > 0 ? pluralizeEs(upsellsCount, 'venta', 'ventas') : undefined,
    },
    {
      label: 'Propinas',
      value: tipsEur > 0 ? formatEuros(tipsEur) : '—',
      icon: Heart,
      trend: computeTrend(tipsEur, tipsPrevEur),
    },
  ]

  return (
    <PageShell
      title="Caja"
      maxWidth="6xl"
      action={
        <Suspense>
          <StatsPeriodTabs />
        </Suspense>
      }
    >
      {/* KPI strip denso — sustituye al FacturadoHero editorial. */}
      <StatStrip stats={stats} ariaLabel="Resumen financiero del periodo" />

      {/* Cajas registradoras — estructura Booksy. Solo si la caja efectivo
          está activada. */}
      {client.cashRegisterEnabled && (
        <div className="mt-6">
          <CajaRegisters history={registerHistory} />
        </div>
      )}

      {/* Accesos operativos: Facturas a clientes (VeriFactu, diario) y
          Control financiero (P&L, mensual). Filas densas, no cards de
          revista. */}
      <nav className="mt-6 grid gap-2 md:grid-cols-2" aria-label="Accesos de caja">
        <OpRow
          href="/dashboard/facturas"
          title="Facturas a clientes"
          desc="Emitir, ver y rectificar tickets/facturas VeriFactu"
        />
        <OpRow
          href="/dashboard/finanzas"
          title="Control financiero"
          desc="Gastos, costes fijos, IVA estimado — tu P&amp;L real"
        />
      </nav>

      {/* Desglose por barbero — solo si hay ≥2 barberos activos. */}
      <div className="mt-6">
        <BarberBreakdown clientId={client.id} periodStartIso={periodStartIso} />
      </div>

      {/* Ajustes — sección demotada. Subsecciones con hairline, sin cards
          anidadas. El barbero las toca rara vez. */}
      <section className="mt-12 pt-8 border-t border-line">
        <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-ink-2 mb-1">
          Ajustes de cobro
        </h2>
        <p className="text-[0.8125rem] text-ink-2 mb-6">
          Caja efectivo, datáfono, cobros online y datos fiscales.
        </p>

        <div className="space-y-8">
          <div>
            <CashRegisterToggle initialEnabled={client.cashRegisterEnabled} />
          </div>

          {client.cashRegisterEnabled && (
            <div className="border-t border-line pt-8">
              <SumupConnect
                initialConnected={!!client.sumupAccessToken && !!client.sumupMerchantCode}
                initialMerchantCode={client.sumupMerchantCode}
                initialReaderId={client.sumupReaderId}
                initialReaderName={client.sumupReaderName}
              />
            </div>
          )}

          {client.cashRegisterEnabled && client.sumupAccessToken && (
            <div className="border-t border-line pt-8">
              <MobileAppConnect />
            </div>
          )}

          <div className="border-t border-line pt-8">
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

          <div className="border-t border-line pt-8">
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
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OpRow — fila de acceso operativo densa (no card de revista).
// ─────────────────────────────────────────────────────────────────────────────

function OpRow({
  href,
  title,
  desc,
}: {
  href: string
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors hover:border-brand hover:bg-[var(--row-hover)]"
    >
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-2">{desc}</p>
      </div>
      <ChevronRight
        className="h-4 w-4 text-ink-2 group-hover:text-brand transition-colors shrink-0"
        aria-hidden="true"
      />
    </Link>
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
    <div className="border-t border-line pt-8 flex items-start gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-ink mb-1">Facturas emitidas</h3>
        <p className="text-[0.8125rem] text-ink-2">
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
        className="shrink-0 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand hover:text-brand-strong transition-colors min-h-[40px]"
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
