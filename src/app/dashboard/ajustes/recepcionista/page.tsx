export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { Mic } from 'lucide-react'
import AreaShell from '../../_components/AreaShell'
import UpgradeRequired from '../../_components/UpgradeRequired'
import VoiceTest from '../../voice-test/VoiceTest'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/recepcionista — pestaña RECEPCIONISTA IA del área
// Ajustes. Contrato de IA. Contenido movido 1:1 desde /dashboard/voice-test
// (mismo gate recepcionistaIA, mismas queries client/chatbotServices,
// mismo VoiceTest). /dashboard/voice-test → redirect aquí.
//
// Nota: el voice bot es browser-test only hoy (puente Twilio es otro todo,
// ver CLAUDE.md) — esto no cambia, solo se reubica la ruta.
// LÓGICA DE SERVIDOR INTACTA.
// -----------------------------------------------------------------------------

interface ServiceConfig {
  name: string
  duration: number
  price?: number
}

interface BusinessHours {
  start: string
  end: string
}

export default async function AjustesRecepcionistaPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email!))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'recepcionistaIA')) {
    return (
      <UpgradeRequired
        feature="recepcionistaIA"
        title="Recepcionista IA"
        icon={Mic}
        pathname="/dashboard/ajustes/recepcionista"
      />
    )
  }

  const services = (client.chatbotServices as ServiceConfig[]) || []
  const hours = (client.chatbotHours as BusinessHours) || {
    start: '09:00',
    end: '20:00',
  }

  // Equipo activo: canonical `barbers` table (CLAUDE.md regla 4). NUNCA
  // client.booksyServices — ese jsonb está congelado y en un tenant nuevo
  // viene vacío, así que la recepcionista no sabía nombrar a nadie. Mismo
  // orden que el bot y la agenda: displayOrder, luego nombre.
  const barberRows = await db
    .select({ name: barbersTable.name })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))
  const barbers = barberRows.map((b) => b.name)

  return (
    <AreaShell area="marketing">
      <div className="min-h-0 flex-1">
        <VoiceTest
          client={{
            businessName: client.businessName,
            services,
            barbers,
            hours,
          }}
        />
      </div>
    </AreaShell>
  )
}
