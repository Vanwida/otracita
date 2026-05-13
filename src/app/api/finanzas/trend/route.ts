import { db } from '@/db'
import { bookings, expenses, fixedCosts } from '@/db/schema'
import { and, eq, gte, lt, lte, sql } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// GET /api/finanzas/trend?months=6
//
// Devuelve los últimos N meses de beneficio bruto para sparkline.
// bookings.price en EUROS — normalizado a cents ×100.
// Multi-tenancy via requireClientAccess. Feature gate: controlFinanciero.
// -----------------------------------------------------------------------------

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
  const rawMonths = searchParams.get('months')
  const n = Math.min(12, Math.max(2, parseInt(rawMonths ?? '6', 10) || 6))

  // Build list of YYYY-MM strings for the last n months
  const now = new Date()
  const monthKeys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const clientId = access.client.id

  const results = await Promise.all(
    monthKeys.map(async (mk) => {
      const [year, month] = mk.split('-').map(Number)
      const { start, end } = monthBounds(year, month)

      const [ingresosRes, gastosRes, fixedRes] = await Promise.all([
        db
          .select({ total: sql<string>`COALESCE(SUM(${bookings.price}), 0)` })
          .from(bookings)
          .where(
            and(
              eq(bookings.clientId, clientId),
              eq(bookings.status, 'completed'),
              gte(bookings.date, start),
              lt(bookings.date, end),
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
      ])

      const ingresosCents = Math.round(parseFloat(ingresosRes[0]?.total ?? '0') * 100)
      const gastosVariablesCents = parseInt(gastosRes[0]?.total ?? '0', 10)
      const costosFijosCents = parseInt(fixedRes[0]?.total ?? '0', 10)
      const totalGastosCents = gastosVariablesCents + costosFijosCents

      const ingresosNetosCents = Math.round((ingresosCents * 100) / 121)
      const beneficioBrutoCents = ingresosNetosCents - totalGastosCents

      return {
        month: mk,
        ingresosCents,
        totalGastosCents,
        beneficioBrutoCents,
      }
    }),
  )

  return Response.json({ months: results })
}
