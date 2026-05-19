export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, customers } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import SourceBreakdown from '../SourceBreakdown'

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

  const sourceResult = await db.execute(sql`
    SELECT first_source AS source, COUNT(*)::int AS count
    FROM ${customers}
    WHERE client_id = ${client.id}
      AND first_source IS NOT NULL
      AND first_source_captured_at IS NOT NULL
      AND first_source_captured_at >= NOW() - INTERVAL '30 days'
    GROUP BY first_source
    ORDER BY COUNT(*) DESC
  `)
  const sourceRows = (
    sourceResult as unknown as {
      rows: Array<{ source: string; count: number }>
    }
  ).rows.map((r) => ({ source: r.source, count: Number(r.count) }))
  const sourceTotal = sourceRows.reduce((acc, r) => acc + r.count, 0)

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
