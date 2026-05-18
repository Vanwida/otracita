import { db } from '@/db'
import { bonuses } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// /api/bonuses
//
// El catálogo de bonos pertenece al LOCAL, no al barbero. Cualquier barbero
// del equipo puede acumular progreso hacia cualquier bono activo.
//
// GET  → lista todos los bonos del tenant.
// POST → crea uno { name, kind, unit, target, rewardCents }.
//
// `kind` (R9): 'meta' (todo-o-nada, default) | 'tramo' (proporcional).
// `target`:
//   · unit='units'  → entero (reseñas, cortes, etc.). Mínimo 1.
//   · unit='euros'  → cents (multiplicar por 100 en el form).
// -----------------------------------------------------------------------------

const VALID_UNITS = new Set(['units', 'euros'])
const VALID_KINDS = new Set(['meta', 'tramo'])

interface CreateBody {
  name?: unknown
  kind?: unknown
  unit?: unknown
  target?: unknown
  rewardCents?: unknown
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const rows = await db
    .select({
      id: bonuses.id,
      name: bonuses.name,
      kind: bonuses.kind,
      unit: bonuses.unit,
      target: bonuses.target,
      rewardCents: bonuses.rewardCents,
      active: bonuses.active,
    })
    .from(bonuses)
    .where(eq(bonuses.clientId, access.client.id))
    .orderBy(asc(bonuses.createdAt))

  return Response.json({ bonuses: rows })
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
  const kind = typeof body.kind === 'string' && body.kind ? body.kind : 'meta'
  const unit = typeof body.unit === 'string' ? body.unit : ''
  const target = typeof body.target === 'number' ? Math.round(body.target) : NaN
  const rewardCents = typeof body.rewardCents === 'number' ? Math.round(body.rewardCents) : NaN

  if (!name) return Response.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!VALID_KINDS.has(kind)) return Response.json({ error: 'kind debe ser meta|tramo' }, { status: 400 })
  if (!VALID_UNITS.has(unit)) return Response.json({ error: 'unit debe ser units|euros' }, { status: 400 })
  if (!Number.isFinite(target) || target < 1) return Response.json({ error: 'target debe ser ≥ 1' }, { status: 400 })
  if (!Number.isFinite(rewardCents) || rewardCents < 0) {
    return Response.json({ error: 'rewardCents debe ser ≥ 0' }, { status: 400 })
  }

  const [created] = await db
    .insert(bonuses)
    .values({
      clientId: access.client.id,
      name,
      kind,
      unit,
      target,
      rewardCents,
      active: true,
    })
    .returning()

  return Response.json({ bonus: created })
}
