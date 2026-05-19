import { db } from '@/db'
import { expenses, fixedCosts, ownerWithdrawals } from '@/db/schema'
import { and, eq, gte, lt, lte, sql, inArray } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { computeMonthlyPayroll } from '@/lib/payroll/monthly'
import { periodRevenueComponents } from '@/lib/finanzas/period-revenue'
import { computeRevenueCents, computeIvaBreakdown } from '@/lib/finanzas/pnl-math'

// -----------------------------------------------------------------------------
// GET /api/finanzas/summary?month=YYYY-MM
//
// Devuelve el resumen financiero del mes: ingresos, gastos variables, costes
// fijos, IVA repercutido/soportado, beneficio bruto, retiros e IRPF estimado.
//
// bookings.price está en EUROS — multiplicamos ×100 para normalizar a cents.
// -----------------------------------------------------------------------------

const VALID_IVA_CATEGORIES = ['productos', 'suministros', 'publicidad'] as const

function parseMonth(raw: string | null): { year: number; month: number } | null {
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
  return { year, month }
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const defaultYear = now.getFullYear()
  const defaultMonth = now.getMonth() + 1

  const rawMonth = searchParams.get('month')
  const parsed = rawMonth ? parseMonth(rawMonth) : { year: defaultYear, month: defaultMonth }
  if (!parsed) {
    return Response.json({ error: 'Formato de mes inválido. Usa YYYY-MM.' }, { status: 400 })
  }

  const { year, month } = parsed
  const { start, end } = monthBounds(year, month)
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const prevYearBounds = monthBounds(year - 1, month)

  const clientId = access.client.id

  const [
    revComponents,
    gastosResult,
    fixedResult,
    gastosConIvaResult,
    fixedConIvaResult,
    retirosResult,
    prevYearComponents,
  ] = await Promise.all([
    // Ingreso del periodo (servicios+extras+manual+productos+propinas) vía
    // helper compartido — única fuente, idéntico a quarterly/annual/etc.
    periodRevenueComponents(clientId, start, end),
    db.select({ total: sql<string>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.clientId, clientId), gte(expenses.date, start), lt(expenses.date, end))),
    db.select({ total: sql<string>`COALESCE(SUM(${fixedCosts.amountCents}), 0)` })
      .from(fixedCosts)
      .where(and(eq(fixedCosts.clientId, clientId), eq(fixedCosts.active, true), lte(fixedCosts.activeFrom, start))),
    db.select({ total: sql<string>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.clientId, clientId), gte(expenses.date, start), lt(expenses.date, end), inArray(expenses.category, VALID_IVA_CATEGORIES as unknown as string[]))),
    db.select({ total: sql<string>`COALESCE(SUM(${fixedCosts.amountCents}), 0)` })
      .from(fixedCosts)
      .where(and(eq(fixedCosts.clientId, clientId), eq(fixedCosts.active, true), lte(fixedCosts.activeFrom, start), inArray(fixedCosts.category, VALID_IVA_CATEGORIES as unknown as string[]))),
    db.select({ total: sql<string>`COALESCE(SUM(${ownerWithdrawals.amountCents}), 0)` })
      .from(ownerWithdrawals)
      .where(and(eq(ownerWithdrawals.clientId, clientId), gte(ownerWithdrawals.date, start), lt(ownerWithdrawals.date, end))),
    // YoY: SOLO servicios+extras del año anterior (comparativa de facturación
    // de servicios, no incluye productos/propinas/manual — semántica original).
    periodRevenueComponents(clientId, prevYearBounds.start, prevYearBounds.end, { includeManual: false }),
  ])

  const revenue = computeRevenueCents(revComponents)
  const manualIngresosCents = revenue.manualCents
  const productsIngresosCents = revenue.productsCents
  const tipsIngresosCents = revenue.tipsCents
  // Ingresos totales = servicios + extras + efectivo manual + PRODUCTOS +
  // PROPINAS (payroll ya descuenta comisión/payout de productos y propinas
  // como coste; sin su ingreso el beneficio quedaba infravalorado).
  const ingresosCents = revenue.totalCents
  const gastosVariablesCents = parseInt(gastosResult[0]?.total ?? '0', 10)
  const costosFijosCents = parseInt(fixedResult[0]?.total ?? '0', 10)
  const gastosVariablesConIvaCents = parseInt(gastosConIvaResult[0]?.total ?? '0', 10)
  const fixedConIvaCents = parseInt(fixedConIvaResult[0]?.total ?? '0', 10)
  const retirosCents = parseInt(retirosResult[0]?.total ?? '0', 10)
  // prevYear: solo bookingCents (servicios+extras), sin manual/productos/tips.
  const prevYearIngresosCents = computeRevenueCents(prevYearComponents).bookingCents

  // Nóminas del equipo — coste real para el local. Mismo helper que
  // /api/finanzas/payroll para asegurar coherencia entre lo que ve el
  // barbero en /equipo y la línea "Nóminas" del P&L aquí.
  const payroll = await computeMonthlyPayroll(clientId, { start, end })
  const nominasCents = Math.max(0, payroll.totalCents)

  // IVA configurable por tenant (clients.ivaRate) + propina fuera de la base
  // imponible — vía helper compartido (única fuente fiscal del P&L).
  const totalGastosCents = gastosVariablesCents + costosFijosCents + nominasCents
  const { ivaRepercutidoCents, ivaSoportadoCents, ivaAPagarCents, ingresosNetosCents } =
    computeIvaBreakdown({
      ingresosCents,
      tipsCents: tipsIngresosCents,
      gastosConIvaCents: gastosVariablesConIvaCents + fixedConIvaCents,
      ivaRate: access.client.ivaRate,
    })
  const beneficioBrutoCents = ingresosNetosCents - totalGastosCents
  const beneficioRealCents = beneficioBrutoCents - retirosCents
  const irpfEstimadoCents = Math.max(0, Math.round((beneficioBrutoCents * 20) / 100))

  return Response.json({
    month: monthStr,
    ingresosCents,
    manualIngresosCents,
    productsIngresosCents,
    tipsIngresosCents,
    gastosVariablesCents,
    costosFijosCents,
    nominasCents,
    totalGastosCents,
    ivaRepercutidoCents,
    ivaSoportadoCents,
    ivaAPagarCents,
    beneficioBrutoCents,
    retirosCents,
    beneficioRealCents,
    irpfEstimadoCents,
    prevYearIngresosCents,
  })
}
