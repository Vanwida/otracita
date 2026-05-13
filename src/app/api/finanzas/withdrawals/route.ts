import { db } from '@/db'
import { ownerWithdrawals } from '@/db/schema'
import { and, eq, gte, lt, desc } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// GET  /api/finanzas/withdrawals?month=YYYY-MM
// POST /api/finanzas/withdrawals
// -----------------------------------------------------------------------------

function parseMonth(raw: string | null): { start: string; end: string } | null {
  let year: number
  let month: number

  if (!raw) {
    const now = new Date()
    year = now.getFullYear()
    month = now.getMonth() + 1
  } else {
    const m = raw.match(/^(\d{4})-(\d{2})$/)
    if (!m) return null
    year = parseInt(m[1], 10)
    month = parseInt(m[2], 10)
    if (month < 1 || month > 12) return null
  }

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
  const bounds = parseMonth(searchParams.get('month'))
  if (!bounds) {
    return Response.json({ error: 'Formato de mes inválido. Usa YYYY-MM.' }, { status: 400 })
  }

  const rows = await db
    .select({
      id: ownerWithdrawals.id,
      date: ownerWithdrawals.date,
      amountCents: ownerWithdrawals.amountCents,
      notes: ownerWithdrawals.notes,
      createdAt: ownerWithdrawals.createdAt,
    })
    .from(ownerWithdrawals)
    .where(
      and(
        eq(ownerWithdrawals.clientId, access.client.id),
        gte(ownerWithdrawals.date, bounds.start),
        lt(ownerWithdrawals.date, bounds.end),
      ),
    )
    .orderBy(desc(ownerWithdrawals.date))

  return Response.json({ withdrawals: rows })
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

  const { date, amountCents, notes } = body

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'date debe ser YYYY-MM-DD.' }, { status: 400 })
  }
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return Response.json({ error: 'amountCents debe ser un entero positivo.' }, { status: 400 })
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return Response.json({ error: 'notes debe ser string.' }, { status: 400 })
  }

  const [withdrawal] = await db
    .insert(ownerWithdrawals)
    .values({
      clientId: access.client.id,
      date,
      amountCents,
      notes: typeof notes === 'string' ? notes : null,
    })
    .returning()

  return Response.json({ withdrawal }, { status: 201 })
}
