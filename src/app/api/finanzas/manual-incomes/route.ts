import { db } from '@/db'
import { manualIncomes } from '@/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

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
  if (!rawMonth) return Response.json({ error: 'Falta el parámetro month.' }, { status: 400 })
  const bounds = monthBounds(rawMonth)
  if (!bounds) return Response.json({ error: 'Formato de mes inválido.' }, { status: 400 })

  const rows = await db
    .select()
    .from(manualIncomes)
    .where(and(eq(manualIncomes.clientId, access.client.id), gte(manualIncomes.date, bounds.start), lt(manualIncomes.date, bounds.end)))
    .orderBy(manualIncomes.date)

  return Response.json({
    incomes: rows.map((r) => ({
      id: r.id,
      date: r.date,
      amountCents: r.amountCents,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const body = await request.json() as { amountCents: number; date: string; notes?: string }
  if (!body.amountCents || body.amountCents <= 0) {
    return Response.json({ error: 'Importe inválido.' }, { status: 400 })
  }
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return Response.json({ error: 'Fecha inválida.' }, { status: 400 })
  }

  const [created] = await db.insert(manualIncomes).values({
    clientId: access.client.id,
    date: body.date,
    amountCents: body.amountCents,
    notes: body.notes ?? null,
  }).returning()

  return Response.json({
    income: {
      id: created.id,
      date: created.date,
      amountCents: created.amountCents,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
    },
  })
}
