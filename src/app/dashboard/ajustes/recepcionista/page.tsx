export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { Mic } from 'lucide-react'
import AreaShell from '../../_components/AreaShell'
import UpgradeRequired from '../../_components/UpgradeRequired'
import VoiceTest from '../../voice-test/VoiceTest'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/recepcionista — pestaña RECEPCIONISTA IA del área
// Ajustes. Contrato de IA. Contenido movido 1:1 desde /dashboard/voice-test
// (mismo gate recepcionistaIA, mismas queries client/chatbotServices/
// booksyServices, mismo VoiceTest). /dashboard/voice-test → redirect aquí.
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

interface BooksyService {
  name?: string
  barber?: string
  staff?: string
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
        back={{ label: 'Crecimiento', href: '/dashboard/marketing' }}
      />
    )
  }

  const services = (client.chatbotServices as ServiceConfig[]) || []
  const booksyServices = (client.booksyServices as BooksyService[]) || []
  const hours = (client.chatbotHours as BusinessHours) || {
    start: '09:00',
    end: '20:00',
  }

  const barbers = [
    ...new Set(
      booksyServices
        .map((s) => s.barber || s.staff || null)
        .filter((b): b is string => typeof b === 'string' && b.length > 0),
    ),
  ]

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
