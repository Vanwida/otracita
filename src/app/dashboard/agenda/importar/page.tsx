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
    <div className="max-w-4xl mx-auto" style={{ padding: 'var(--space-page)' }}>
      <header
        className="border-b border-line"
        style={{ paddingBottom: 'var(--space-card)', marginBottom: 'var(--space-section)' }}
      >
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
      </header>
      <ImportFlow />
    </div>
  )
}
