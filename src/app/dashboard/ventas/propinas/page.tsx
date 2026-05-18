export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, tips as tipsTable, barbers as barbersTable } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaContent from '../../_components/AreaContent'
import TipsSettings from '../../_components/TipsSettings'
import TipsList, { type TipRow } from './TipsList'

// -----------------------------------------------------------------------------
// /dashboard/ventas/propinas — pestaña PROPINAS del área Ventas.
//
// Dos bloques:
//   1. TipsSettings — activar propinas + importes sugeridos (sin cambios).
//   2. TipsList — propinas cobradas con asignación de barbero (fix #7). Las
//      propinas son del barbero que hizo el servicio; el snapshot
//      tips.barberName a veces queda vacío y aquí se asigna/reasigna.
//
// Multi-tenancy: tenant por sesión (convención #1); tips y barberos
// filtrados por client.id.
// -----------------------------------------------------------------------------

export default async function VentasPropinasPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Propinas cobradas (status 'paid') del tenant + barberos activos para el
  // selector. Las propinas se enlazan al barbero por nombre (snapshot).
  const [tipRows, barberRows] = await Promise.all([
    db
      .select({
        id: tipsTable.id,
        amountCents: tipsTable.amountCents,
        customerPhone: tipsTable.customerPhone,
        barberName: tipsTable.barberName,
        paidAt: tipsTable.paidAt,
        createdAt: tipsTable.createdAt,
      })
      .from(tipsTable)
      .where(and(eq(tipsTable.clientId, client.id), eq(tipsTable.status, 'paid')))
      .orderBy(desc(tipsTable.paidAt), desc(tipsTable.createdAt))
      .limit(200),
    db
      .select({ name: barbersTable.name })
      .from(barbersTable)
      .where(
        and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)),
      )
      .orderBy(barbersTable.displayOrder, barbersTable.name),
  ])

  const tips: TipRow[] = tipRows.map((t) => ({
    id: t.id,
    amountCents: t.amountCents,
    customerPhone: t.customerPhone,
    barberName: t.barberName,
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }))
  const barberNames = barberRows.map((b) => b.name)

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

      <div className="mt-6">
        <TipsList tips={tips} barberNames={barberNames} />
      </div>
    </AreaContent>
  )
}
