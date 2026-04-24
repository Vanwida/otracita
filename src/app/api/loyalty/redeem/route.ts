import { db } from '@/db'
import { customers, loyaltyLedger, clients } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { computeBalance } from '@/lib/loyalty/compute'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// POST /api/loyalty/redeem
//
// El barbero canjea una recompensa para un cliente al terminar el servicio.
// Valida:
//   · Tenant owns customer
//   · Loyalty está activo
//   · El saldo alcanza para el tier solicitado (points) o supera stampsNeeded (stamps)
// Inserta una fila con delta negativo + rewardSnapshot. La snapshot preserva
// qué se dio aunque el barbero luego renombre un servicio o cambie su config.
//
// Body:
//   { customerId: uuid, tierIndex?: number }
//
// tierIndex es obligatorio en modo 'points' (qué tier canjea) y se ignora en
// 'stamps' (solo hay una recompensa). Index es sobre `redeemTiers` YA ordenado
// por pointsCost ascendente en persistencia.
// -----------------------------------------------------------------------------

interface RedeemBody {
  customerId?: unknown
  tierIndex?: unknown
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  let body: RedeemBody
  try {
    body = (await request.json()) as RedeemBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const customerId = typeof body.customerId === 'string' ? body.customerId : ''
  if (!customerId) {
    return Response.json({ error: 'customerId required' }, { status: 400 })
  }

  // Cargar cliente (tenant) con su config.
  const [clientRow] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, access.client.id))
  if (!clientRow?.loyaltyEnabled) {
    return Response.json({ error: 'Loyalty no está activo' }, { status: 400 })
  }

  const config = clientRow.loyaltyConfig as unknown as LoyaltyConfig
  if (!config || typeof config !== 'object' || !('mode' in config)) {
    return Response.json({ error: 'Loyalty config inválida' }, { status: 400 })
  }

  // Verificar customer pertenece al tenant.
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.clientId, clientRow.id)))
  if (!customer) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  // Saldo actual.
  const rows = await db
    .select({ delta: loyaltyLedger.delta, createdAt: loyaltyLedger.createdAt })
    .from(loyaltyLedger)
    .where(
      and(
        eq(loyaltyLedger.clientId, clientRow.id),
        eq(loyaltyLedger.customerId, customer.id),
      ),
    )
  const balance = computeBalance(rows, config)

  let cost: number
  let rewardSnapshot: unknown

  if (config.mode === 'stamps') {
    cost = config.stampsNeeded
    rewardSnapshot = { ...config.reward }
  } else {
    const idxRaw = typeof body.tierIndex === 'number' ? body.tierIndex : Number(body.tierIndex)
    const idx = Number.isFinite(idxRaw) ? Math.floor(idxRaw) : 0
    if (idx < 0 || idx >= config.redeemTiers.length) {
      return Response.json({ error: 'tierIndex fuera de rango' }, { status: 400 })
    }
    const tier = config.redeemTiers[idx]
    cost = tier.pointsCost
    rewardSnapshot = { ...tier.reward, pointsCost: tier.pointsCost }
  }

  if (balance < cost) {
    return Response.json(
      { error: 'Saldo insuficiente', balance, cost },
      { status: 400 },
    )
  }

  const [inserted] = await db
    .insert(loyaltyLedger)
    .values({
      clientId: clientRow.id,
      customerId: customer.id,
      bookingId: null,
      delta: -cost,
      reason: 'redeem',
      note: null,
      rewardSnapshot,
      createdBy: `barber:${clientRow.id}`,
    })
    .returning()

  return Response.json({
    ok: true,
    ledgerId: inserted.id,
    cost,
    newBalance: balance - cost,
    rewardSnapshot,
  })
}
