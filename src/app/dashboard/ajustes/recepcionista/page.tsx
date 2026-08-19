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
// Ajustes. Gate `recepcionistaIA`. /dashboard/voice-test → redirect aquí.
//
// El voice bot es browser-test only hoy (el puente telefónico es otro todo,
// ver CLAUDE.md): esta pantalla es una prueba de micrófono y así lo dice.
//
// Ya no se le pasan servicios / barberos / horario al componente: el agente
// de voz es global (ver /api/voice/token) y no recibe nada de esto, así que
// pintarlo daba a entender una personalización que no existe. De paso se cae
// la lectura de `booksyServices` para sacar el equipo — columna legacy
// congelada que devolvía barberos ya borrados (ver CLAUDE.md § convención 4).
// -----------------------------------------------------------------------------

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

  return (
    <AreaShell area="marketing">
      <div className="min-h-0 flex-1">
        <VoiceTest client={{ businessName: client.businessName }} />
      </div>
    </AreaShell>
  )
}
