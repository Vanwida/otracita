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
import HubBreadcrumb from '../_components/HubBreadcrumb'

// -----------------------------------------------------------------------------
// /dashboard/equipo — UNA página, todo lo del equipo en un sitio.
//
// Razón de ser: el concepto "equipo" estaba partido en 5 sitios distintos
// (Tu barbería > Equipo, Tu barbería > Bonos, Caja > Bonos día/mes,
// Finanzas > Nóminas, Agenda > vista por barbero). Para una barbería con
// 3-5 miembros, "equipo" es lo MÁS usado después de la agenda — tenerlo
// disperso era cruel para el barbero.
//
// 4 secciones scrolleadas (no tabs internos — el barbero ve todo de un
// vistazo y entra a editar lo que sea con un solo scroll):
//   1. Barberos (lista, horarios, foto, cómo cobra)
//   2. Bonos del local (catálogo)
//   3. Progreso de hoy (input rápido + estado mes)
//   4. Nóminas computadas del mes
//
// Anclas al inicio para saltar entre secciones rápidamente.
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
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <HubBreadcrumb current="Equipo" />

      <header className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
          <Users className="h-7 w-7 text-brand" />
          Equipo
        </h1>
        <p className="text-ink-2 max-w-2xl">
          Todo lo relacionado con tu equipo en un solo sitio: quién está, cómo cobra, qué bonos
          tiene activos y cuánto le toca pagar este mes.
        </p>

        {/* Anclas para saltar entre secciones rápido. */}
        <nav className="mt-5 flex flex-wrap gap-2 text-xs">
          <a href="#barberos" className="inline-flex items-center gap-1.5 rounded-full bg-overlay text-ink-2 hover:text-ink hover:bg-canvas border border-line px-3 py-1.5 transition-colors">
            <Users className="h-3 w-3" /> Barberos
          </a>
          {bonusesEnabled && (
            <a href="#bonos" className="inline-flex items-center gap-1.5 rounded-full bg-overlay text-ink-2 hover:text-ink hover:bg-canvas border border-line px-3 py-1.5 transition-colors">
              <Award className="h-3 w-3" /> Bonos del local
            </a>
          )}
          {bonusesEnabled && (
            <a href="#progreso" className="inline-flex items-center gap-1.5 rounded-full bg-overlay text-ink-2 hover:text-ink hover:bg-canvas border border-line px-3 py-1.5 transition-colors">
              <ClipboardCheck className="h-3 w-3" /> Progreso del mes
            </a>
          )}
          {payrollEnabled && (
            <a href="#nominas" className="inline-flex items-center gap-1.5 rounded-full bg-overlay text-ink-2 hover:text-ink hover:bg-canvas border border-line px-3 py-1.5 transition-colors">
              <Coins className="h-3 w-3" /> Nóminas
            </a>
          )}
        </nav>
      </header>

      {/* Sección 1: Barberos */}
      <section id="barberos" className="scroll-mt-8 mb-12">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-ink mb-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" />
            Barberos
          </h2>
          <p className="text-sm text-ink-2">
            Lista del equipo. Edita nombre, horario, foto, días libres y cómo cobra cada uno.
          </p>
        </div>
        <BarbersManager payrollEnabled={payrollEnabled} />
      </section>

      {/* Sección 2: Bonos del local — catálogo */}
      {bonusesEnabled && (
        <section id="bonos" className="scroll-mt-8 mb-12 pt-8 border-t border-line">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold text-ink mb-1 flex items-center gap-2">
              <Award className="h-4 w-4 text-brand" />
              Bonos del local
            </h2>
            <p className="text-sm text-ink-2">
              Catálogo de incentivos. Define qué se premia (reseñas, productos, asistencia…)
              y cuánto se paga al alcanzar el objetivo. Cualquier barbero del equipo puede
              acumular progreso hacia ellos.
            </p>
          </div>
          <BonusesManager enabled={bonusesEnabled} />
        </section>
      )}

      {/* Sección 3: Progreso del día/mes (BonusTracker) */}
      {bonusesEnabled && (
        <section id="progreso" className="scroll-mt-8 mb-12 pt-8 border-t border-line">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold text-ink mb-1 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-brand" />
              Progreso del mes
            </h2>
            <p className="text-sm text-ink-2">
              Cuánto ha sumado cada barbero a cada bono este mes. Añade el progreso del día y
              guarda — verás al instante quién va a cobrar a fin de mes.
            </p>
          </div>
          <BonusTracker />
        </section>
      )}

      {/* Sección 4: Nóminas computadas del mes */}
      {payrollEnabled && (
        <section id="nominas" className="scroll-mt-8 pt-8 border-t border-line">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold text-ink mb-1 flex items-center gap-2">
              <Coins className="h-4 w-4 text-brand" />
              Nóminas del mes
            </h2>
            <p className="text-sm text-ink-2">
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
