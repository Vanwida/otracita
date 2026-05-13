import { db } from '@/db'
import { fixedCosts } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// GET  /api/finanzas/fixed-costs
// POST /api/finanzas/fixed-costs
// -----------------------------------------------------------------------------

const VALID_CATEGORIES = ['productos', 'suministros', 'publicidad', 'personal', 'nomina', 'otro']

function defaultActiveFrom(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const rows = await db
    .select({
      id: fixedCosts.id,
      name: fixedCosts.name,
      amountCents: fixedCosts.amountCents,
      category: fixedCosts.category,
      activeFrom: fixedCosts.activeFrom,
      active: fixedCosts.active,
      sortOrder: fixedCosts.sortOrder,
      createdAt: fixedCosts.createdAt,
    })
    .from(fixedCosts)
    .where(eq(fixedCosts.clientId, access.client.id))
    .orderBy(asc(fixedCosts.sortOrder), asc(fixedCosts.createdAt))

  return Response.json({ fixedCosts: rows })
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

  const { name, amountCents, category = 'otro', activeFrom } = body

  if (typeof name !== 'string' || name.trim().length === 0) {
    return Response.json({ error: 'name es obligatorio.' }, { status: 400 })
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

  const resolvedActiveFrom =
    typeof activeFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(activeFrom)
      ? activeFrom
      : defaultActiveFrom()

  const [fixedCost] = await db
    .insert(fixedCosts)
    .values({
      clientId: access.client.id,
      name: name.trim(),
      amountCents,
      category,
      activeFrom: resolvedActiveFrom,
    })
    .returning()

  return Response.json({ fixedCost }, { status: 201 })
}
