export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaContent from '../../_components/AreaContent'
import TipsSettings from '../../_components/TipsSettings'

// -----------------------------------------------------------------------------
// /dashboard/ventas/propinas — pestaña PROPINAS del área Ventas.
//
// Reúne la configuración de propinas (TipsSettings). Antes vivía dentro de
// la página de Reseñas — conceptualmente es parte del flujo de cobro
// (rating + tip post-servicio), así que su sitio estándar es Ventas.
//
// LÓGICA DE SERVIDOR INTACTA: TipsSettings se auto-guarda contra los mismos
// endpoints; aquí solo se resuelve el tenant por sesión (convención #1) y se
// le pasan los mismos flags (tipsEnabled, tipsSuggestedCents, connectActive)
// que recibía en resenas/page.tsx — cero cambios de datos.
// -----------------------------------------------------------------------------

export default async function VentasPropinasPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  return (
    <AreaContent scroll="region" maxWidth="5xl">
      <p
        className="mb-4 text-ink-2"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        Activa las propinas y elige los importes sugeridos. Se piden tras
        cada servicio junto con la reseña.
      </p>
      <TipsSettings
        initial={{
          tipsEnabled: client.tipsEnabled,
          tipsSuggestedCents: client.tipsSuggestedCents || [200, 300, 500],
          connectActive: client.stripeConnectStatus === 'active',
        }}
      />
    </AreaContent>
  )
}
