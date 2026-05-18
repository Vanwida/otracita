export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import ComisionesClient from './ComisionesClient'

// -----------------------------------------------------------------------------
// /dashboard/equipo/comisiones — pestaña "Comisiones" (R8 + R9 + R10).
//
// El chrome (título "Equipo" + pestañas) lo da `equipo/layout.tsx` vía
// PageShell + SubTabs — esta página SOLO aporta contenido (sin re-wrap).
//
// 3 bloques, todos Pro-gated por `teamBonuses` (igual que BonusesManager):
//   · Comisión por servicio (R8) — override del % global por servicio.
//   · Tipos de bono (R9)         — meta | tramo en el catálogo de bonos.
//   · Competición semanal (R10)  — payout standalone, leaderboard por semana.
//
// Los nombres de servicio salen de clients.chatbotServices (catálogo jsonb,
// sin ID estable — mismo criterio de match por nombre que loyalty/promos).
// -----------------------------------------------------------------------------

interface ServiceRow {
  name?: unknown
}

export default async function EquipoComisionesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const enabled = hasFeature(client, 'teamBonuses')

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

  return <ComisionesClient enabled={enabled} serviceNames={serviceNames} />
}
