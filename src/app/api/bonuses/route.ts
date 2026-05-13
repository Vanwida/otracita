import { db } from '@/db'
import { barberBonuses, barbers as barbersTable } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// /api/bonuses
//
// GET  → lista todos los bonos de todos los barberos del tenant (Pro).
// POST → crea un bono { barberId, name, unit, target, rewardCents }.
//
// `target`:
//   · unit='units'  → entero (reseñas, ventas, días). Mínimo 1.
//   · unit='euros'  → cents (€ vendidos). Multiplicar por 100 en el form.
// `rewardCents`: siempre en cents (precio final que cobra el barbero).
// -----------------------------------------------------------------------------

const VALID_UNITS = new Set(['units', 'euros'])

interface CreateBody {
  barberId?: unknown
  name?: unknown
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
      id: barberBonuses.id,
      barberId: barberBonuses.barberId,
      barberName: barbersTable.name,
      name: barberBonuses.name,
      unit: barberBonuses.unit,
      target: barberBonuses.target,
      rewardCents: barberBonuses.rewardCents,
      active: barberBonuses.active,
    })
    .from(barberBonuses)
    .innerJoin(barbersTable, eq(barberBonuses.barberId, barbersTable.id))
    .where(eq(barberBonuses.clientId, access.client.id))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name), asc(barberBonuses.createdAt))

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

  const barberId = typeof body.barberId === 'string' ? body.barberId : null
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const unit = typeof body.unit === 'string' ? body.unit : ''
  const target = typeof body.target === 'number' ? Math.round(body.target) : NaN
  const rewardCents = typeof body.rewardCents === 'number' ? Math.round(body.rewardCents) : NaN

  if (!barberId) return Response.json({ error: 'barberId requerido' }, { status: 400 })
  if (!name) return Response.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!VALID_UNITS.has(unit)) return Response.json({ error: 'unit debe ser units|euros' }, { status: 400 })
  if (!Number.isFinite(target) || target < 1) return Response.json({ error: 'target debe ser ≥ 1' }, { status: 400 })
  if (!Number.isFinite(rewardCents) || rewardCents < 0) {
    return Response.json({ error: 'rewardCents debe ser ≥ 0' }, { status: 400 })
  }

  // Validar que el barber pertenece a este tenant.
  const [barberRow] = await db
    .select({ id: barbersTable.id })
    .from(barbersTable)
    .where(and(eq(barbersTable.id, barberId), eq(barbersTable.clientId, access.client.id)))
  if (!barberRow) return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })

  const [created] = await db
    .insert(barberBonuses)
    .values({
      clientId: access.client.id,
      barberId,
      name,
      unit,
      target,
      rewardCents,
      active: true,
    })
    .returning()

  return Response.json({ bonus: created })
}
