import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  TEAM_AREA_KEYS,
  TEAM_AREA_FORBIDDEN,
  isTeamAreaKey,
  type TeamAreaKey,
} from '@/lib/team-auth/areas'

// -----------------------------------------------------------------------------
// PATCH /api/team-access/config
//
// Body: { teamAccessEnabled?: boolean, teamAllowedAreas?: string[] }
//
// Toggle on/off del acceso del equipo + lista de áreas habilitadas. NO toca
// el PIN (eso vive en /api/team-access/pin para no mezclar permisos con
// secretos). Si se desactiva el acceso, las cookies emitidas DEJAN de
// validar contra la DB en el siguiente render del layout (que checa
// `teamAccessEnabled`), por lo que el equipo cae a /login al instante.
// -----------------------------------------------------------------------------

interface Body {
  teamAccessEnabled?: unknown
  teamAllowedAreas?: unknown
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
    teamAccessEnabled?: boolean
    teamAllowedAreas?: TeamAreaKey[]
    updatedAt: Date
  } = { updatedAt: new Date() }

  if (body.teamAccessEnabled !== undefined) {
    updates.teamAccessEnabled = body.teamAccessEnabled === true
  }

  if (body.teamAllowedAreas !== undefined) {
    if (!Array.isArray(body.teamAllowedAreas)) {
      return Response.json({ error: 'teamAllowedAreas debe ser array' }, { status: 400 })
    }
    // Whitelist + sin duplicados + sin prohibidas. NO confiamos en el body.
    const seen = new Set<TeamAreaKey>()
    for (const k of body.teamAllowedAreas) {
      if (isTeamAreaKey(k) && !TEAM_AREA_FORBIDDEN.has(k)) {
        seen.add(k)
      }
    }
    updates.teamAllowedAreas = Array.from(seen)
  }

  await db.update(clients).set(updates).where(eq(clients.id, client.id))

  return Response.json({
    ok: true,
    teamAccessEnabled: updates.teamAccessEnabled ?? client.teamAccessEnabled,
    teamAllowedAreas:
      updates.teamAllowedAreas ?? (client.teamAllowedAreas as TeamAreaKey[] | null) ?? [],
    availableAreas: TEAM_AREA_KEYS.filter((k) => !TEAM_AREA_FORBIDDEN.has(k)),
  })
}
