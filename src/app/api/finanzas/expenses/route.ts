import { db } from '@/db'
import { expenses } from '@/db/schema'
import { and, eq, gte, lt, desc } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// GET  /api/finanzas/expenses?month=YYYY-MM
// POST /api/finanzas/expenses
// -----------------------------------------------------------------------------

const VALID_CATEGORIES = ['productos', 'suministros', 'publicidad', 'personal', 'nomina', 'otro']

function parseMonth(raw: string | null): { start: string; end: string; month: string } | null {
  if (!raw) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    return buildBounds(year, month)
  }
  const m = raw.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
  return buildBounds(year, month)
}

function buildBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  return { start, end, month: monthStr }
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const bounds = parseMonth(searchParams.get('month'))
  if (!bounds) {
    return Response.json({ error: 'Formato de mes inválido. Usa YYYY-MM.' }, { status: 400 })
  }

  const rows = await db
    .select({
      id: expenses.id,
      date: expenses.date,
      amountCents: expenses.amountCents,
      category: expenses.category,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.clientId, access.client.id),
        gte(expenses.date, bounds.start),
        lt(expenses.date, bounds.end),
      ),
    )
    .orderBy(desc(expenses.date))

  return Response.json({ expenses: rows })
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { date, amountCents, category = 'otro', notes } = body

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'date debe ser YYYY-MM-DD.' }, { status: 400 })
  }
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return Response.json({ error: 'amountCents debe ser un entero positivo.' }, { status: 400 })
  }
  if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
    return Response.json(
      { error: `category debe ser uno de: ${VALID_CATEGORIES.join(', ')}.` },
      { status: 400 },
    )
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return Response.json({ error: 'notes debe ser string.' }, { status: 400 })
  }

  const [expense] = await db
    .insert(expenses)
    .values({
      clientId: access.client.id,
      date,
      amountCents,
      category,
      notes: typeof notes === 'string' ? notes : null,
    })
    .returning()

  return Response.json({ expense }, { status: 201 })
}
