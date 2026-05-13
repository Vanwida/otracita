import { db } from '@/db'
import { bookings, expenses, fixedCosts, manualIncomes } from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

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

  // 4 queries en vez de 60 paralelas
  const [bookingRows, expenseRows, fixedRows, manualRows] = await Promise.all([
    // Ingresos por mes — SUM(price) agrupado por mes
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${bookings.date}::date)::int`,
        totalEur: sql<string>`COALESCE(SUM(${bookings.price}), 0)`,
      })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end)))
      .groupBy(sql`EXTRACT(MONTH FROM ${bookings.date}::date)`),

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

    // Ingresos manuales por mes
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${manualIncomes.date}::date)::int`,
        total: sql<string>`COALESCE(SUM(${manualIncomes.amountCents}), 0)`,
      })
      .from(manualIncomes)
      .where(and(eq(manualIncomes.clientId, clientId), gte(manualIncomes.date, start), lt(manualIncomes.date, end)))
      .groupBy(sql`EXTRACT(MONTH FROM ${manualIncomes.date}::date)`),
  ])

  // Índices para acceso O(1)
  const bookingByMonth = new Map(bookingRows.map((r) => [r.month, parseFloat(r.totalEur)]))
  const expenseByMonth = new Map(expenseRows.map((r) => [r.month, { total: parseInt(r.total, 10), iva: parseInt(r.totalIva, 10) }]))
  const manualByMonth = new Map(manualRows.map((r) => [r.month, parseInt(r.total, 10)]))

  const monthResults = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const mStart = monthStart(year, month)
    const monthStr = `${year}-${String(month).padStart(2, '0')}`

    const ingresosCents = Math.round((bookingByMonth.get(month) ?? 0) * 100) + (manualByMonth.get(month) ?? 0)
    const expData = expenseByMonth.get(month) ?? { total: 0, iva: 0 }
    const gastosVariablesCents = expData.total
    const gastosVariablesIvaCents = expData.iva

    // Costes fijos activos para este mes
    const activeFixed = fixedRows.filter((fc) => fc.activeFrom <= mStart)
    const costosFijosCents = activeFixed.reduce((s, fc) => s + fc.amountCents, 0)
    const fixedIvaCents = activeFixed
      .filter((fc) => VALID_IVA_CATEGORIES.includes(fc.category))
      .reduce((s, fc) => s + fc.amountCents, 0)

    const totalGastosCents = gastosVariablesCents + costosFijosCents
    const ivaRepercutidoCents = Math.round((ingresosCents * 21) / 121)
    const ivaSoportadoCents = Math.round(((gastosVariablesIvaCents + fixedIvaCents) * 21) / 121)
    const ivaAPagarCents = Math.max(0, ivaRepercutidoCents - ivaSoportadoCents)
    const ingresosNetosCents = Math.round((ingresosCents * 100) / 121)
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
