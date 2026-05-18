export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { ChevronLeft } from 'lucide-react'
import { loadClientProfile } from '@/lib/clients/profile'
import ClientProfile from './ClientProfile'

// -----------------------------------------------------------------------------
// /dashboard/clientes/[id] — ficha completa de un cliente.
//
// Datos: loadClientProfile (FUENTE ÚNICA, src/lib/clients/profile.ts).
// UI:    <ClientProfile> (FUENTE ÚNICA presentacional). La misma ficha se
//        renderiza desde la agenda (clic en el nombre del cliente) vía la
//        API /api/customers/[id]/profile → cero UI de cliente duplicada.
//
// Multi-tenancy: el loader filtra por clientId del barbero logueado; sin
// fila → 404 (nunca 403 — no revelamos que el cliente existe).
// -----------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const data = await loadClientProfile(client.id, {
    customerId: id,
    loyaltyEnabled: client.loyaltyEnabled,
    loyaltyMode: client.loyaltyMode === 'points' ? 'points' : 'stamps',
  })
  if (!data) notFound()

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="max-w-4xl mx-auto" style={{ padding: 'var(--space-page)' }}>
        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink mb-4 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Todos los clientes
        </Link>
        <ClientProfile data={data} variant="page" />
      </div>
    </div>
  )
}
