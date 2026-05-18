export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, customers, ratings } from '@/db/schema'
import { and, eq, gte, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Star,
  Gift,
  Megaphone,
  Bell,
  Users,
  Snowflake,
  AlertTriangle,
} from 'lucide-react'
import type { LoyaltyConfig, LoyaltyReward } from '@/lib/loyalty/types'
import { HubCard, HubCardLine, HubChipRow, HubChip } from '../_components/HubCard'
import PageShell from '../_components/PageShell'

// -----------------------------------------------------------------------------
// /dashboard/crecer — hub de features de crecimiento.
//
// 3 cards: lo que atrae (Reseñas), lo que retiene (Fidelidad), lo que reactiva
// (Marketing). Cada métrica del negocio (visitas, clientes nuevos, nota media,
// facturado) vive en su sitio natural — no se duplican aquí.
//
// Cadencia esperada: semanal. El barbero entra a ver "¿cómo va?".
// -----------------------------------------------------------------------------

export default async function CrecerPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Stats últimos 30 días para los chips de las tarjetas.
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [ratingStatsRow, ratings30Row, customerCountsRow] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        avg: sql<number>`avg(${ratings.rating})`,
      })
      .from(ratings)
      .where(eq(ratings.clientId, client.id))
      .then((rows) => rows[0]),
    db
      .select({ count: sql<number>`count(*)` })
      .from(ratings)
      .where(and(eq(ratings.clientId, client.id), gte(ratings.createdAt, thirtyDaysAgo)))
      .then((rows) => rows[0]),
    db
      .select({
        total: sql<number>`count(*)::int`,
        inactivos: sql<number>`count(*) FILTER (
          WHERE COALESCE(${customers.totalBookings}, 0) >= 1
          AND (${customers.lastBookingAt} IS NULL
               OR ${customers.lastBookingAt} < NOW() - INTERVAL '90 days')
        )::int`,
        noshows: sql<number>`count(*) FILTER (WHERE COALESCE(${customers.noShows}, 0) > 0)::int`,
      })
      .from(customers)
      .where(eq(customers.clientId, client.id))
      .then((rows) => rows[0]),
  ])

  const ratingCount = Number(ratingStatsRow?.count ?? 0)
  const ratingAvg = ratingCount > 0 ? Number(ratingStatsRow?.avg ?? 0) : 0
  const ratings30 = Number(ratings30Row?.count ?? 0)
  const customerTotal = Number(customerCountsRow?.total ?? 0)
  const customerInactivos = Number(customerCountsRow?.inactivos ?? 0)
  const customerNoshows = Number(customerCountsRow?.noshows ?? 0)

  const loyaltyConfig = (client.loyaltyConfig ?? {}) as Partial<LoyaltyConfig>
  const loyaltyHeadline = formatLoyaltyHeadline(client.loyaltyEnabled, client.loyaltyMode, loyaltyConfig)

  return (
    <PageShell
      title="Crecer"
      subtitle="Lo que hace que vuelvan: reseñas, fidelidad y promos para llenar huecos."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Clientes — accionable: inactivos · no-shows · bloqueados.
            No mostramos "Total clientes" como hero; el valor está en los
            que requieren acción ahora. */}
        <HubCard
          href="/dashboard/clientes"
          icon={Users}
          title="Clientes"
          status={
            customerInactivos > 0
              ? { tone: 'warn', label: `${customerInactivos} sin venir` }
              : { tone: 'ok', label: 'Todo al día' }
          }
        >
          {customerTotal === 0 ? (
            <HubCardLine>Aparecerán aquí cuando empiecen a reservar.</HubCardLine>
          ) : customerInactivos > 0 ? (
            <HubCardLine bold>
              {customerInactivos} {customerInactivos === 1 ? 'cliente no ha venido' : 'clientes no han venido'} en 90 días
            </HubCardLine>
          ) : (
            <HubCardLine>Tu cartera está activa.</HubCardLine>
          )}
          <HubChipRow>
            {customerInactivos > 0 && <HubChip icon={Snowflake}>{customerInactivos} inactivos</HubChip>}
            {customerNoshows > 0 && <HubChip icon={AlertTriangle}>{customerNoshows} no-shows</HubChip>}
          </HubChipRow>
        </HubCard>

        {/* Reseñas */}
        <HubCard
          href="/dashboard/resenas"
          icon={Star}
          title="Reseñas"
          status={
            client.ratingsEnabled
              ? { tone: 'ok', label: 'Activa' }
              : { tone: 'neutral', label: 'Desactivada' }
          }
        >
          {ratingCount > 0 ? (
            <HubCardLine bold>
              {ratingAvg.toFixed(1)}/5 · {ratingCount} {ratingCount === 1 ? 'valoración' : 'valoraciones'}
            </HubCardLine>
          ) : client.ratingsEnabled ? (
            <HubCardLine>Aún no has recibido valoraciones.</HubCardLine>
          ) : (
            <HubCardLine>Pide opinión a tus clientes tras cada servicio.</HubCardLine>
          )}
          <HubChipRow>
            {ratingCount > 0 && <HubChip icon={Star}>Media {ratingAvg.toFixed(1)}</HubChip>}
            {ratings30 > 0 && <HubChip>+{ratings30} este mes</HubChip>}
          </HubChipRow>
        </HubCard>

        {/* Fidelidad */}
        <HubCard
          href="/dashboard/fidelidad"
          icon={Gift}
          title="Fidelidad"
          status={
            client.loyaltyEnabled
              ? { tone: 'ok', label: 'Activa' }
              : { tone: 'neutral', label: 'Desactivada' }
          }
        >
          {client.loyaltyEnabled ? (
            <HubCardLine bold>{loyaltyHeadline}</HubCardLine>
          ) : (
            <HubCardLine>Premia al cliente que vuelve. Sellos o puntos.</HubCardLine>
          )}
          {client.loyaltyEnabled && (
            <HubChipRow>
              <HubChip>Modo: {client.loyaltyMode === 'points' ? 'puntos' : 'sellos'}</HubChip>
              {loyaltyConfig.expirationMonths != null
                ? <HubChip>Caduca a {loyaltyConfig.expirationMonths} meses</HubChip>
                : <HubChip>Sin caducidad</HubChip>}
            </HubChipRow>
          )}
        </HubCard>

        {/* Marketing */}
        <HubCard
          href="/dashboard/marketing"
          icon={Megaphone}
          title="Marketing"
          status={
            client.promosEnabled
              ? { tone: 'ok', label: 'Promos activas' }
              : { tone: 'neutral', label: 'Promos OFF' }
          }
        >
          {client.promosEnabled ? (
            <HubCardLine bold>Llenar huecos cuando la agenda esté floja</HubCardLine>
          ) : (
            <HubCardLine>Promos para llenar huecos · tienda de productos.</HubCardLine>
          )}
          <HubChipRow>
            {client.promosEnabled && <HubChip icon={Bell}>Promos contextuales</HubChip>}
            <HubChip>Tienda de productos</HubChip>
          </HubChipRow>
        </HubCard>
      </div>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de preview
// ─────────────────────────────────────────────────────────────────────────────

function formatLoyaltyHeadline(
  enabled: boolean,
  mode: string,
  config: Partial<LoyaltyConfig>,
): string {
  if (!enabled) return 'Desactivada'
  if (mode === 'stamps') {
    const stampsCfg = config as Partial<{ stampsNeeded: number; reward: LoyaltyReward }>
    const n = stampsCfg.stampsNeeded ?? 0
    const reward = formatReward(stampsCfg.reward)
    if (n > 0 && reward) return `Cada ${n} visitas: ${reward}`
    if (n > 0) return `Cada ${n} visitas`
    return 'Por configurar'
  }
  if (mode === 'points') {
    const pointsCfg = config as Partial<{
      euroToPoints: number
      redeemTiers: Array<{ pointsCost: number; reward: LoyaltyReward }>
    }>
    const ratio = pointsCfg.euroToPoints ?? 1
    const firstTier = pointsCfg.redeemTiers?.[0]
    if (firstTier) return `${ratio} pt por € · ${firstTier.pointsCost} pts → ${formatReward(firstTier.reward)}`
    return `${ratio} pt por €`
  }
  return 'Configurado'
}

function formatReward(reward: LoyaltyReward | undefined): string {
  if (!reward) return ''
  if (reward.type === 'service') return reward.serviceName ? `${reward.serviceName} gratis` : 'servicio gratis'
  if (reward.type === 'discount_amount' && typeof reward.cents === 'number') {
    return `${(reward.cents / 100).toFixed(0)} € de descuento`
  }
  if (reward.type === 'discount_pct' && typeof reward.pct === 'number') {
    return reward.pct === 100 ? 'gratis' : `${reward.pct}% off`
  }
  return ''
}
