export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import AreaContent from '../../_components/AreaContent'
import ComisionesClient from '../comisiones/ComisionesClient'

// -----------------------------------------------------------------------------
// /dashboard/equipo/competicion — pestaña COMPETICIÓN del área Equipo.
//
// Contrato de IA: Competición (R10) es su propia pestaña, separada de
// Comisiones (R8+R9). Reusa el MISMO ComisionesClient con view="competicion"
// — no se duplica lógica ni se cambia ninguna query/endpoint; el componente
// solo pinta su Section R10 (CRUD competiciones + leaderboard semanal).
//
// Pro-gated por `teamBonuses` (igual que Comisiones).
// -----------------------------------------------------------------------------

interface ServiceRow {
  name?: unknown
}

export default async function EquipoCompeticionPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const enabled = hasFeature(client, 'teamBonuses')

  // serviceNames no lo usa la vista competición, pero ComisionesClient
  // mantiene la misma firma (no se cambia el contrato del componente).
  const rawServices = (client.chatbotServices ?? []) as ServiceRow[]
  const serviceNames = Array.isArray(rawServices)
    ? Array.from(
        new Set(
          rawServices
            .map((s) => (typeof s?.name === 'string' ? s.name.trim() : ''))
            .filter((n): n is string => n.length > 0),
        ),
      )
    : []

  return (
    <AreaContent scroll="region" maxWidth="6xl">
      <ComisionesClient
        enabled={enabled}
        serviceNames={serviceNames}
        view="competicion"
      />
    </AreaContent>
  )
}
