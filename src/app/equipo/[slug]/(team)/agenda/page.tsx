export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { db } from '@/db'
import { clients, barbers as barbersTable } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { getTeamSession } from '@/lib/team-auth/session'
import { normalizeAllowedAreas } from '@/lib/team-auth/areas'
import CalendarView from '@/app/dashboard/agenda/CalendarView'

// -----------------------------------------------------------------------------
// /equipo/[slug]/agenda — MVP del MODO EQUIPO.
//
// Reusa el componente CalendarView del dashboard pasándole `teamMode=true`:
//   · Oculta "Llenar huecos" (promos marketing — decisión del dueño).
//   · Oculta "Importar" (operación masiva del dueño).
//   · Oculta "Cancelar reserva" en el detail panel (puede implicar refund).
//   · Bloquea click destructivo sobre descansos/ausencias.
//
// El equipo SÍ puede: ver agenda, crear citas, mover citas, marcar
// completada, cobrar (ChargeFlow), añadir productos. Lo core del turno.
//
// El layout (route group) ya validó cookie + tenant. Aquí solo aplicamos
// el filtro de área: si 'agenda' no está en allowed → 403 amistoso.
// -----------------------------------------------------------------------------

export default async function TeamAgendaPage({
  params,
}: PageProps<'/equipo/[slug]/agenda'>) {
  const { slug } = await params
  const cleanSlug = slug.trim().toLowerCase()

  const session = await getTeamSession()
  if (!session) notFound() // El layout debió redirigir; defensa adicional.

  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId))
  if (!client || client.publicSlug !== cleanSlug) notFound()

  const allowed = normalizeAllowedAreas(client.teamAllowedAreas)
  if (!allowed.has('agenda')) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-ink">No tienes acceso a la agenda</h2>
          <p className="mt-2 text-sm text-ink-2">
            Pídele al dueño que active el área &ldquo;Agenda&rdquo; para el equipo desde
            <em> Equipo &gt; Acceso</em>.
          </p>
        </div>
      </div>
    )
  }

  const rawServices = (client.chatbotServices ?? []) as Array<{
    name: string
    duration: number
    price: number
    colorToken?: string | null
  }>
  const services = Array.isArray(rawServices) ? rawServices : []

  const barberRows = await db
    .select({
      id: barbersTable.id,
      name: barbersTable.name,
      photoUrl: barbersTable.photoUrl,
      displayOrder: barbersTable.displayOrder,
    })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

  const blockedDates = (client.blockedDates as string[]) || []
  const hours = (client.chatbotHours as Record<string, string>) || null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <div className="min-h-0 flex-1">
        <CalendarView
          services={services}
          barbers={barberRows}
          blockedDates={blockedDates}
          hours={hours}
          stripeConnectStatus={client.stripeConnectStatus}
          // promos / import están ocultos por teamMode independientemente
          // del flag del tenant; pasamos false para evitar incluso el modal
          // si por accidente algo se renderiza.
          promosEnabled={false}
          cashRegisterEnabled={client.cashRegisterEnabled}
          sumupReaderConnected={
            !!client.sumupAccessToken && !!client.sumupMerchantCode && !!client.sumupReaderId
          }
          teamMode
        />
      </div>
    </div>
  )
}
