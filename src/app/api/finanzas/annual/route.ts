import { db } from '@/db'
import { expenses, fixedCosts } from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  annualRevenueComponentsByMonth,
  annualStockConsumptionCostByMonth,
} from '@/lib/finanzas/period-revenue'
import { computeRevenueCents, computeIvaBreakdown } from '@/lib/finanzas/pnl-math'
import { computePayrollTotalsByMonth } from '@/lib/payroll/by-month'

// -----------------------------------------------------------------------------
// GET /api/finanzas/annual?year=2026
//
// Devuelve los 12 meses del año con ingresos, gastos y beneficio.
// Usa 3 queries con GROUP BY en vez de 60 paralelas para evitar saturar
// el pool serverless de Neon.
// -----------------------------------------------------------------------------

const VALID_IVA_CATEGORIES = ['productos', 'suministros', 'publicidad']

function monthBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` }
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const rawYear = searchParams.get('year')
  const year = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear()

  if (isNaN(year) || year < 2020 || year > 2100) {
    return Response.json({ error: 'Año inválido.' }, { status: 400 })
  }

  const clientId = access.client.id
  const { start, end } = monthBounds(year)

  // Ingresos por mes vía helper compartido (servicios+extras+manual+
  // productos+propinas, GROUP BY mes — pocas queries, no satura Neon).
  // Antes este endpoint solo sumaba bookings+manual con 21/121 hardcoded
  // → divergía del P&L mensual de /summary.
  // monthKeys 'YYYY-MM' para el batch de nómina (12 meses → ~8 queries
  // agrupadas, NO 12×8 — mismo patrón que annualRevenueComponentsByMonth).
  const monthKeys = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`,
  )

  const [revByMonth, materialsByMonth, payrollByMonth, expenseRows, fixedRows] = await Promise.all([
    annualRevenueComponentsByMonth(clientId, start, end),
    annualStockConsumptionCostByMonth(clientId, start, end),
    computePayrollTotalsByMonth(clientId, start, end, monthKeys),

    // Gastos variables por mes — SUM con desglose IVA
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${expenses.date}::date)::int`,
        total: sql<string>`COALESCE(SUM(${expenses.amountCents}), 0)`,
        totalIva: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.category} IN ('productos', 'suministros', 'publicidad') THEN ${expenses.amountCents} ELSE 0 END), 0)`,
      })
      .from(expenses)
      .where(and(eq(expenses.clientId, clientId), gte(expenses.date, start), lt(expenses.date, end)))
      .groupBy(sql`EXTRACT(MONTH FROM ${expenses.date}::date)`),

    // Costes fijos activos — todos, filtramos activeFrom por mes en JS
    db
      .select({
        amountCents: fixedCosts.amountCents,
        category: fixedCosts.category,
        activeFrom: fixedCosts.activeFrom,
      })
      .from(fixedCosts)
      .where(and(eq(fixedCosts.clientId, clientId), eq(fixedCosts.active, true))),
  ])

  // Índices para acceso O(1)
  const expenseByMonth = new Map(expenseRows.map((r) => [r.month, { total: parseInt(r.total, 10), iva: parseInt(r.totalIva, 10) }]))

  const monthResults = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const mStart = monthStart(year, month)
    const monthStr = `${year}-${String(month).padStart(2, '0')}`

    const revComponents =
      revByMonth.get(month) ??
      { bookingPriceEuros: 0, extrasEuros: 0, manualCents: 0, productsCents: 0, tipsCents: 0 }
    const revenue = computeRevenueCents(revComponents)
    const ingresosCents = revenue.totalCents
    const expData = expenseByMonth.get(month) ?? { total: 0, iva: 0 }
    const gastosVariablesCents = expData.total
    const gastosVariablesIvaCents = expData.iva

    // Costes fijos activos para este mes
    const activeFixed = fixedRows.filter((fc) => fc.activeFrom <= mStart)
    const costosFijosCents = activeFixed.reduce((s, fc) => s + fc.amountCents, 0)
    const fixedIvaCents = activeFixed
      .filter((fc) => VALID_IVA_CATEGORIES.includes(fc.category))
      .reduce((s, fc) => s + fc.amountCents, 0)

    // Nóminas del equipo este mes (mismo helper que /summary, en BATCH).
    // Sin esto el beneficio anual no cuadra con el P&L mensual.
    const nominasCents = Math.max(0, payrollByMonth.totalByMonth.get(monthStr) ?? 0)
    // Coste materiales (stock consumido + merma) — mismo criterio que /summary.
    const materialsCostCents = materialsByMonth.get(month)?.totalCents ?? 0
    const totalGastosCents =
      gastosVariablesCents + costosFijosCents + nominasCents + materialsCostCents
    const { ivaAPagarCents, ingresosNetosCents } = computeIvaBreakdown({
      ingresosCents,
      tipsCents: revenue.tipsCents,
      gastosConIvaCents: gastosVariablesIvaCents + fixedIvaCents,
      ivaRate: access.client.ivaRate,
    })
    const beneficioBrutoCents = ingresosNetosCents - totalGastosCents

    return { month: monthStr, ingresosCents, totalGastosCents, beneficioBrutoCents, ivaAPagarCents }
  })

  const totals = monthResults.reduce(
    (acc, m) => ({
      ingresosCents: acc.ingresosCents + m.ingresosCents,
      totalGastosCents: acc.totalGastosCents + m.totalGastosCents,
      beneficioBrutoCents: acc.beneficioBrutoCents + m.beneficioBrutoCents,
      ivaAPagarCents: acc.ivaAPagarCents + m.ivaAPagarCents,
    }),
    { ingresosCents: 0, totalGastosCents: 0, beneficioBrutoCents: 0, ivaAPagarCents: 0 },
  )

  const activeMonths = monthResults.filter((m) => m.ingresosCents > 0)
  const bestMonth = monthResults.reduce((best, m) =>
    m.beneficioBrutoCents > best.beneficioBrutoCents ? m : best,
  )
  const avgIngresosCents =
    activeMonths.length > 0 ? Math.round(totals.ingresosCents / activeMonths.length) : 0

  return Response.json({
    year,
    months: monthResults,
    totals,
    bestMonth: bestMonth.month,
    avgIngresosCents,
    activeMonths: activeMonths.length,
  })
}
