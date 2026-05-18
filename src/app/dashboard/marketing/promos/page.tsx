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
import PromosToggle from '../PromosToggle'

// -----------------------------------------------------------------------------
// /dashboard/marketing/promos — pestaña PROMOS del área Marketing.
//
// Promos contextuales (push PWA) + roadmap honesto. Antes era el índice de
// Marketing; el contrato pone Fidelidad como índice y Promos como pestaña.
//
// LÓGICA DE SERVIDOR INTACTA: mismo gate `promosContextuales`, mismo
// PromosToggle contra los mismos endpoints. Solo cambia la ruta.
// -----------------------------------------------------------------------------

export default async function MarketingPromosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'promosContextuales')) {
    return (
      <UpgradeRequired
        feature="promosContextuales"
        title="Promos"
        icon={Megaphone}
        back={{ label: 'Marketing', href: '/dashboard/marketing' }}
      />
    )
  }

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
        <section className="mb-6 space-y-4">
          <PromosToggle initialEnabled={client.promosEnabled} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ink">
            Próximamente
          </h2>
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
    <div className="rounded-xl border border-line bg-surface p-4 opacity-70">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-overlay text-ink-3">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <span className="rounded bg-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-3">
              Próximamente
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}
