import { db } from '@/db'
import { barberServiceCommissions, barbers as barbersTable } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// /api/commissions/per-service  (R8)
//
// Override de comisión de servicios por (barbero, servicio). Sin fila ⇒
// payroll usa el % global del barbero (no-regresión, ver
// computeServicesCommissionCents).
//
// GET  ?barberId=  → overrides de ese barbero [{ serviceName, pct }].
// PUT  { barberId, overrides:[{serviceName,pct}] } → reemplaza el set del
//        barbero (upsert lo presente + borra lo que ya no esté). pct fuera
//        de 0..100 se rechaza. Quitar un servicio = no mandarlo.
//
// Tenant SIEMPRE del session (requireClientAccess), nunca del body.
// -----------------------------------------------------------------------------

interface PutBody {
  barberId?: unknown
  overrides?: unknown
}

interface OverrideInput {
  serviceName?: unknown
  pct?: unknown
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const barberId = searchParams.get('barberId')
  if (!barberId) return Response.json({ error: 'barberId requerido' }, { status: 400 })

  const rows = await db
    .select({
      serviceName: barberServiceCommissions.serviceName,
      pct: barberServiceCommissions.pct,
    })
    .from(barberServiceCommissions)
    .where(
      and(
        eq(barberServiceCommissions.clientId, access.client.id),
        eq(barberServiceCommissions.barberId, barberId),
      ),
    )

  return Response.json({ overrides: rows })
}

export async function PUT(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  let body: PutBody
  try {
    body = (await request.json()) as PutBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const barberId = typeof body.barberId === 'string' ? body.barberId : ''
  if (!barberId) return Response.json({ error: 'barberId requerido' }, { status: 400 })
  if (!Array.isArray(body.overrides)) {
    return Response.json({ error: 'overrides debe ser un array' }, { status: 400 })
  }

  // Convención #1: nunca confiar en un id del body sin validar tenant. El
  // barbero DEBE pertenecer a la barbería de la sesión, si no se crearían
  // filas huérfanas (inertes porque monthly.ts scopea por clientId, pero
  // se cierra igual — mismo patrón que /api/bonuses/entries).
  const [ownedBarber] = await db
    .select({ id: barbersTable.id })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, access.client.id), eq(barbersTable.id, barberId)))
  if (!ownedBarber) {
    return Response.json({ error: 'Ese barbero no pertenece a tu barbería' }, { status: 403 })
  }

  // Valida + normaliza. serviceName trim no vacío, pct entero 0..100.
  const clean: { serviceName: string; pct: number }[] = []
  const seen = new Set<string>()
  for (const raw of body.overrides as OverrideInput[]) {
    const serviceName = typeof raw.serviceName === 'string' ? raw.serviceName.trim() : ''
    const pct = typeof raw.pct === 'number' ? Math.round(raw.pct) : NaN
    if (!serviceName) {
      return Response.json({ error: 'serviceName requerido en cada override' }, { status: 400 })
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return Response.json({ error: `pct de "${serviceName}" debe estar entre 0 y 100` }, { status: 400 })
    }
    const key = serviceName.toLowerCase()
    if (seen.has(key)) {
      return Response.json({ error: `servicio duplicado: "${serviceName}"` }, { status: 400 })
    }
    seen.add(key)
    clean.push({ serviceName, pct })
  }

  // Reemplazo del set del barbero. neon-http no da transacción interactiva,
  // así que: borrar lo que ya no está + upsert (atómico por fila vía la
  // unique). Lo edita un único dueño desde un panel de config → sin carrera
  // práctica, y cada operación es idempotente.
  const existing = await db
    .select({ serviceName: barberServiceCommissions.serviceName })
    .from(barberServiceCommissions)
    .where(
      and(
        eq(barberServiceCommissions.clientId, access.client.id),
        eq(barberServiceCommissions.barberId, barberId),
      ),
    )

  const keep = new Set(clean.map((c) => c.serviceName))
  for (const row of existing) {
    if (!keep.has(row.serviceName)) {
      await db
        .delete(barberServiceCommissions)
        .where(
          and(
            eq(barberServiceCommissions.clientId, access.client.id),
            eq(barberServiceCommissions.barberId, barberId),
            eq(barberServiceCommissions.serviceName, row.serviceName),
          ),
        )
    }
  }

  for (const c of clean) {
    await db
      .insert(barberServiceCommissions)
      .values({
        clientId: access.client.id,
        barberId,
        serviceName: c.serviceName,
        pct: c.pct,
      })
      .onConflictDoUpdate({
        target: [
          barberServiceCommissions.clientId,
          barberServiceCommissions.barberId,
          barberServiceCommissions.serviceName,
        ],
        set: { pct: c.pct, updatedAt: new Date() },
      })
  }

  return Response.json({ ok: true, count: clean.length })
}
