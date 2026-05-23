import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { headers } from 'next/headers'
import { getAdminLockSession } from './session'
import {
  normalizeLockedAreas,
  type AdminLockableAreaKey,
} from './areas'

// -----------------------------------------------------------------------------
// Admin-lock guard — server-side.
//
// Modelo:
//   1. El dashboard /dashboard/* asume sesión admin (Better Auth) — el iPad
//      ya está logueado como el jefe.
//   2. Si el jefe NO ha activado el lock (`lockEnabled = false`) → ningún
//      área se bloquea (todo abierto al equipo).
//   3. Si lockEnabled = true Y el área está en `adminLockedAreas` Y NO hay
//      cookie admin-lock-session válida → se muestra el overlay PIN.
//   4. Si lockEnabled + área marcada + cookie válida → contenido se renderiza.
//
// `isAreaLocked(areaKey)` se usa desde el wrapper <AdminLockedArea> en las
// páginas server-component. Resuelve el tenant del usuario logueado (no
// acepta clientId del caller). Si NO hay sesión admin → área NO bloqueada
// aquí (lo gestiona el layout de /dashboard que ya redirige a /login).
// -----------------------------------------------------------------------------

export interface AreaLockState {
  /** El área está marcada como sensible Y la cookie admin-lock no está
   *  presente o ha expirado. La page debe mostrar el overlay PIN. */
  locked: boolean
  /** Slug público del tenant (para el POST de unlock desde el overlay). */
  clientId: string | null
  /** Si está activado el lock globalmente — útil para mensajes. */
  lockEnabled: boolean
}

/**
 * Resuelve si un área concreta está bloqueada para el usuario logueado.
 *
 * Devuelve `locked: false` si:
 *   · No hay sesión admin (defensivo — el layout redirige a /login).
 *   · El cliente no se encuentra (defensivo — el layout redirige a setup).
 *   · El lock global está desactivado.
 *   · El área no está marcada como sensible.
 *   · Hay cookie admin-lock válida para este tenant.
 */
export async function isAreaLocked(
  areaKey: AdminLockableAreaKey,
): Promise<AreaLockState> {
  const session = await auth.api.getSession({ headers: await headers() })
  const email = session?.user?.email ?? null
  if (!email) {
    return { locked: false, clientId: null, lockEnabled: false }
  }

  const [client] = await db.select().from(clients).where(eq(clients.email, email))
  if (!client) {
    return { locked: false, clientId: null, lockEnabled: false }
  }

  if (!client.lockEnabled) {
    return { locked: false, clientId: client.id, lockEnabled: false }
  }

  const locked = normalizeLockedAreas(client.adminLockedAreas)
  if (!locked.has(areaKey)) {
    return { locked: false, clientId: client.id, lockEnabled: true }
  }

  // Lock activado + área marcada → necesita cookie viva.
  const sess = await getAdminLockSession()
  if (sess && sess.clientId === client.id) {
    return { locked: false, clientId: client.id, lockEnabled: true }
  }

  return { locked: true, clientId: client.id, lockEnabled: true }
}
