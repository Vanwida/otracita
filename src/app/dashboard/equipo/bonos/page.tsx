export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { Award, ClipboardCheck, Lock } from 'lucide-react'
import AreaContent from '../../_components/AreaContent'
import BonusesManager from '../../_components/BonusesManager'
import BonusTracker from '../../caja/BonusTracker'

// -----------------------------------------------------------------------------
// /dashboard/equipo/bonos — pestaña BONOS del área Equipo.
//
// Catálogo de incentivos del local + progreso del mes por barbero. Antes
// vivía apilado en el índice monolítico de Equipo (anti-patrón scroll
// largo) — ahora es su pestaña, cabe en pantalla.
//
// LÓGICA DE SERVIDOR INTACTA: mismo gate `hasFeature(client, 'teamBonuses')`
// que tenía el índice; BonusesManager/BonusTracker usan los mismos endpoints.
// -----------------------------------------------------------------------------

export default async function EquipoBonosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const bonusesEnabled = hasFeature(client, 'teamBonuses')

  if (!bonusesEnabled) {
    return (
      <AreaContent scroll="fixed" maxWidth="5xl">
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md rounded-control border border-line bg-surface p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control border border-brand/20 bg-brand-softer">
              <Lock className="h-5 w-5 text-brand" />
            </div>
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              Bonos del equipo
            </h2>
            <p className="mt-2 text-[0.8125rem] text-ink-2">
              Define incentivos (reseñas, productos, asistencia…) y cuánto se
              paga al alcanzarlos. Disponible en el plan Pro.
            </p>
          </div>
        </div>
      </AreaContent>
    )
  }

  return (
    <AreaContent scroll="region" maxWidth="6xl">
      <div className="space-y-6">
        <section>
          <div className="mb-3">
            <h2
              className="flex items-center gap-2 font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              <Award className="h-4 w-4 text-brand" />
              Bonos del local
            </h2>
            <p
              className="mt-0.5 text-ink-2"
              style={{ fontSize: 'var(--text-meta)' }}
            >
              Catálogo de incentivos. Define qué se premia y cuánto se paga al
              alcanzar el objetivo. Cualquier barbero puede acumular progreso.
            </p>
          </div>
          <BonusesManager enabled={bonusesEnabled} />
        </section>

        <section className="border-t border-line pt-6">
          <div className="mb-3">
            <h2
              className="flex items-center gap-2 font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              <ClipboardCheck className="h-4 w-4 text-brand" />
              Progreso del mes
            </h2>
            <p
              className="mt-0.5 text-ink-2"
              style={{ fontSize: 'var(--text-meta)' }}
            >
              Cuánto ha sumado cada barbero a cada bono este mes. Añade el
              progreso del día y guarda — verás quién cobra a fin de mes.
            </p>
          </div>
          <BonusTracker />
        </section>
      </div>
    </AreaContent>
  )
}
