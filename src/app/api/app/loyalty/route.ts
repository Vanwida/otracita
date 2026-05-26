import { cookies } from 'next/headers'
import { createHash } from 'node:crypto'
import { db } from '@/db'
import { appSessions, clients, customers, loyaltyLedger } from '@/db/schema'
import { and, eq, gt, desc } from 'drizzle-orm'
import { computeBalance, computeProgress } from '@/lib/loyalty/compute'
import { canonicalPhone } from '@/lib/phone'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// GET /api/app/loyalty?slug=<barbershop-slug>
//
// Devuelve el estado de fidelización del cliente PWA autenticado en la
// barbería indicada por `slug`. Resuelve el cliente (appUser) vía cookie de
// sesión y mapea a `customers` por phone + clientId.
//
// Respuesta:
//   · { enabled: false }                                   si la barbería no tiene loyalty
//   · { enabled: true, mode, balance, progress, recent }   si sí
//   · { enabled: true, balance: 0, newCustomer: true }     si la barbería tiene loyalty
//                                                          pero el cliente aún no tiene customer row
//     (esto pasa p.ej. si nunca ha reservado con esta barbería)
//
// `recent`: las últimas 10 entradas del ledger para que la tarjeta del
// cliente muestre su historial reciente (sin canje desde aquí — el barbero
// canjea físicamente en la tienda).
// -----------------------------------------------------------------------------

const SESSION_COOKIE = 'otracita_app_session'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  if (!slug) {
    return Response.json({ error: 'slug required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) {
    return Response.json({ loggedIn: false }, { status: 401 })
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const [session] = await db
    .select()
    .from(appSessions)
    .where(and(eq(appSessions.tokenHash, tokenHash), gt(appSessions.expiresAt, new Date())))
  if (!session) {
    return Response.json({ loggedIn: false }, { status: 401 })
  }

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client) {
    return Response.json({ error: 'Barbershop not found' }, { status: 404 })
  }

  if (!client.loyaltyEnabled) {
    return Response.json({ loggedIn: true, enabled: false })
  }

  const config = client.loyaltyConfig as unknown as LoyaltyConfig | null
  if (!config || typeof config !== 'object' || !('mode' in config)) {
    return Response.json({ loggedIn: true, enabled: false })
  }

  // Resolver customer por (clientId, phone). Phone viene del appUser.
  const { appUsers } = await import('@/db/schema')
  const [appUser] = await db.select().from(appUsers).where(eq(appUsers.id, session.userId))
  if (!appUser) {
    return Response.json({ loggedIn: true, enabled: true, balance: 0, newCustomer: true })
  }

  // appUsers.phone is E.164 by schema; canonicalize anyway so the customer
  // match is correct even against rows created before canonicalization
  // (idempotent for proper E.164).
  const appUserPhone = canonicalPhone(appUser.phone)
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.clientId, client.id), eq(customers.phone, appUserPhone)))
  if (!customer) {
    const progress0 = computeProgress(0, config)
    return Response.json({
      loggedIn: true,
      enabled: true,
      mode: config.mode,
      balance: 0,
      progress: progress0,
      newCustomer: true,
    })
  }

  // Cargamos columnas extra para reconstruir el historial visual del cliente
  // (delta + reason + snapshot + fecha). El cómputo de balance ignora las
  // columnas que no necesita; no hay coste extra significativo en una query.
  const rows = await db
    .select({
      id: loyaltyLedger.id,
      delta: loyaltyLedger.delta,
      reason: loyaltyLedger.reason,
      rewardSnapshot: loyaltyLedger.rewardSnapshot,
      createdAt: loyaltyLedger.createdAt,
    })
    .from(loyaltyLedger)
    .where(
      and(eq(loyaltyLedger.clientId, client.id), eq(loyaltyLedger.customerId, customer.id)),
    )
    .orderBy(desc(loyaltyLedger.createdAt))

  const balance = computeBalance(rows, config)
  const progress = computeProgress(balance, config)

  // El historial que enviamos al cliente es deliberadamente acotado a 10
  // entradas — la tarjeta es resumen, no auditoría. Si en el futuro hay
  // demanda, paginamos en un endpoint dedicado.
  const recent = rows.slice(0, 10).map((r) => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    rewardSnapshot: r.rewardSnapshot,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }))

  return Response.json({
    loggedIn: true,
    enabled: true,
    mode: config.mode,
    balance,
    progress,
    recent,
  })
}
