export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import ImportClientesFlow from './ImportClientesFlow'

// -----------------------------------------------------------------------------
// /dashboard/clientes/importar — sube tu cartera de clientes desde un CSV.
//
// Onboarding crítico: barberos que llegan de Booksy/Treatwell/Fresha traen
// 500-3000 clientes y NO los van a meter a mano. Sin esto, otracita arranca
// vacía (sin historial, sin fidelidad acumulable, sin reactivación de
// inactivos) y el churn de las primeras 2 semanas se dispara.
//
// Flujo (en el client component):
//   1. Descarga plantilla.csv (opcional, ayuda al barbero a entender el formato)
//   2. Sube su CSV → papaparse local → preview con estado por fila
//   3. Botón "Importar X clientes" → POST batch → resumen final
// -----------------------------------------------------------------------------

export default async function ImportarClientesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')
  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  return (
    <AreaShell area="clientes">
      <AreaContent scroll="region" maxWidth="5xl">
        <p
          className="mb-4 text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Sube tu base de clientes desde un CSV (lo que exporta Booksy,
          Treatwell, Fresha o cualquier hoja de cálculo). Revisas el preview,
          pulsas importar y tu cartera queda en otracita.
        </p>
        <ImportClientesFlow />
      </AreaContent>
    </AreaShell>
  )
}
