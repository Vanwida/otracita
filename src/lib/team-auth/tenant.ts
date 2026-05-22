import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { readTeamSessionFromRequest } from './session'
import { normalizeAllowedAreas, type TeamAreaKey } from './areas'

// -----------------------------------------------------------------------------
// requireTenantAccess — resuelve el tenant en rutas que aceptan AMBOS modos:
// admin (sesión Better Auth) o equipo (cookie firmada del modo equipo).
//
// Política:
//   1. Si pasa requireClientAccess (admin) → tenant resuelto vía esa ruta.
//   2. Si no, intenta cookie del equipo; valida en DB que
//      `teamAccessEnabled = true` y carga `teamAllowedAreas`.
//   3. Si nada → 401.
//
// El caller decide qué hacer con el flag `mode`:
//   · 'admin' → permitir operaciones destructivas.
//   · 'team'  → restricciones aplicadas en handler (rechazar DELETE, etc.).
//
// Acceptar el team-cookie en endpoints existentes es ADITIVO: si una ruta
// no llama esta helper sigue siendo admin-only.
// -----------------------------------------------------------------------------

import { requireClientAccess, type ClientRow } from '@/lib/auth/require-client-access'

export type TenantAccess =
  | {
      ok: true
      mode: 'admin'
      client: ClientRow
      user: { id: string; email: string }
      /** Para modo admin, todas las áreas. Útil para handlers que branch en área. */
      allowedAreas: 'all'
      isAdmin: boolean
    }
  | {
      ok: true
      mode: 'team'
      client: ClientRow
      /** Áreas habilitadas para el equipo (Set congelado del jsonb del client). */
      allowedAreas: Set<TeamAreaKey>
    }
  | {
      ok: false
      status: 401 | 403 | 404
      error: string
    }

export async function requireTenantAccess(req: Request): Promise<TenantAccess> {
  // Intento admin primero — si hay sesión Better Auth válida, prioridad.
  const adminTry = await requireClientAccess(req)
  if (adminTry.ok) {
    return {
      ok: true,
      mode: 'admin',
      client: adminTry.client,
      user: adminTry.user,
      allowedAreas: 'all',
      isAdmin: adminTry.isAdmin,
    }
  }

  // Sin sesión admin: probar cookie del equipo.
  const teamSess = readTeamSessionFromRequest(req)
  if (!teamSess) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, teamSess.clientId))
  if (!client) {
    return { ok: false, status: 404, error: 'Client not found' }
  }
  if (!client.teamAccessEnabled) {
    return { ok: false, status: 403, error: 'Acceso del equipo desactivado' }
  }

  return {
    ok: true,
    mode: 'team',
    client,
    allowedAreas: normalizeAllowedAreas(client.teamAllowedAreas),
  }
}

export function tenantAccessErrorResponse(
  access: Extract<TenantAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status })
}
