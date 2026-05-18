export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, barbers, barberBreaks, barberBlocks } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import TurnosManager, { type TurnosBarber } from './TurnosManager'

// -----------------------------------------------------------------------------
// /dashboard/equipo/turnos — pestaña "Turnos" (R12, R2).
//
// El chrome (título "Equipo" + barra de pestañas) vive en
// `equipo/layout.tsx` (PageShell + SubTabs). Esta página solo aporta el
// contenido — render desnudo, sin doble wrap.
//
// Server component: resuelve el tenant por sesión (mismo patrón que
// equipo/page.tsx — nunca clientId del cliente, convención #1), carga los
// barberos activos + sus descansos recurrentes (barber_breaks) + sus
// bloqueos puntuales (barber_blocks) y se los pasa a <TurnosManager>, que
// pinta el timeline y abre los modales. Los modales escriben vía las APIs
// tenant-scoped ya existentes (/api/barbers/[id]/breaks · /blocks ·
// PATCH /api/barbers/[id] para `hours`).
// -----------------------------------------------------------------------------

export default async function EquipoTurnosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const barberRows = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.clientId, client.id), eq(barbers.active, true)))
    .orderBy(asc(barbers.displayOrder), asc(barbers.name))

  const [breakRows, blockRows] = await Promise.all([
    db
      .select()
      .from(barberBreaks)
      .where(eq(barberBreaks.clientId, client.id))
      .orderBy(asc(barberBreaks.weekday), asc(barberBreaks.startTime)),
    db
      .select()
      .from(barberBlocks)
      .where(eq(barberBlocks.clientId, client.id))
      .orderBy(asc(barberBlocks.date), asc(barberBlocks.startTime)),
  ])

  // Shop hours are the fallback window for barbers whose `hours` is null
  // (they inherit the shop schedule — same rule as the availability engine).
  const shopHours = (client.chatbotHours as Record<string, string> | null) ?? null

  const data: TurnosBarber[] = barberRows.map((b) => ({
    id: b.id,
    name: b.name,
    photoUrl: b.photoUrl,
    hours: (b.hours as Record<string, string> | null) ?? null,
    breaks: breakRows
      .filter((r) => r.barberId === b.id)
      .map((r) => ({
        id: r.id,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
      })),
    blocks: blockRows
      .filter((r) => r.barberId === b.id)
      .map((r) => ({
        id: r.id,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        kind: r.kind as 'block' | 'absence',
        reason: r.reason,
        note: r.note,
        approved: r.approved,
      })),
  }))

  return <TurnosManager barbers={data} shopHours={shopHours} />
}
