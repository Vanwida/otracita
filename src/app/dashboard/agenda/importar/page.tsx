export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import ImportFlow from './ImportFlow'

export default async function ImportPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')
  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  return (
    <AreaShell area="agenda">
      <AreaContent scroll="region" maxWidth="5xl">
        <p
          className="mb-4 text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Sube capturas de tu agenda actual (Booksy, Treatwell, la libreta de
          papel). La IA extrae las citas, revisas, confirmas y quedan en tu
          agenda otracita. Útil cuando empiezas y ya tienes reservas pendientes
          en otro sitio.
        </p>
        <ImportFlow />
      </AreaContent>
    </AreaShell>
  )
}
