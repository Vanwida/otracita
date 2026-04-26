export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import Link from 'next/link'
import { Megaphone, Repeat, Cake, ShoppingBag, Sparkles, ChevronRight } from 'lucide-react'
import AjustesBreadcrumb from '@/app/dashboard/_components/AjustesBreadcrumb'
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

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <AjustesBreadcrumb current="Marketing" />
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-brand" />
          Marketing
        </h1>
        <p className="text-ink-2">Herramientas para llenar huecos, fidelizar y vender más.</p>
      </header>

      {/* Features live */}
      <section className="mb-6 space-y-4">
        <PromosToggle initialEnabled={client.promosEnabled} />

        {/* Tienda de productos — feature live (modelo manual: el barbero
            registra venta al cobrar). Tienda online en /b/[slug] queda
            para fase futura. */}
        <Link
          href="/dashboard/marketing/tienda"
          className="group flex items-start gap-4 bg-surface border border-line hover:border-line-strong rounded-2xl p-5 md:p-6 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-brand-softer text-brand-strong">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink">Tienda de productos</h3>
            <p className="text-sm text-ink-2 mt-1">
              Da de alta lo que vendes en mostrador (champú, ceras, peines...).
              Al cobrar, registras la venta desde la agenda y se atribuye al barbero
              que la hace. Aparece en Caja como upsells.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3 mt-2 shrink-0 group-hover:text-ink transition-colors" />
        </Link>
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
    </div>
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
