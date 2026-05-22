export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { BarChart3 } from 'lucide-react'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import UpgradeRequired from '@/app/dashboard/_components/UpgradeRequired'
import TrackingSettings from './TrackingSettings'

// -----------------------------------------------------------------------------
// /dashboard/marketing/tracking — pestaña TRACKING del área Marketing.
//
// Configuración de pixels de conversión: GTM + Meta + Google Ads + TikTok.
// Reemplaza la sección suelta que vivía en /dashboard/app (esa página
// sigue mostrando un puntero a aquí). Feature gate `gtmContainer` cubre
// todos los pixels — todos son Pro.
//
// Los eventos `booking_confirmed`, `tip_paid` y `no_show_charged` se
// disparan automáticamente desde el código de la app cuando ocurren;
// no hay nada que configurar a parte de pegar los IDs.
// -----------------------------------------------------------------------------

export default async function MarketingTrackingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'gtmContainer')) {
    return (
      <UpgradeRequired
        feature="gtmContainer"
        title="Tracking"
        icon={BarChart3}
        back={{ label: 'Crecimiento', href: '/dashboard/marketing' }}
      />
    )
  }

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-brand" />
            <h1 className="text-lg font-semibold text-ink">Tracking pixels</h1>
          </div>
          <p className="text-ink-2 max-w-2xl" style={{ fontSize: 'var(--text-meta)' }}>
            Conecta tus pixels de Meta, Google Ads y TikTok para medir cuántas
            reservas vienen de cada campaña. Pega los IDs y nosotros nos
            encargamos del resto: inyección con Consent Mode v2 y disparo de
            eventos de conversión cuando un cliente reserva o paga propina.
          </p>
        </section>

        <TrackingSettings
          initial={{
            gtmContainerId: client.gtmContainerId ?? null,
            metaPixelId: client.metaPixelId ?? null,
            googleAdsConversionId: client.googleAdsConversionId ?? null,
            googleAdsConversionLabel: client.googleAdsConversionLabel ?? null,
            tiktokPixelId: client.tiktokPixelId ?? null,
          }}
          publicSlug={client.publicSlug ?? null}
        />
      </AreaContent>
    </AreaShell>
  )
}
