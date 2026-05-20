import { db } from '@/db'
import { mobilePins } from '@/db/schema'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { hashPin } from '@/lib/auth/mobile-session'
import { MS_IN_MINUTE } from '@/lib/time'

// -----------------------------------------------------------------------------
// POST /api/app/mobile/pin/generate
//
// El barbero (autenticado en la PWA dashboard) genera un PIN de 6 dígitos
// para emparejar la app móvil "otracita Cobros". El PIN dura 10 min y es
// single-use. El frontend lo muestra UNA VEZ al barbero para que lo teclee
// en la app.
//
// Devuelve el PIN en CLARO solo en este momento. La DB guarda solo el hash.
// -----------------------------------------------------------------------------

const PIN_TTL_MINUTES = 10

function generateRandomPin(): string {
  // 6 dígitos: random 0-999999, padStart con ceros.
  const n = Math.floor(Math.random() * 1_000_000)
  return n.toString().padStart(6, '0')
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, user } = access

  const pin = generateRandomPin()
  const expiresAt = new Date(Date.now() + PIN_TTL_MINUTES * MS_IN_MINUTE)

  await db.insert(mobilePins).values({
    clientId: client.id,
    pinHash: hashPin(pin),
    expiresAt,
    createdByEmail: user.email,
  })

  return Response.json({
    pin,                       // ÚNICA vez en claro
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: PIN_TTL_MINUTES * 60,
  })
}
