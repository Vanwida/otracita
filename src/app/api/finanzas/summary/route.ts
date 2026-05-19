import { db } from '@/db'
import { bookings, bookingServices, productSales, tips, expenses, fixedCosts, ownerWithdrawals, manualIncomes } from '@/db/schema'
import { and, eq, gte, lt, lte, sql, inArray } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { computeMonthlyPayroll } from '@/lib/payroll/monthly'

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
    ingresosResult,
    extrasResult,
    gastosResult,
    fixedResult,
    gastosConIvaResult,
    fixedConIvaResult,
    retirosResult,
    prevYearResult,
    prevYearExtrasResult,
    manualIngresosResult,
    productsIngresosResult,
    tipsIngresosResult,
  ] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${bookings.price}), 0)` })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
    // Servicios EXTRA (R7) — booking_services.priceEuros (EUROS, foot-gun).
    // Query separada (no LEFT JOIN) para no inflar SUM(bookings.price) por
    // fan-out cuando una cita tiene varios extras. Mismo filtro tenant/estado.
    db.select({ total: sql<string>`COALESCE(SUM(${bookingServices.priceEuros}), 0)` })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
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
    db.select({ total: sql<string>`COALESCE(SUM(${bookings.price}), 0)` })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, prevYearBounds.start), lt(bookings.date, prevYearBounds.end))),
    db.select({ total: sql<string>`COALESCE(SUM(${bookingServices.priceEuros}), 0)` })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, prevYearBounds.start), lt(bookings.date, prevYearBounds.end))),
    db.select({ total: sql<string>`COALESCE(SUM(${manualIncomes.amountCents}), 0)` })
      .from(manualIncomes)
      .where(and(eq(manualIncomes.clientId, clientId), gte(manualIncomes.date, start), lt(manualIncomes.date, end))),
    // ADD-1 — ingresos por venta de PRODUCTOS. payroll ya descuenta su
    // comisión como coste (nóminas) pero el P&L nunca sumaba su ingreso →
    // beneficio infravalorado. product_sales.total_cents ya en cents.
    db.select({ total: sql<string>`COALESCE(SUM(${productSales.totalCents}), 0)` })
      .from(productSales)
      .where(and(eq(productSales.clientId, clientId), gte(productSales.soldAt, new Date(start)), lt(productSales.soldAt, new Date(end)))),
    // ADD-1 — PROPINAS cobradas. Pasan al barbero vía nómina (coste ya
    // contabilizado); sin sumar su ingreso el P&L las trataba como gasto
    // puro. amount_cents ya en cents. Solo 'paid'. NOTA fiscal: la propina
    // NO lleva IVA en España → entra al beneficio pero NO a la base de IVA
    // (ver cálculo de ivaRepercutido abajo).
    db.select({ total: sql<string>`COALESCE(SUM(${tips.amountCents}), 0)` })
      .from(tips)
      .where(and(eq(tips.clientId, clientId), eq(tips.status, 'paid'), gte(tips.paidAt, new Date(start)), lt(tips.paidAt, new Date(end)))),
  ])

  // Principal + extras (R7) en EUROS → ×100 una sola vez sobre la suma,
  // mismo boundary de redondeo que bookingTotalCents y la factura.
  const bookingIngresosEuros =
    parseFloat(ingresosResult[0]?.total ?? '0') + parseFloat(extrasResult[0]?.total ?? '0')
  const bookingIngresosCents = Math.round(bookingIngresosEuros * 100)
  const manualIngresosCents = parseInt(manualIngresosResult[0]?.total ?? '0', 10)
  const productsIngresosCents = parseInt(productsIngresosResult[0]?.total ?? '0', 10)
  const tipsIngresosCents = parseInt(tipsIngresosResult[0]?.total ?? '0', 10)
  // ADD-1 — ingresos totales = servicios + extras + efectivo manual +
  // PRODUCTOS + PROPINAS. Antes faltaban productos y propinas pese a que
  // payroll ya descontaba su comisión/payout como coste → beneficio
  // infravalorado y asimétrico (gasto sin su ingreso).
  const ingresosCents =
    bookingIngresosCents +
    manualIngresosCents +
    productsIngresosCents +
    tipsIngresosCents
  const gastosVariablesCents = parseInt(gastosResult[0]?.total ?? '0', 10)
  const costosFijosCents = parseInt(fixedResult[0]?.total ?? '0', 10)
  const gastosVariablesConIvaCents = parseInt(gastosConIvaResult[0]?.total ?? '0', 10)
  const fixedConIvaCents = parseInt(fixedConIvaResult[0]?.total ?? '0', 10)
  const retirosCents = parseInt(retirosResult[0]?.total ?? '0', 10)
  const prevYearIngresosEuros =
    parseFloat(prevYearResult[0]?.total ?? '0') + parseFloat(prevYearExtrasResult[0]?.total ?? '0')
  const prevYearIngresosCents = Math.round(prevYearIngresosEuros * 100)

  // Nóminas del equipo — coste real para el local. Mismo helper que
  // /api/finanzas/payroll para asegurar coherencia entre lo que ve el
  // barbero en /equipo y la línea "Nóminas" del P&L aquí.
  const payroll = await computeMonthlyPayroll(clientId, { start, end })
  const nominasCents = Math.max(0, payroll.totalCents)

  // IVA configurable por tenant (clients.ivaRate, Spain default 21). El P&L
  // usaba el literal 21 y contradecía la factura, que ya respeta ivaRate
  // (ver invoicing-math.ts calculateAmounts). Para un tenant al 21% el
  // resultado es idéntico al de antes (21/121, 100/121) — sin regresión.
  // Importes son IVA-incluido (convención retail): base = total*100/(100+r),
  // IVA repercutido = total*r/(100+r).
  const ivaRate = access.client.ivaRate
  const ivaDenom = 100 + ivaRate

  const totalGastosCents = gastosVariablesCents + costosFijosCents + nominasCents
  // Base de IVA = ingresos SIN propinas: la propina no lleva IVA en España
  // (es gratuidad, fuera de la base imponible). Servicios, extras, productos
  // y efectivo manual sí. Sin esto el IVA repercutido se inflaría por las
  // propinas. Si no hay propinas, base == ingresosCents (sin regresión).
  const ivaBaseCents = ingresosCents - tipsIngresosCents
  const ivaRepercutidoCents = Math.round((ivaBaseCents * ivaRate) / ivaDenom)
  const gastosConIvaTotalCents = gastosVariablesConIvaCents + fixedConIvaCents
  const ivaSoportadoCents = Math.round((gastosConIvaTotalCents * ivaRate) / ivaDenom)
  const ivaAPagarCents = Math.max(0, ivaRepercutidoCents - ivaSoportadoCents)
  // Neto = base sin IVA + propinas (las propinas ya son netas, no llevan IVA).
  const ingresosNetosCents =
    Math.round((ivaBaseCents * 100) / ivaDenom) + tipsIngresosCents
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
