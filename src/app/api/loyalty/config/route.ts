import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  sanitizeStampsConfig,
  sanitizePointsConfig,
} from '@/lib/loyalty/compute'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// PATCH /api/loyalty/config
//
// Guarda la configuración de fidelización del barbero autenticado.
//
// Body:
//   { loyaltyEnabled: boolean,
//     loyaltyMode: 'stamps' | 'points',
//     config: LoyaltyStampsConfig | LoyaltyPointsConfig }
//
// La forma de `config` depende del modo. El sanitizer correspondiente valida
// stampsNeeded/euroToPoints/redeemTiers/reward/etc. y devuelve null si algo
// es inválido — en ese caso respondemos 400 y el barbero tiene que corregir.
//
// Si loyaltyEnabled=false, aceptamos config parcialmente inválido (puede
// haberse quedado un viejo config a medias al desactivar). Sólo validamos
// cuando enabled=true para no bloquear el "apagar y arreglar luego".
// -----------------------------------------------------------------------------

interface ConfigBody {
  loyaltyEnabled?: unknown
  loyaltyMode?: unknown
  config?: unknown
}

export async function PATCH(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'loyaltyAdvanced')
  if (gate) return gate

  let body: ConfigBody
  try {
    body = (await request.json()) as ConfigBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const enabled = body.loyaltyEnabled === true
  const mode =
    body.loyaltyMode === 'points' ? 'points' : 'stamps'

  let config: LoyaltyConfig | null = null
  if (mode === 'stamps') {
    config = sanitizeStampsConfig(body.config)
  } else {
    config = sanitizePointsConfig(body.config)
  }

  if (enabled && !config) {
    return Response.json(
      {
        error:
          'La configuración no es válida. Revisa sellos/puntos, recompensa y precio mínimo.',
      },
      { status: 400 },
    )
  }

  await db
    .update(clients)
    .set({
      loyaltyEnabled: enabled,
      loyaltyMode: mode,
      // Si el barbero apaga pero no ha rellenado bien, persistimos lo que
      // mandó para que la UI pueda re-editarlo. Si no mandó nada, {}.
      loyaltyConfig: config ?? ((body.config as object | undefined) ?? {}),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, access.client.id))

  return Response.json({
    ok: true,
    loyaltyEnabled: enabled,
    loyaltyMode: mode,
    config,
  })
}
