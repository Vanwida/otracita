export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import PublicPageSettings from '../../_components/PublicPageSettings'
import AjustesLayout from '../_components/AjustesLayout'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/reservas — pestaña RESERVAS ONLINE del área Ajustes.
//
// Contrato de IA. Config de la página pública de reservas (lo que el cliente
// ve al reservar: slug, logo, portada, color, tema, descripción, redes).
// PublicPageSettings se MUEVE aquí desde /dashboard/app — es el editor
// canónico ÚNICO de esos campos (DRY: un campo, un sitio de edición). App
// se queda solo con lo de la PWA (QR/compartir/push/GTM).
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
      <AreaContent scroll="region" maxWidth="5xl">
        <AjustesLayout intro="Lo que ven tus clientes al reservar online: nombre, logo, portada, color, descripción y redes. Tu enlace y QR para compartir están en la pestaña App.">
          <section className="rounded-2xl border border-line bg-surface px-[var(--space-card)] py-5 md:px-6 md:py-6">
            <PublicPageSettings
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
          </section>
        </AjustesLayout>
      </AreaContent>
    </AreaShell>
  )
}
