export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import AjustesLayout from '../_components/AjustesLayout'
import ReservasOnlineCard from '../_components/ReservasOnlineCard'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/reservas — pestaña RESERVAS ONLINE del área Ajustes.
//
// Contrato de IA. Config de la página pública de reservas (lo que el cliente
// ve al reservar: slug, logo, portada, color, tema, descripción, redes).
// El editor canónico ÚNICO (PublicPageSettings) vive dentro de un SlideOver
// abierto desde un resumen compacto (ReservasOnlineCard) — patrón canónico
// del proyecto: cards de preview en la pestaña, edición en panel lateral.
// App se queda solo con lo de la PWA (QR/compartir/push/GTM).
//
// LÓGICA DE SERVIDOR INTACTA: PublicPageSettings se auto-guarda contra los
// mismos endpoints; mismos campos del client. Solo cambia dónde se monta.
// -----------------------------------------------------------------------------

export default async function AjustesReservasPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  return (
    <AreaShell area="ajustes">
      <AreaContent scroll="region" maxWidth="6xl">
        <AjustesLayout intro="Lo que ven tus clientes al reservar online: nombre, logo, portada, color, descripción y redes. Tu enlace y QR para compartir están en la pestaña App.">
          <ReservasOnlineCard
            initial={{
              slug: client.publicSlug,
              publicEnabled: client.publicEnabled,
              brandLogoUrl: client.brandLogoUrl,
              brandLogoAltUrl: client.brandLogoAltUrl,
              brandCoverUrl: client.brandCoverUrl,
              brandColor: client.brandColor,
              brandTheme: client.brandTheme,
              publicDescription: client.publicDescription,
              instagramHandle: client.instagramHandle,
              tiktokHandle: client.tiktokHandle,
              facebookUrl: client.facebookUrl,
              websiteUrl: client.websiteUrl,
            }}
          />
        </AjustesLayout>
      </AreaContent>
    </AreaShell>
  )
}
