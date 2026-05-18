export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { Megaphone, Repeat, Cake } from 'lucide-react'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import UpgradeRequired from '@/app/dashboard/_components/UpgradeRequired'
import PromosToggle from './PromosToggle'

// -----------------------------------------------------------------------------
// /dashboard/marketing — hub de features de marketing del barbero.
//
// Por qué existe esta sección (mover de /dashboard/app):
//   · Antes "Promos contextuales" vivía dentro de /dashboard/app porque las
//     promos se mandan vía push notifications de la PWA. Pero conceptualmente
//     no es config DE la app — es marketing.
//   · Esta sección crece: aquí vendrán Reactivación de inactivos, Cumpleaños,
//     Tienda de productos, Tarjetas regalo, Analytics. Todo lo que ayuda al
//     barbero a CRECER el negocio.
//
// Hoy: solo Promos está implementado. El resto son placeholders "Próximamente"
// que comunican el roadmap (no falsa expectativa — clarifican que va a venir).
// -----------------------------------------------------------------------------

export default async function MarketingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'promosContextuales')) {
    return (
      <UpgradeRequired
        feature="promosContextuales"
        title="Marketing"
        icon={Megaphone}
        back={{ label: 'Inicio', href: '/dashboard' }}
      />
    )
  }

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
      {/* Features live — la Tienda es ahora su propia pestaña del área. */}
      <section className="mb-6 space-y-4">
        <PromosToggle initialEnabled={client.promosEnabled} />
      </section>

      {/* Roadmap — placeholders honestos para que el barbero vea qué viene */}
      <section>
        <h2 className="text-sm font-semibold text-ink uppercase tracking-widest mb-3">Próximamente</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ComingSoonCard
            icon={Repeat}
            title="Reactivar inactivos"
            description="Detecta clientes que llevan >60 días sin venir y les manda un mensaje automático con descuento. Recuperas tráfico sin pensar."
          />
          <ComingSoonCard
            icon={Cake}
            title="Felicitar cumpleaños"
            description="Apunta el cumpleaños del cliente y el bot le manda felicitación con regalo (corte gratis o descuento). Tú decides la oferta."
          />
          <ComingSoonCard
            icon={Megaphone}
            title="Analytics de visitas"
            description="Mira de dónde vienen tus clientes (Instagram, Google, link compartido). Sabe qué canal te trae más reservas."
          />
        </div>
      </section>
      </AreaContent>
    </AreaShell>
  )
}

function ComingSoonCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Megaphone
  title: string
  description: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4 opacity-70">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-overlay text-ink-3">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink text-sm">{title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-3 bg-overlay px-1.5 py-0.5 rounded">
              Próximamente
            </span>
          </div>
          <p className="text-xs text-ink-3 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}
