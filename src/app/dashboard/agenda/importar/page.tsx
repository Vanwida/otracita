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
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">
          Importar reservas
        </h1>
        <p className="text-ink-2 text-sm max-w-2xl">
          Sube capturas de pantalla de tu agenda actual (Booksy, Treatwell, la libreta de papel — lo
          que sea). La IA extrae las citas, revisas, confirmas y quedan en tu agenda otracita.
          Útil cuando empiezas con nosotros y ya tienes reservas pendientes en otro sitio.
        </p>
      </div>
      <ImportFlow />
    </div>
  )
}
