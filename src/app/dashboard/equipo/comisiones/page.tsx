export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import AreaContent from '../../_components/AreaContent'
import ComisionesClient from './ComisionesClient'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'

// -----------------------------------------------------------------------------
// /dashboard/equipo/comisiones — pestaña "Comisiones" (R8 + R9).
//
// Contrato de IA: Comisiones y Competición son pestañas distintas. Esta
// pestaña muestra R8 (comisión por servicio) + R9 (tipos de bono) vía
// ComisionesClient con view="comisiones". La Competición (R10) vive en
// /dashboard/equipo/competicion (mismo componente, view="competicion").
//
// Pro-gated por `teamBonuses`. Los nombres de servicio salen de
// clients.chatbotServices (catálogo jsonb, match por nombre como
// loyalty/promos). LÓGICA DE SERVIDOR INTACTA — solo se reparte la UI.
// -----------------------------------------------------------------------------

interface ServiceRow {
  name?: unknown
}

export default async function EquipoComisionesPage() {
  const lockOverlay = await renderAdminLockGuard('equipo-comisiones')
  if (lockOverlay) return lockOverlay

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

  return (
    <AreaContent scroll="region" maxWidth="6xl">
      <ComisionesClient
        enabled={enabled}
        serviceNames={serviceNames}
        view="comisiones"
      />
    </AreaContent>
  )
}
