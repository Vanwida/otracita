export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import ImportFlow from './ImportFlow'

export default async function ImportPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')
  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas">
      {/* Header compacto fijo — shrink-0, NUNCA scrollea */}
      <header
        className="shrink-0 border-b border-line bg-canvas px-[var(--space-page)]"
        style={{ paddingTop: 'var(--space-card)', paddingBottom: 'var(--space-card)' }}
      >
        <div className="max-w-4xl mx-auto">
          <h1
            className="font-semibold text-ink leading-tight"
            style={{ fontSize: 'var(--text-page-title)' }}
          >
            Importar reservas
          </h1>
          <p className="text-ink-2 mt-0.5" style={{ fontSize: 'var(--text-meta)' }}>
            Sube capturas de tu agenda actual (Booksy, Treatwell, la libreta de papel). La IA
            extrae las citas, revisas, confirmas y quedan en tu agenda otracita. Útil cuando
            empiezas y ya tienes reservas pendientes en otro sitio.
          </p>
        </div>
      </header>
      {/* Cuerpo — única región scrolleable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto" style={{ padding: 'var(--space-page)' }}>
          <ImportFlow />
        </div>
      </div>
    </div>
  )
}
