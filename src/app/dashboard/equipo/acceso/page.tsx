export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaContent from '../../_components/AreaContent'
import TeamAccessCard from './TeamAccessCard'
import { normalizeAllowedAreas, TEAM_AREA_KEYS, TEAM_AREA_FORBIDDEN } from '@/lib/team-auth/areas'

// -----------------------------------------------------------------------------
// /dashboard/equipo/acceso — pestaña ACCESO del área Equipo.
//
// Config del MODO EQUIPO (un solo PIN compartido, no login por barbero, no
// trazabilidad individual). El dueño tilda qué áreas quiere que el equipo
// pueda ver desde /equipo/<slug>/ con el PIN. Sin scroll vertical: la card
// vive en grid 2-col en desktop y cabe en viewport.
// -----------------------------------------------------------------------------

export default async function EquipoAccesoPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const allowedSet = normalizeAllowedAreas(client.teamAllowedAreas)
  const availableAreas = TEAM_AREA_KEYS.filter((k) => !TEAM_AREA_FORBIDDEN.has(k))

  return (
    <AreaContent scroll="region" maxWidth="6xl">
      <TeamAccessCard
        publicSlug={client.publicSlug}
        initial={{
          enabled: client.teamAccessEnabled,
          hasPin: !!client.teamPinHash,
          pinUpdatedAt: client.teamPinUpdatedAt ? client.teamPinUpdatedAt.toISOString() : null,
          allowedAreas: Array.from(allowedSet),
        }}
        availableAreas={availableAreas}
      />
    </AreaContent>
  )
}
