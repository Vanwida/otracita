import { db } from '@/db'
import { mobilePins, mobileSessions, clients } from '@/db/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'
import {
  generateSessionToken,
  hashToken,
  hashPin,
  safeHashEqual,
} from '@/lib/auth/mobile-session'

// -----------------------------------------------------------------------------
// POST /api/app/mobile/pin/redeem
//
// Body:
//   {
//     pin: string,             // 6 dígitos
//     deviceLabel?: string,    // "iPhone 14 Pro de Reni"
//   }
//
// Sin auth previa — la app móvil llama esto durante onboarding. El PIN
// actúa como credencial de un solo uso. Si válido + no caducado + no usado,
// devolvemos un session_token long-lived para uso en requests subsiguientes.
//
// Seguridad:
//   · Comparación de PIN hashes con timingSafeEqual
//   · PIN single-use: tras redeem, redeemed_at != null bloquea re-uso
//   · Si hay >1 PIN activo del mismo client, escogemos el más reciente que
//     coincida en hash
//   · Tras éxito → todos los PINs no canjeados del mismo client se invalidan
//     (limpieza)
// -----------------------------------------------------------------------------

interface Body {
  pin?: unknown
  deviceLabel?: unknown
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  if (!/^\d{6}$/.test(pin)) {
    return Response.json({ error: 'PIN inválido (6 dígitos)' }, { status: 400 })
  }

  const deviceLabel =
    typeof body.deviceLabel === 'string' && body.deviceLabel.length > 0
      ? body.deviceLabel.slice(0, 100)
      : null

  const pinHash = hashPin(pin)
  const now = new Date()

  // Buscar PINs activos (no caducados, no canjeados) que coincidan.
  // No revelamos qué client es por timing si no existe — devolvemos siempre
  // el mismo error.
  const candidates = await db
    .select()
    .from(mobilePins)
    .where(and(isNull(mobilePins.redeemedAt), gt(mobilePins.expiresAt, now)))

  // Comparación timingSafe de hashes
  const matched = candidates.find((c) => safeHashEqual(c.pinHash, pinHash))
  if (!matched) {
    return Response.json({ error: 'PIN incorrecto o caducado' }, { status: 401 })
  }

  // Marcar PIN como redimido
  await db
    .update(mobilePins)
    .set({ redeemedAt: now })
    .where(eq(mobilePins.id, matched.id))

  // Limpieza: invalidar otros PINs activos del mismo client (un barbero solo
  // empareja un dispositivo a la vez en este flow básico).
  await db
    .update(mobilePins)
    .set({ redeemedAt: now })
    .where(and(eq(mobilePins.clientId, matched.clientId), isNull(mobilePins.redeemedAt)))

  // Validar que el client sigue existiendo (defensa en profundidad).
  const [client] = await db.select().from(clients).where(eq(clients.id, matched.clientId))
  if (!client) {
    return Response.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  }

  // Generar session token long-lived
  const token = generateSessionToken()
  const tokenHash = hashToken(token)

  await db.insert(mobileSessions).values({
    clientId: matched.clientId,
    tokenHash,
    deviceLabel,
  })

  return Response.json({
    token,                                  // ÚNICA vez en claro
    business: {
      id: client.id,
      name: client.businessName,
    },
  })
}
