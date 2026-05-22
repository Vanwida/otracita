export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getTeamSession } from '@/lib/team-auth/session'
import TeamLoginForm from './TeamLoginForm'

// -----------------------------------------------------------------------------
// /equipo/[slug]/login — entrada del MODO EQUIPO.
//
// Resuelve el tenant por publicSlug. Si el tenant no existe, no tiene el
// acceso activo, o no tiene PIN configurado → 404 (mismo error para los
// tres casos, evitamos enumeración).
//
// Si ya hay cookie válida → redirect a /equipo/[slug]/agenda (la pantalla
// canónica del MVP del modo equipo).
//
// Branding: usa el mismo logo + color que la PWA pública (/[slug]).
// -----------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TeamLoginPage({ params }: PageProps) {
  const { slug } = await params
  const cleanSlug = slug.trim().toLowerCase()

  const [client] = await db
    .select({
      id: clients.id,
      publicSlug: clients.publicSlug,
      businessName: clients.businessName,
      brandLogoUrl: clients.brandLogoUrl,
      brandColor: clients.brandColor,
      teamAccessEnabled: clients.teamAccessEnabled,
      teamPinHash: clients.teamPinHash,
    })
    .from(clients)
    .where(eq(clients.publicSlug, cleanSlug))

  if (!client || !client.teamAccessEnabled || !client.teamPinHash) {
    notFound()
  }

  // Sesión existente válida → ir directo a la app
  const existing = await getTeamSession()
  if (existing && existing.clientId === client.id) {
    redirect(`/equipo/${cleanSlug}/agenda`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          {client.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.brandLogoUrl}
              alt={client.businessName}
              className="mx-auto h-14 w-auto object-contain"
            />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-softer text-2xl font-semibold text-brand-strong">
              {client.businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="mt-5 text-xl font-semibold text-ink">{client.businessName}</h1>
          <p className="mt-1 text-sm text-ink-2">Acceso del equipo</p>
        </div>

        <div className="mt-8 rounded-control border border-line bg-surface p-6 shadow-sm">
          <TeamLoginForm slug={cleanSlug} />
        </div>

        <p className="mt-6 text-center text-xs text-ink-3">
          ¿No tienes el PIN? Pídeselo a tu jefe.
        </p>
      </div>
    </main>
  )
}
