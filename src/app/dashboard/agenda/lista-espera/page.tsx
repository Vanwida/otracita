export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import WaitlistManager from './WaitlistManager'

// -----------------------------------------------------------------------------
// /dashboard/agenda/lista-espera (#88)
//
// Lista de clientes apuntados a la espera de que se libere un hueco. La feed
// automática es invisible para el barbero (el sistema avisa solo al cancelar
// una cita), pero conviene una vista para:
//   · Saber quién está esperando hoy/mañana y por qué hora.
//   · Notificar manualmente cuando la ventana de WhatsApp está cerrada y
//     el cliente no tiene la PWA (riesgo conocido: sin template aprobada
//     de Meta, el aviso fuera de las 24h se queda pendiente).
//   · Limpiar entradas obsoletas.
//
// Vive dentro del área "Agenda" como sub-tab (no añade item top-level al
// sidebar — sigue la regla CLAUDE.md de "no inflar la nav").
// -----------------------------------------------------------------------------

export default async function WaitlistPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')
  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  return (
    <AreaShell area="agenda">
      <AreaContent scroll="region" maxWidth="5xl">
        <WaitlistManager />
      </AreaContent>
    </AreaShell>
  )
}
