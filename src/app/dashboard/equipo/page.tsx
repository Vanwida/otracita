export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { Users, Award, Coins, ClipboardCheck } from 'lucide-react'
import { hasFeature } from '@/lib/billing/tier'
import BarbersManager from '../_components/BarbersManager'
import BonusesManager from '../_components/BonusesManager'
import BonusTracker from '../caja/BonusTracker'
import Payroll from '../finanzas/Payroll'

// -----------------------------------------------------------------------------
// /dashboard/equipo — ruta índice del hub (pestaña "Empleados").
//
// El chrome (título "Equipo" + barra de pestañas Empleados/Turnos/
// Comisiones) vive en `equipo/layout.tsx`. Esta página solo aporta el
// contenido de la pestaña por defecto.
//
// Antes esto era una página monolítica con nav de anclas (#barberos,
// #bonos…). La nav de anclas se sustituye por las pestañas reales del
// hub (Turnos lo llenará WS-B, Comisiones WS-F). Mientras, el contenido
// de equipo (barberos · bonos del local · progreso · nóminas) se apila
// aquí sin perder nada — sin el wrapper editorial ni el breadcrumb,
// que ahora absorbe PageShell.
// -----------------------------------------------------------------------------

function currentMonthMadrid(): string {
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  return iso.slice(0, 7)
}

export default async function EquipoPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const payrollEnabled = hasFeature(client, 'controlFinanciero')
  const bonusesEnabled = hasFeature(client, 'teamBonuses')
  const month = currentMonthMadrid()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-section)' }}>
      {/* Barberos */}
      <section>
        <div className="mb-3">
          <h2
            className="font-semibold text-ink flex items-center gap-2"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            <Users className="h-4 w-4 text-brand" />
            Barberos
          </h2>
          <p className="text-ink-2 mt-0.5" style={{ fontSize: 'var(--text-meta)' }}>
            Lista del equipo. Edita nombre, horario, foto, días libres y cómo cobra cada uno.
          </p>
        </div>
        <BarbersManager payrollEnabled={payrollEnabled} />
      </section>

      {/* Bonos del local — catálogo */}
      {bonusesEnabled && (
        <section className="pt-6 border-t border-line">
          <div className="mb-3">
            <h2
              className="font-semibold text-ink flex items-center gap-2"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              <Award className="h-4 w-4 text-brand" />
              Bonos del local
            </h2>
            <p className="text-ink-2 mt-0.5" style={{ fontSize: 'var(--text-meta)' }}>
              Catálogo de incentivos. Define qué se premia (reseñas, productos, asistencia…)
              y cuánto se paga al alcanzar el objetivo. Cualquier barbero del equipo puede
              acumular progreso hacia ellos.
            </p>
          </div>
          <BonusesManager enabled={bonusesEnabled} />
        </section>
      )}

      {/* Progreso del día/mes (BonusTracker) */}
      {bonusesEnabled && (
        <section className="pt-6 border-t border-line">
          <div className="mb-3">
            <h2
              className="font-semibold text-ink flex items-center gap-2"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              <ClipboardCheck className="h-4 w-4 text-brand" />
              Progreso del mes
            </h2>
            <p className="text-ink-2 mt-0.5" style={{ fontSize: 'var(--text-meta)' }}>
              Cuánto ha sumado cada barbero a cada bono este mes. Añade el progreso del día y
              guarda — verás al instante quién va a cobrar a fin de mes.
            </p>
          </div>
          <BonusTracker />
        </section>
      )}

      {/* Nóminas computadas del mes */}
      {payrollEnabled && (
        <section className="pt-6 border-t border-line">
          <div className="mb-3">
            <h2
              className="font-semibold text-ink flex items-center gap-2"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              <Coins className="h-4 w-4 text-brand" />
              Nóminas del mes
            </h2>
            <p className="text-ink-2 mt-0.5" style={{ fontSize: 'var(--text-meta)' }}>
              Lo que cobra cada barbero este mes, calculado desde sus servicios facturados,
              productos vendidos, propinas y bonos alcanzados. Plegado por barbero — click
              para ver el desglose línea por línea.
            </p>
          </div>
          <Payroll month={month} />
        </section>
      )}
    </div>
  )
}
