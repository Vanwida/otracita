export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import ImportModeSwitch from './ImportModeSwitch'

// -----------------------------------------------------------------------------
// /dashboard/agenda/importar — dos modos de traerse citas a otracita:
//
//   · `vision` — capturas de pantalla de Booksy/Treatwell/libreta de papel,
//                GPT-4o extrae las citas. Útil cuando no hay export.
//   · `ical`   — archivo .ics estándar (Booksy "Export Calendar", Treatwell,
//                Google Calendar). Más rápido y limpio si hay export.
//
// El switch entre ambos vive en `ImportModeSwitch` para no convertir esta
// page en un client component (necesita el redirect server-side).
// -----------------------------------------------------------------------------

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')
  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const sp = await searchParams
  const initialMode = sp.mode === 'ical' ? 'ical' : 'vision'

  return (
    <AreaShell area="agenda">
      <AreaContent scroll="region" maxWidth="5xl">
        <p
          className="mb-4 text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Trae tus citas futuras desde otro sistema. Si tienes un archivo .ics
          (Booksy «Export Calendar», Treatwell, Google Calendar) usa esa opción
          — es la más fiable. Si no, sube capturas de pantalla y la IA las lee.
        </p>
        <ImportModeSwitch initialMode={initialMode} />
      </AreaContent>
    </AreaShell>
  )
}
