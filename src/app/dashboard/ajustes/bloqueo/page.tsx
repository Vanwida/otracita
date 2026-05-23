export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import AdminLockCard from './AdminLockCard'
import {
  ADMIN_LOCKABLE_AREA_KEYS,
  normalizeLockedAreas,
} from '@/lib/admin-lock/areas'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/bloqueo — pestaña "Bloqueo con PIN" del área Ajustes.
//
// Aquí el jefe activa el lock con PIN y elige qué áreas marcar como
// sensibles. Mientras este iPad esté en uso, las áreas marcadas pedirán
// el PIN cuando alguien (incluido el jefe) las abra. Tras 30 min de
// inactividad o tap "Cerrar gestión" se vuelven a bloquear.
//
// NO es esta página la que se autobloquea (sería un bucle imposible —
// el jefe es quien edita la config). Se bloquea solo el contenido de las
// áreas marcadas via <AdminLockedArea>.
// -----------------------------------------------------------------------------

export default async function AjustesBloqueoPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const lockedSet = normalizeLockedAreas(client.adminLockedAreas)

  return (
    <AreaShell area="ajustes">
      <AreaContent scroll="region" maxWidth="6xl">
        <AdminLockCard
          initial={{
            lockEnabled: client.lockEnabled,
            hasPin: !!client.adminPinHash,
            pinUpdatedAt: client.adminPinUpdatedAt
              ? client.adminPinUpdatedAt.toISOString()
              : null,
            adminLockedAreas: Array.from(lockedSet),
          }}
          availableAreas={ADMIN_LOCKABLE_AREA_KEYS}
        />
      </AreaContent>
    </AreaShell>
  )
}
