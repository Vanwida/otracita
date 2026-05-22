import { notFound } from 'next/navigation'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import AnalyticsBootstrap from './AnalyticsBootstrap'

// -----------------------------------------------------------------------------
// Layout de /b/[slug]/* — carga el AnalyticsBootstrap (tracking pixels +
// cookie banner + atribución) UNA sola vez en todas las sub-rutas:
//   · /b/[slug]              → landing + flow de reserva
//   · /b/[slug]/cuenta       → cuenta del cliente PWA (historial, tips)
//   · /b/[slug]/cuenta/rate/* → pantalla de valoración + propina
//
// Antes el bootstrap vivía solo en page.tsx → los pixels no cargaban en
// /cuenta ni en /rate, lo que rompía el evento `tip_paid` cuando el
// cliente volvía de Stripe Checkout. Aquí queda centralizado.
//
// Layouts en App Router NO se re-renderizan al navegar entre rutas hijas
// → un solo `consent default` push, los pixels persisten entre vistas.
// -----------------------------------------------------------------------------

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function PublicSiteLayout({ children, params }: Props) {
  const { slug } = await params

  // Query mínima — solo los IDs de tracking. El resto de campos los lee
  // cada page.tsx que los necesita. Drizzle hace una sola request.
  const [client] = await db
    .select({
      gtmContainerId: clients.gtmContainerId,
      metaPixelId: clients.metaPixelId,
      googleAdsConversionId: clients.googleAdsConversionId,
      googleAdsConversionLabel: clients.googleAdsConversionLabel,
      tiktokPixelId: clients.tiktokPixelId,
    })
    .from(clients)
    .where(eq(clients.publicSlug, slug))

  if (!client) notFound()

  return (
    <>
      {children}
      <AnalyticsBootstrap
        gtmContainerId={client.gtmContainerId ?? null}
        metaPixelId={client.metaPixelId ?? null}
        googleAdsConversionId={client.googleAdsConversionId ?? null}
        googleAdsConversionLabel={client.googleAdsConversionLabel ?? null}
        tiktokPixelId={client.tiktokPixelId ?? null}
      />
    </>
  )
}
