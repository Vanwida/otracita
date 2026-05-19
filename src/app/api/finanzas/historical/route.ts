import { db } from '@/db'
import { bookings, expenses } from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { periodRevenueComponents } from '@/lib/finanzas/period-revenue'
import { computeRevenueCents } from '@/lib/finanzas/pnl-math'

// -----------------------------------------------------------------------------
// GET /api/finanzas/historical
//
// Devuelve ingresos por año desde el primer año con datos hasta el actual.
// Útil para mostrar la progresión del negocio año a año.
// Nota: usa sólo bookings para ingresos — no incluye gastos (demasiado costoso
// agregar fixed_costs históricamente sin un modelo de "activo en cada mes").
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const clientId = access.client.id
  const currentYear = new Date().getFullYear()

  // Find first year with any booking or expense
  const [firstBooking, firstExpense] = await Promise.all([
    db
      .select({ minDate: sql<string>`MIN(${bookings.date})` })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'))),
    db
      .select({ minDate: sql<string>`MIN(${expenses.date})` })
      .from(expenses)
      .where(eq(expenses.clientId, clientId)),
  ])

  const dates = [firstBooking[0]?.minDate, firstExpense[0]?.minDate].filter(Boolean)
  if (dates.length === 0) {
    return Response.json({ years: [] })
  }

  const firstYear = Math.min(...dates.map((d) => parseInt(d!.slice(0, 4), 10)))
  if (firstYear > currentYear) {
    return Response.json({ years: [] })
  }

  // Build year range
  const yearRange = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i)

  // Aggregate ingresos and gastos variables per year in parallel
  const yearResults = await Promise.all(
    yearRange.map(async (year) => {
      const start = `${year}-01-01`
      const end = `${year + 1}-01-01`

      // Mismo basis de ingreso que /summary vía helper compartido
      // (servicios+extras+manual+productos+propinas). Antes solo bookings+
      // manual → divergía del P&L mensual al agregar el año.
      const [revComponents, expRes] = await Promise.all([
        periodRevenueComponents(clientId, start, end),
        db
          .select({ total: sql<string>`COALESCE(SUM(${expenses.amountCents}), 0)` })
          .from(expenses)
          .where(and(eq(expenses.clientId, clientId), gte(expenses.date, start), lt(expenses.date, end))),
      ])

      const ingresosCents = computeRevenueCents(revComponents).totalCents
      const gastosVariablesCents = parseInt(expRes[0]?.total ?? '0', 10)

      return { year, ingresosCents, gastosVariablesCents }
    }),
  )

  // YoY % change on ingresos
  const years = yearResults.map((y, i) => {
    const prev = yearResults[i - 1]
    const yoy =
      prev && prev.ingresosCents > 0
        ? Math.round(((y.ingresosCents - prev.ingresosCents) / prev.ingresosCents) * 100)
        : null
    return { ...y, yoyPct: yoy }
  })

  const bestYear = years.reduce((best, y) => (y.ingresosCents > best.ingresosCents ? y : best))

  return Response.json({ years, bestYear: bestYear.year })
}
