import { db } from '@/db'
import { expenses, fixedCosts } from '@/db/schema'
import { and, eq, gte, lt, lte, sql, inArray } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  periodRevenueComponents,
  periodStockConsumptionCost,
} from '@/lib/finanzas/period-revenue'
import { computeRevenueCents, computeIvaBreakdown } from '@/lib/finanzas/pnl-math'
import { computePayrollTotalsByMonth } from '@/lib/payroll/by-month'

// -----------------------------------------------------------------------------
// GET /api/finanzas/quarterly?quarter=YYYY-QN
//
// Devuelve el resumen financiero trimestral desglosado por mes.
// Idénticos cálculos que /summary pero agregados en tres llamadas paralelas.
// -----------------------------------------------------------------------------

const VALID_IVA_CATEGORIES = ['productos', 'suministros', 'publicidad']

function currentQuarter(): { year: number; q: number } {
  const now = new Date()
  return { year: now.getFullYear(), q: Math.ceil((now.getMonth() + 1) / 3) }
}

function parseQuarter(raw: string | null): { year: number; q: number } | null {
  if (!raw) return currentQuarter()
  const m = raw.match(/^(\d{4})-Q([1-4])$/)
  if (!m) return null
  return { year: parseInt(m[1], 10), q: parseInt(m[2], 10) }
}

/** Returns the three calendar months in a quarter as YYYY-MM strings. */
function quarterMonths(year: number, q: number): string[] {
  const firstMonth = (q - 1) * 3 + 1
  return [firstMonth, firstMonth + 1, firstMonth + 2].map(
    (m) => `${year}-${String(m).padStart(2, '0')}`,
  )
}

function monthBounds(monthStr: string): { start: string; end: string } {
  const [yearStr, monthNum] = monthStr.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthNum, 10)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

async function calcMonth(
  clientId: string,
  monthStr: string,
  ivaRate: number,
  nominasCents: number,
): Promise<{
  month: string
  ingresosCents: number
  gastosVariablesCents: number
  costosFijosCents: number
  totalGastosCents: number
  ivaRepercutidoCents: number
  ivaSoportadoCents: number
  ivaAPagarCents: number
  beneficioBrutoCents: number
}> {
  const { start, end } = monthBounds(monthStr)

  // Ingreso vía helper compartido (servicios+extras+manual+productos+
  // propinas) — antes solo bookings+manual con 21/121 hardcoded.
  const [revComponents, gastosRes, fixedRes, gastosIvaRes, fixedIvaRes, materialsCost] = await Promise.all([
    periodRevenueComponents(clientId, start, end),
    db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.clientId, clientId),
          gte(expenses.date, start),
          lt(expenses.date, end),
        ),
      ),
    db
      .select({ total: sql<string>`COALESCE(SUM(${fixedCosts.amountCents}), 0)` })
      .from(fixedCosts)
      .where(
        and(
          eq(fixedCosts.clientId, clientId),
          eq(fixedCosts.active, true),
          lte(fixedCosts.activeFrom, start),
        ),
      ),
    db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.clientId, clientId),
          gte(expenses.date, start),
          lt(expenses.date, end),
          inArray(expenses.category, VALID_IVA_CATEGORIES),
        ),
      ),
    db
      .select({ total: sql<string>`COALESCE(SUM(${fixedCosts.amountCents}), 0)` })
      .from(fixedCosts)
      .where(
        and(
          eq(fixedCosts.clientId, clientId),
          eq(fixedCosts.active, true),
          lte(fixedCosts.activeFrom, start),
          inArray(fixedCosts.category, VALID_IVA_CATEGORIES),
        ),
      ),
    periodStockConsumptionCost(clientId, start, end),
  ])

  const revenue = computeRevenueCents(revComponents)
  const ingresosCents = revenue.totalCents
  const gastosVariablesCents = parseInt(gastosRes[0]?.total ?? '0', 10)
  const costosFijosCents = parseInt(fixedRes[0]?.total ?? '0', 10)
  const gastosConIvaCents =
    parseInt(gastosIvaRes[0]?.total ?? '0', 10) +
    parseInt(fixedIvaRes[0]?.total ?? '0', 10)

  // Nóminas del equipo este mes (mismo helper que /summary, en BATCH desde
  // el caller) — sin esto el beneficio del trimestre no cuadra con el P&L.
  // Coste materiales (stock consumido + merma) — mismo criterio que /summary.
  const materialsCostCents = materialsCost.totalCents
  const totalGastosCents =
    gastosVariablesCents + costosFijosCents + Math.max(0, nominasCents) + materialsCostCents
  const { ivaRepercutidoCents, ivaSoportadoCents, ivaAPagarCents, ingresosNetosCents } =
    computeIvaBreakdown({
      ingresosCents,
      tipsCents: revenue.tipsCents,
      gastosConIvaCents,
      ivaRate,
    })
  const beneficioBrutoCents = ingresosNetosCents - totalGastosCents

  return {
    month: monthStr,
    ingresosCents,
    gastosVariablesCents,
    costosFijosCents,
    totalGastosCents,
    ivaRepercutidoCents,
    ivaSoportadoCents,
    ivaAPagarCents,
    beneficioBrutoCents,
  }
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const parsed = parseQuarter(searchParams.get('quarter'))
  if (!parsed) {
    return Response.json(
      { error: 'Formato de trimestre inválido. Usa YYYY-QN (p.ej. 2026-Q2).' },
      { status: 400 },
    )
  }

  const { year, q } = parsed
  const months = quarterMonths(year, q)
  const quarterStr = `${year}-Q${q}`

  // Nómina del trimestre por mes — BATCH (1 set de queries para los 3 meses).
  const quarterStartBounds = monthBounds(months[0])
  const quarterEndBounds = monthBounds(months[months.length - 1])
  const { totalByMonth: payrollByMonth } = await computePayrollTotalsByMonth(
    access.client.id,
    quarterStartBounds.start,
    quarterEndBounds.end,
    months,
  )

  // Calculate all three months in parallel
  const monthResults = await Promise.all(
    months.map((m) =>
      calcMonth(access.client.id, m, access.client.ivaRate, payrollByMonth.get(m) ?? 0),
    ),
  )

  // Aggregate totals
  const totals = monthResults.reduce(
    (acc, m) => ({
      ingresosCents: acc.ingresosCents + m.ingresosCents,
      totalGastosCents: acc.totalGastosCents + m.totalGastosCents,
      beneficioBrutoCents: acc.beneficioBrutoCents + m.beneficioBrutoCents,
      ivaRepercutidoCents: acc.ivaRepercutidoCents + m.ivaRepercutidoCents,
      ivaSoportadoCents: acc.ivaSoportadoCents + m.ivaSoportadoCents,
      ivaAPagarCents: acc.ivaAPagarCents + m.ivaAPagarCents,
    }),
    {
      ingresosCents: 0,
      totalGastosCents: 0,
      beneficioBrutoCents: 0,
      ivaRepercutidoCents: 0,
      ivaSoportadoCents: 0,
      ivaAPagarCents: 0,
    },
  )

  const irpfAPagarCents = Math.max(0, Math.round((totals.beneficioBrutoCents * 20) / 100))
  const reservaCents = totals.ivaAPagarCents + irpfAPagarCents

  return Response.json({
    quarter: quarterStr,
    months: monthResults.map((m) => ({
      month: m.month,
      ingresosCents: m.ingresosCents,
      totalGastosCents: m.totalGastosCents,
      beneficioBrutoCents: m.beneficioBrutoCents,
      ivaAPagarCents: m.ivaAPagarCents,
    })),
    totals: {
      ingresosCents: totals.ingresosCents,
      totalGastosCents: totals.totalGastosCents,
      beneficioBrutoCents: totals.beneficioBrutoCents,
      ivaRepercutidoCents: totals.ivaRepercutidoCents,
      ivaSoportadoCents: totals.ivaSoportadoCents,
      ivaAPagarCents: totals.ivaAPagarCents,
      irpfAPagarCents,
      reservaCents,
    },
  })
}
