import { randomBytes } from 'node:crypto'
import { db } from '@/db'
import { barbers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// /api/barbers/[id]/personal-token (admin) — generar / revocar el link
// personal del barbero (#71).
//
// POST   → genera (o regenera) un token random hex 32 bytes y devuelve la
//          URL completa UNA sola vez. Al refrescar la página NO vuelve a
//          devolver el token (DB guarda el token plano para poder validarlo
//          en cada request: no es un secreto compartido tipo password, es
//          un identificador de acceso largo y aleatorio, mismo modelo que
//          un magic link permanente). Si se regenera, el viejo deja de
//          funcionar inmediatamente.
//
// DELETE → revoca: borra el token. Las cookies ya emitidas siguen siendo
//          válidas hasta su expiración (TTL 1 año); para invalidarlas de
//          inmediato, el jefe puede desactivar el barbero (active=false)
//          — requireBarberAccess gatea por `active=true`.
//
// Solo el dueño del tenant (no el barbero) puede hacer estas operaciones.
// -----------------------------------------------------------------------------

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function buildPublicUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://otracita.app'
  // Quitamos slash final si lo hubiera, no asumimos nada del entorno.
  const trimmed = base.replace(/\/$/, '')
  return `${trimmed}/r/${token}?install=1`
}

async function loadOwned(clientId: string, id: string) {
  const [row] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.id, id), eq(barbers.clientId, clientId)))
  return row ?? null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { id } = await params

  const row = await loadOwned(access.client.id, id)
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 })

  const token = generateToken()
  const now = new Date()

  await db
    .update(barbers)
    .set({
      personalAccessToken: token,
      personalAccessGeneratedAt: now,
      updatedAt: now,
    })
    .where(eq(barbers.id, id))

  return Response.json({
    url: buildPublicUrl(token),
    generatedAt: now.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { id } = await params

  const row = await loadOwned(access.client.id, id)
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 })

  await db
    .update(barbers)
    .set({
      personalAccessToken: null,
      personalAccessGeneratedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(barbers.id, id))

  return Response.json({ ok: true })
}
