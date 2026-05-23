import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  ADMIN_LOCKABLE_AREA_KEYS,
  isAdminLockableAreaKey,
  type AdminLockableAreaKey,
} from '@/lib/admin-lock/areas'

// -----------------------------------------------------------------------------
// GET /api/admin-lock/config
//
// Devuelve el estado actual del admin-lock para el tenant del jefe:
//   { lockEnabled, hasPin, pinUpdatedAt, adminLockedAreas, availableAreas }
//
// PATCH /api/admin-lock/config
// Body: { lockEnabled?: boolean, adminLockedAreas?: string[] }
//
// Toggle global + lista de áreas a bloquear. NO toca el PIN (eso vive en
// /api/admin-lock/pin para no mezclar permisos con secretos).
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  return Response.json({
    lockEnabled: client.lockEnabled,
    hasPin: !!client.adminPinHash,
    pinUpdatedAt: client.adminPinUpdatedAt
      ? client.adminPinUpdatedAt.toISOString()
      : null,
    adminLockedAreas: (client.adminLockedAreas as AdminLockableAreaKey[] | null) ?? [],
    availableAreas: ADMIN_LOCKABLE_AREA_KEYS,
  })
}

interface Body {
  lockEnabled?: unknown
  adminLockedAreas?: unknown
}

export async function PATCH(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const updates: {
    lockEnabled?: boolean
    adminLockedAreas?: AdminLockableAreaKey[]
    updatedAt: Date
  } = { updatedAt: new Date() }

  if (body.lockEnabled !== undefined) {
    updates.lockEnabled = body.lockEnabled === true
  }

  if (body.adminLockedAreas !== undefined) {
    if (!Array.isArray(body.adminLockedAreas)) {
      return Response.json(
        { error: 'adminLockedAreas debe ser array' },
        { status: 400 },
      )
    }
    // Whitelist + dedupe. NUNCA confiamos en el body.
    const seen = new Set<AdminLockableAreaKey>()
    for (const k of body.adminLockedAreas) {
      if (isAdminLockableAreaKey(k)) seen.add(k)
    }
    updates.adminLockedAreas = Array.from(seen)
  }

  await db.update(clients).set(updates).where(eq(clients.id, client.id))

  return Response.json({
    ok: true,
    lockEnabled: updates.lockEnabled ?? client.lockEnabled,
    adminLockedAreas:
      updates.adminLockedAreas ??
      ((client.adminLockedAreas as AdminLockableAreaKey[] | null) ?? []),
    availableAreas: ADMIN_LOCKABLE_AREA_KEYS,
  })
}
