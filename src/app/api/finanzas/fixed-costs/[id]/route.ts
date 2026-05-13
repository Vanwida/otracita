import { db } from '@/db'
import { fixedCosts } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// PATCH  /api/finanzas/fixed-costs/[id]
// DELETE /api/finanzas/fixed-costs/[id]
// -----------------------------------------------------------------------------

const VALID_CATEGORIES = ['productos', 'suministros', 'publicidad', 'personal', 'nomina', 'otro']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  // Verify ownership before building the update set
  const existing = await db
    .select({ id: fixedCosts.id })
    .from(fixedCosts)
    .where(and(eq(fixedCosts.id, id), eq(fixedCosts.clientId, access.client.id)))
    .limit(1)

  if (existing.length === 0) {
    return Response.json({ error: 'Coste fijo no encontrado.' }, { status: 404 })
  }

  const patch: Partial<{
    name: string
    amountCents: number
    category: string
    active: boolean
    activeFrom: string
    sortOrder: number
  }> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return Response.json({ error: 'name no puede estar vacío.' }, { status: 400 })
    }
    patch.name = body.name.trim()
  }

  if (body.amountCents !== undefined) {
    if (
      typeof body.amountCents !== 'number' ||
      !Number.isInteger(body.amountCents) ||
      body.amountCents <= 0
    ) {
      return Response.json({ error: 'amountCents debe ser un entero positivo.' }, { status: 400 })
    }
    patch.amountCents = body.amountCents
  }

  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !VALID_CATEGORIES.includes(body.category)) {
      return Response.json(
        { error: `category debe ser uno de: ${VALID_CATEGORIES.join(', ')}.` },
        { status: 400 },
      )
    }
    patch.category = body.category
  }

  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      return Response.json({ error: 'active debe ser boolean.' }, { status: 400 })
    }
    patch.active = body.active
  }

  if (body.activeFrom !== undefined) {
    if (
      typeof body.activeFrom !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.activeFrom)
    ) {
      return Response.json({ error: 'activeFrom debe ser YYYY-MM-DD.' }, { status: 400 })
    }
    patch.activeFrom = body.activeFrom
  }

  if (body.sortOrder !== undefined) {
    if (
      typeof body.sortOrder !== 'number' ||
      !Number.isInteger(body.sortOrder) ||
      body.sortOrder < 0
    ) {
      return Response.json({ error: 'sortOrder debe ser un entero >= 0.' }, { status: 400 })
    }
    patch.sortOrder = body.sortOrder
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'No se proporcionaron campos para actualizar.' }, { status: 400 })
  }

  const [fixedCost] = await db
    .update(fixedCosts)
    .set(patch)
    .where(and(eq(fixedCosts.id, id), eq(fixedCosts.clientId, access.client.id)))
    .returning()

  return Response.json({ fixedCost })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { id } = await params

  const deleted = await db
    .delete(fixedCosts)
    .where(and(eq(fixedCosts.id, id), eq(fixedCosts.clientId, access.client.id)))
    .returning({ id: fixedCosts.id })

  if (deleted.length === 0) {
    return Response.json({ error: 'Coste fijo no encontrado.' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
