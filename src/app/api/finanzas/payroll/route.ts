import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { computeMonthlyPayroll } from '@/lib/payroll/monthly'

// -----------------------------------------------------------------------------
// GET /api/finanzas/payroll?month=YYYY-MM
//
// Devuelve la nómina computada del mes para cada barbero activo con perfil
// configurado. La agregación pesada vive en `src/lib/payroll/monthly.ts`
// (mismo helper que usa /api/finanzas/summary para coherencia).
//
// Pro-gated (controlFinanciero).
// -----------------------------------------------------------------------------

function monthBounds(raw: string): { start: string; end: string } | null {
  const m = raw.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
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
  const rawMonth = searchParams.get('month')
  if (!rawMonth) return Response.json({ error: 'month requerido (YYYY-MM)' }, { status: 400 })
  const bounds = monthBounds(rawMonth)
  if (!bounds) return Response.json({ error: 'Formato de mes inválido' }, { status: 400 })

  const payroll = await computeMonthlyPayroll(access.client.id, bounds)

  return Response.json({ month: rawMonth, items: payroll.items, totalCents: payroll.totalCents })
}
