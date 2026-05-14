import { db } from '@/db'
import { bonuses } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// PATCH  /api/bonuses/[id] — editar { name, unit, target, rewardCents, active }
// DELETE /api/bonuses/[id] — elimina (cascade borra entries de progreso)
// -----------------------------------------------------------------------------

const VALID_UNITS = new Set(['units', 'euros'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, string | number | boolean> = {}
  if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 80)
  if (typeof body.unit === 'string') {
    if (!VALID_UNITS.has(body.unit)) return Response.json({ error: 'unit inválido' }, { status: 400 })
    updates.unit = body.unit
  }
  if (typeof body.target === 'number') {
    const t = Math.round(body.target)
    if (t < 1) return Response.json({ error: 'target debe ser ≥ 1' }, { status: 400 })
    updates.target = t
  }
  if (typeof body.rewardCents === 'number') {
    const r = Math.round(body.rewardCents)
    if (r < 0) return Response.json({ error: 'rewardCents debe ser ≥ 0' }, { status: 400 })
    updates.rewardCents = r
  }
  if (typeof body.active === 'boolean') updates.active = body.active

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const [updated] = await db
    .update(bonuses)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(bonuses.id, id), eq(bonuses.clientId, access.client.id)))
    .returning()

  if (!updated) return Response.json({ error: 'Bono no encontrado' }, { status: 404 })
  return Response.json({ bonus: updated })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const { id } = await params
  const deleted = await db
    .delete(bonuses)
    .where(and(eq(bonuses.id, id), eq(bonuses.clientId, access.client.id)))
    .returning({ id: bonuses.id })

  if (deleted.length === 0) return Response.json({ error: 'Bono no encontrado' }, { status: 404 })
  return Response.json({ ok: true })
}
