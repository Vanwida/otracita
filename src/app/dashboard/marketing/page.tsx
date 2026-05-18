export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { Gift } from 'lucide-react'
import LoyaltySettings from '../_components/LoyaltySettings'
import LoyaltyCustomerLookup from '../_components/LoyaltyCustomerLookup'
import AreaShell from '../_components/AreaShell'
import AreaContent from '../_components/AreaContent'
import UpgradeRequired from '../_components/UpgradeRequired'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// /dashboard/marketing — pestaña FIDELIDAD (índice del área Marketing).
//
// Contrato de IA: Marketing = Fidelidad · Promos · WhatsApp · Reseñas. La
// Fidelidad es el índice. Contenido movido 1:1 desde el antiguo
// /dashboard/fidelidad — misma query (client + chatbotServices),
// LoyaltySettings se auto-guarda contra los mismos endpoints (PATCH
// /api/loyalty/config). /dashboard/fidelidad → redirect aquí.
//
// LÓGICA DE SERVIDOR INTACTA — solo cambia la ruta.
// -----------------------------------------------------------------------------

interface ServiceRow {
  name: string
  duration?: number | string
  price?: number | string
}

export default async function MarketingFidelidadPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'loyaltyAdvanced')) {
    return (
      <UpgradeRequired
        feature="loyaltyAdvanced"
        title="Fidelidad"
        icon={Gift}
        back={{ label: 'Inicio', href: '/dashboard' }}
      />
    )
  }

  const rawServices = (client.chatbotServices ?? []) as ServiceRow[]
  const serviceNames = Array.isArray(rawServices)
    ? rawServices
        .map((s) => (typeof s?.name === 'string' ? s.name.trim() : ''))
        .filter((n): n is string => n.length > 0)
    : []

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
        <p
          className="mb-4 text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Premia a tus clientes recurrentes. Tú eliges las reglas: al décimo
          corte, puntos por euro gastado, lo que funcione en tu barbería.
        </p>

        <LoyaltySettings
          initial={{
            enabled: client.loyaltyEnabled,
            mode: (client.loyaltyMode as 'stamps' | 'points') ?? 'stamps',
            config: client.loyaltyConfig as unknown as LoyaltyConfig | null,
          }}
          availableServices={serviceNames}
        />

        <LoyaltyCustomerLookup enabled={client.loyaltyEnabled} />
      </AreaContent>
    </AreaShell>
  )
}
