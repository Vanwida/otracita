import { db } from '@/db'
import { teamCompetitions } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// /api/competitions  (R10)
//
// Competición semanal de equipo. El local define la competición; el ganador
// de cada semana ISO se resuelve en /api/competitions/leaderboard.
//
// GET   → competiciones del tenant.
// POST  → crea { name, metric, rewardCentsPerWeek, streakWeeksForBonus?,
//                streakBonusCents? }.
// PATCH → edita { id, ...campos } (incl. active para archivar sin borrar).
//
// Payout STANDALONE v1: NO toca nómina ni P&L.
// -----------------------------------------------------------------------------

const VALID_METRICS = new Set(['revenue', 'bookings'])

interface CreateBody {
  name?: unknown
  metric?: unknown
  rewardCentsPerWeek?: unknown
  streakWeeksForBonus?: unknown
  streakBonusCents?: unknown
}

interface PatchBody extends CreateBody {
  id?: unknown
  active?: unknown
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const rows = await db
    .select()
    .from(teamCompetitions)
    .where(eq(teamCompetitions.clientId, access.client.id))
    .orderBy(asc(teamCompetitions.createdAt))

  return Response.json({ competitions: rows })
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const metric = typeof body.metric === 'string' ? body.metric : ''
  const rewardCentsPerWeek =
    typeof body.rewardCentsPerWeek === 'number' ? Math.round(body.rewardCentsPerWeek) : NaN
  const streakWeeksForBonus =
    typeof body.streakWeeksForBonus === 'number' ? Math.round(body.streakWeeksForBonus) : 4
  const streakBonusCents =
    typeof body.streakBonusCents === 'number' ? Math.round(body.streakBonusCents) : 0

  if (!name) return Response.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!VALID_METRICS.has(metric)) {
    return Response.json({ error: 'metric debe ser revenue|bookings' }, { status: 400 })
  }
  if (!Number.isFinite(rewardCentsPerWeek) || rewardCentsPerWeek < 0) {
    return Response.json({ error: 'rewardCentsPerWeek debe ser ≥ 0' }, { status: 400 })
  }
  if (streakWeeksForBonus < 1) {
    return Response.json({ error: 'streakWeeksForBonus debe ser ≥ 1' }, { status: 400 })
  }
  if (streakBonusCents < 0) {
    return Response.json({ error: 'streakBonusCents debe ser ≥ 0' }, { status: 400 })
  }

  const [created] = await db
    .insert(teamCompetitions)
    .values({
      clientId: access.client.id,
      name,
      metric,
      rewardCentsPerWeek,
      streakWeeksForBonus,
      streakBonusCents,
      active: true,
    })
    .returning()

  return Response.json({ competition: created })
}

export async function PATCH(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, string | number | boolean> = {}
  if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 80)
  if (typeof body.metric === 'string') {
    if (!VALID_METRICS.has(body.metric)) {
      return Response.json({ error: 'metric inválido' }, { status: 400 })
    }
    updates.metric = body.metric
  }
  if (typeof body.rewardCentsPerWeek === 'number') {
    const v = Math.round(body.rewardCentsPerWeek)
    if (v < 0) return Response.json({ error: 'rewardCentsPerWeek debe ser ≥ 0' }, { status: 400 })
    updates.rewardCentsPerWeek = v
  }
  if (typeof body.streakWeeksForBonus === 'number') {
    const v = Math.round(body.streakWeeksForBonus)
    if (v < 1) return Response.json({ error: 'streakWeeksForBonus debe ser ≥ 1' }, { status: 400 })
    updates.streakWeeksForBonus = v
  }
  if (typeof body.streakBonusCents === 'number') {
    const v = Math.round(body.streakBonusCents)
    if (v < 0) return Response.json({ error: 'streakBonusCents debe ser ≥ 0' }, { status: 400 })
    updates.streakBonusCents = v
  }
  if (typeof body.active === 'boolean') updates.active = body.active

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const [updated] = await db
    .update(teamCompetitions)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(teamCompetitions.id, id), eq(teamCompetitions.clientId, access.client.id)))
    .returning()

  if (!updated) return Response.json({ error: 'Competición no encontrada' }, { status: 404 })
  return Response.json({ competition: updated })
}
