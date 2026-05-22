export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import SourceBreakdown from '../SourceBreakdown'
import {
  getClientSourceBreakdown,
  sumSourceBreakdown,
} from '@/lib/marketing/sources-breakdown'

// -----------------------------------------------------------------------------
// /dashboard/clientes/atribucion — pestaña ATRIBUCIÓN del área Clientes.
//
// Contrato de IA: la atribución de origen (de dónde vienen los clientes
// nuevos) es su propia pestaña, separada de la Lista. Accionable: decide en
// qué canal invertir.
//
// LÓGICA DE SERVIDOR INTACTA: misma query EXACTA que tenía clientes/page
// (customers cuya first visit cae en los últimos 30 días, first_source no
// nulo) — movida 1:1, no se cambia ni una cláusula. Tenant por sesión.
// -----------------------------------------------------------------------------

export default async function ClientesAtribucionPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Últimos 30 días (first-touch). Helper compartido — misma fuente que el
  // panel de Marketing y los chips de filtrado de /dashboard/clientes.
  const since30d = new Date()
  since30d.setDate(since30d.getDate() - 30)
  const sourceRows = await getClientSourceBreakdown(client.id, { since: since30d })
  const sourceTotal = sumSourceBreakdown(sourceRows)

  // Mismo chasis de área que la pestaña Lista (clientes/page.tsx): header
  // + tira de pestañas Lista·Atribución + región acotada. Antes esta página
  // renderizaba <AreaContent> a pelo → sin cabecera, sin pestañas, sin
  // vuelta (bug de hermano divergente, qa-sweep P1-4).
  return (
    <AreaShell area="clientes">
      <AreaContent scroll="region" maxWidth="6xl">
        <p
          className="mb-4 text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          De dónde llegan tus clientes nuevos (últimos 30 días). Te dice en
          qué canal invertir.
        </p>
        <SourceBreakdown items={sourceRows} total={sourceTotal} />
      </AreaContent>
    </AreaShell>
  )
}
