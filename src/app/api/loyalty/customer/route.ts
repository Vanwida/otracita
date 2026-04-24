import { db } from '@/db'
import { customers, loyaltyLedger } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { computeBalance, computeProgress } from '@/lib/loyalty/compute'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// GET /api/loyalty/customer?phone=+34...
//
// Usado por la UI del barbero en /dashboard/fidelidad para consultar el
// saldo de un cliente de la barbería dado su teléfono. Devuelve balance +
// progress + histórico reciente (últimas 20 filas del ledger) para
// transparencia.
//
// La búsqueda se hace SIEMPRE dentro del tenant del barbero autenticado —
// phone es ambiguo (un cliente puede existir en múltiples tenants), así
// que el match es (clientId, phone).
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  if (!access.client.loyaltyEnabled) {
    return Response.json({ error: 'Loyalty no está activo' }, { status: 400 })
  }

  const url = new URL(request.url)
  const phoneRaw = url.searchParams.get('phone') ?? ''
  const phone = phoneRaw.trim()
  if (!phone) {
    return Response.json({ error: 'phone required' }, { status: 400 })
  }

  const config = access.client.loyaltyConfig as unknown as LoyaltyConfig | null
  if (!config || typeof config !== 'object' || !('mode' in config)) {
    return Response.json({ error: 'Loyalty config inválida' }, { status: 400 })
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.clientId, access.client.id), eq(customers.phone, phone)))
  if (!customer) {
    return Response.json({ found: false })
  }

  const rows = await db
    .select({
      id: loyaltyLedger.id,
      delta: loyaltyLedger.delta,
      reason: loyaltyLedger.reason,
      note: loyaltyLedger.note,
      rewardSnapshot: loyaltyLedger.rewardSnapshot,
      createdAt: loyaltyLedger.createdAt,
    })
    .from(loyaltyLedger)
    .where(
      and(
        eq(loyaltyLedger.clientId, access.client.id),
        eq(loyaltyLedger.customerId, customer.id),
      ),
    )
    .orderBy(desc(loyaltyLedger.createdAt))
    .limit(20)

  const balance = computeBalance(rows, config)
  const progress = computeProgress(balance, config)

  return Response.json({
    found: true,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      totalBookings: customer.totalBookings ?? 0,
    },
    mode: config.mode,
    balance,
    progress,
    recent: rows,
  })
}
