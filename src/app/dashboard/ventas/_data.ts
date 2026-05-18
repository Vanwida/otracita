import 'server-only'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import {
  bookings,
  cashSessions,
  clients,
  invoices,
  productSales,
  tips,
} from '@/db/schema'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
  PERIOD_OPTIONS,
} from '@/lib/dashboard/period'
import type { ClosedRegister } from '../caja/CajaRegisters'

// -----------------------------------------------------------------------------
// Datos compartidos del área Ventas. Extraído 1:1 del antiguo
// `caja/page.tsx` — las QUERIES Y LA LÓGICA DE SERVIDOR NO CAMBIAN: solo se
// centralizan para que las pestañas (Resumen / Cierre de caja / Cobros) las
// consuman sin duplicar. Multi-tenancy igual: el client se resuelve siempre
// de la sesión, nunca del request.
//
// bookings.price está en EUROS (foot-gun documentado en CLAUDE.md). tips,
// productSales e invoices viven en céntimos.
// -----------------------------------------------------------------------------

interface KpiRow {
  billed_eur: number | string
  completed_count: number
  tips_cents: number | string
  upsells_cents: number | string
  upsells_count: number
}

export interface VentasData {
  client: typeof clients.$inferSelect
  period: Period
  periodLabel: string
  periodStartIso: string | null
  billedEur: number
  completedCount: number
  tipsEur: number
  upsellsEur: number
  upsellsCount: number
  ticketMedio: number
  billedPrev: number | null
  completedPrev: number | null
  tipsPrevEur: number | null
  invoiceCountThisMonth: number
  hasEmittedInvoices: boolean
  registerHistory: ClosedRegister[]
}

/** Resuelve sesión + client + KPIs del periodo. Idéntico al caja/page.tsx
 *  original (mismas queries, mismos casts, mismo orden). */
export async function loadVentasData(
  rawPeriod: string | undefined,
): Promise<VentasData> {
  const period: Period = resolvePeriod(rawPeriod, 'month')

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const now = new Date()
  const periodStart = getPeriodStart(period, now)
  const periodStartIso = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`
    : null

  const previousPeriod = getPreviousPeriod(period, periodStart, now)
  const periodWhereDate = periodStartIso
    ? sql`AND date >= ${periodStartIso}`
    : sql``

  // ─── KPIs principales ────────────────────────────────────────────────────
  const [kpiRow] =
    (await db
      .execute(sql`
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
  `)
      .then((r) => (r as unknown as { rows: KpiRow[] }).rows)) ?? []

  const billedEur = Number(kpiRow?.billed_eur ?? 0)
  const completedCount = Number(kpiRow?.completed_count ?? 0)
  const tipsEur = Number(kpiRow?.tips_cents ?? 0) / 100
  const upsellsEur = Number(kpiRow?.upsells_cents ?? 0) / 100
  const upsellsCount = Number(kpiRow?.upsells_count ?? 0)

  let billedPrev: number | null = null
  let completedPrev: number | null = null
  let tipsPrevEur: number | null = null
  if (previousPeriod) {
    const [prevRow] =
      (await db
        .execute(sql`
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
    `)
        .then(
          (r) =>
            (
              r as unknown as {
                rows: {
                  billed_eur: string | number
                  completed_count: number
                  tips_cents: string | number
                }[]
              }
            ).rows,
        )) ?? []
    billedPrev = prevRow ? Number(prevRow.billed_eur) : null
    completedPrev = prevRow ? Number(prevRow.completed_count) : null
    tipsPrevEur = prevRow ? Number(prevRow.tips_cents) / 100 : null
  }

  // ─── Facturas: contador este mes + flag hasEmittedInvoices para lock ────
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const nextMonthStartIso = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10)
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
      .where(
        and(
          eq(cashSessions.clientId, client.id),
          isNotNull(cashSessions.closedAt),
        ),
      )
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

  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.key === period)?.label.toLowerCase() ?? period
  const ticketMedio = completedCount > 0 ? billedEur / completedCount : 0

  return {
    client,
    period,
    periodLabel,
    periodStartIso,
    billedEur,
    completedCount,
    tipsEur,
    upsellsEur,
    upsellsCount,
    ticketMedio,
    billedPrev,
    completedPrev,
    tipsPrevEur,
    invoiceCountThisMonth,
    hasEmittedInvoices,
    registerHistory,
  }
}
