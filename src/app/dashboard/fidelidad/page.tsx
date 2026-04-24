export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import LoyaltySettings from '../_components/LoyaltySettings'
import LoyaltyCustomerLookup from '../_components/LoyaltyCustomerLookup'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// /dashboard/fidelidad — Config de la tarjeta de fidelidad de la barbería.
//
// Server component ligero que carga el cliente autenticado + los servicios
// disponibles (necesarios para picks de recompensa "un servicio gratis") y
// delega toda la UI a <LoyaltySettings /> (client, se auto-guarda via PATCH
// /api/loyalty/config — mismo patrón que TipsSettings).
// -----------------------------------------------------------------------------

interface ServiceRow {
  name: string
  duration?: number | string
  price?: number | string
}

export default async function FidelidadPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const rawServices = (client.chatbotServices ?? []) as ServiceRow[]
  const serviceNames = Array.isArray(rawServices)
    ? rawServices
        .map((s) => (typeof s?.name === 'string' ? s.name.trim() : ''))
        .filter((n): n is string => n.length > 0)
    : []

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">
          Tarjeta de fidelidad
        </h1>
        <p className="text-ink-2">
          Premia a tus clientes recurrentes. Tú eliges las reglas — al décimo
          corte, puntos por euro gastado, lo que funcione en tu barbería.
        </p>
      </div>

      <LoyaltySettings
        initial={{
          enabled: client.loyaltyEnabled,
          mode: (client.loyaltyMode as 'stamps' | 'points') ?? 'stamps',
          config: client.loyaltyConfig as unknown as LoyaltyConfig | null,
        }}
        availableServices={serviceNames}
      />

      <LoyaltyCustomerLookup enabled={client.loyaltyEnabled} />
    </div>
  )
}
