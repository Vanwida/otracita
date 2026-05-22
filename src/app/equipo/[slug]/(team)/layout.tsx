export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getTeamSession } from '@/lib/team-auth/session'
import { normalizeAllowedAreas } from '@/lib/team-auth/areas'
import TeamShell from '../_components/TeamShell'

// -----------------------------------------------------------------------------
// Layout autenticado del MODO EQUIPO — envuelve solo a las rutas que viven
// dentro del route group `(team)`. La ruta /equipo/[slug]/login queda
// FUERA de este layout, por lo que el form de login no muestra el shell.
//
// Validaciones (en este orden):
//   1. Tenant existe y `teamAccessEnabled = true` (publicSlug). Si no → 404
//      (mismo error para no-existe vs desactivado → evita enumeración).
//   2. Cookie firmada presente y válida. Si no → redirect /login.
//   3. Cookie apunta al tenant correcto. Si no → redirect /login (alguien
//      logueado en otro slug intentando entrar a este).
//
// El filtrado por área (qué ruta puede ver el equipo) se hace en CADA page
// hija (más explícito que un middleware basado en URL). El shell solo
// renderiza el rail con las áreas habilitadas; intentar URLs no
// renderizadas también dispara el 403 desde la propia page.
// -----------------------------------------------------------------------------

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function TeamAuthedLayout({ children, params }: LayoutProps) {
  const { slug } = await params
  const cleanSlug = slug.trim().toLowerCase()

  const [client] = await db
    .select({
      id: clients.id,
      publicSlug: clients.publicSlug,
      businessName: clients.businessName,
      teamAccessEnabled: clients.teamAccessEnabled,
      teamPinHash: clients.teamPinHash,
      teamAllowedAreas: clients.teamAllowedAreas,
    })
    .from(clients)
    .where(eq(clients.publicSlug, cleanSlug))

  if (!client || !client.teamAccessEnabled || !client.teamPinHash) {
    notFound()
  }

  const session = await getTeamSession()
  if (!session || session.clientId !== client.id) {
    redirect(`/equipo/${cleanSlug}/login`)
  }

  const allowed = Array.from(normalizeAllowedAreas(client.teamAllowedAreas))

  return (
    <TeamShell
      slug={cleanSlug}
      businessName={client.businessName}
      allowedAreas={allowed}
    >
      {children}
    </TeamShell>
  )
}
