export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients, customers, bookings, ratings, tips } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Users,
  Phone,
  Mail,
  Star,
  Clock,
  Snowflake,
  Shield,
  AlertTriangle,
  MessageCircle,
} from 'lucide-react'
import UnblockCustomerButton from '@/app/dashboard/_components/UnblockCustomerButton'
import ForgiveNoShowsButton from '@/app/dashboard/_components/ForgiveNoShowsButton'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import SourceChip from '@/app/dashboard/_components/SourceChip'
import SearchAndSort from './SearchAndSort'
import CustomerContactActions from './CustomerContactActions'

// -----------------------------------------------------------------------------
// /dashboard/clientes — listado accionable de clientes de la barbería.
//
// Esta página existe para responder TRES preguntas que sí se accionan:
//   1. ¿Quién no viene? (Inactivos > 90 días)         → reactivar via Marketing
//   2. ¿Quién me ha fallado? (No-shows)               → perdonar / bloquear
//   3. ¿A quién tengo bloqueado?                      → revisar / desbloquear
//
// NO mostramos KPIs vanity (Total / Retención / Frecuencia) — un barbero no
// los acciona. La métrica accionable es "23 inactivos" porque pulsable → CTA
// "reactivar con promo" que lleva a Marketing.
//
// La búsqueda + ordenar siguen disponibles para el caso raro de lookup
// puntual ("¿quién era Carlos?"). El caso normal es entrar desde la cita en
// Agenda — el usuario no busca clientes a diario.
//
// Datos: `bookings.price` está en EUROS (foot-gun en CLAUDE.md). Aggregates
// vía LEFT JOIN en una sola query — escala hasta miles sin paginar.
// -----------------------------------------------------------------------------

type StatusFilter = 'all' | 'inactivo' | 'noshow' | 'blocked'
type SortKey = 'recent' | 'spent' | 'visits' | 'rating' | 'name'

interface Props {
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>
}

// Mapa de ORDER BY válido — defendemos contra inyección por URL.
const SORT_SQL: Record<SortKey, string> = {
  recent: 'c.last_booking_at DESC NULLS LAST',
  spent: 'COALESCE(b.spent_cents, 0) DESC',
  visits: 'COALESCE(c.total_bookings, 0) DESC',
  rating: 'r.avg_rating DESC NULLS LAST',
  name: `LOWER(COALESCE(c.name, '')) ASC`,
}

/** Construye href para los pills de status preservando search y sort actuales. */
function buildPillHref(status: StatusFilter | null, q: string, sort: SortKey): string {
  const params = new URLSearchParams()
  if (status && status !== 'all') params.set('status', status)
  if (q.length > 0) params.set('q', q)
  if (sort !== 'recent') params.set('sort', sort)
  const qs = params.toString()
  return qs ? `/dashboard/clientes?${qs}` : '/dashboard/clientes'
}

interface CustomerRow {
  id: string
  phone: string
  name: string | null
  email: string | null
  total_bookings: number | null
  no_shows: number | null
  cancellations: number | null
  reputation: string | null
  last_booking_at: Date | null
  spent_cents: number
  tips_cents: number
  rating_count: number
  avg_rating: number | null
  completed_count: number
  first_source: string | null
}

const HABITUAL_DAYS = 30
const INACTIVO_DAYS = 90

export default async function ClientesPage({ searchParams }: Props) {
  const { status: rawStatus, q: rawQ, sort: rawSort } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const statusFilter: StatusFilter =
    rawStatus === 'inactivo' || rawStatus === 'noshow' || rawStatus === 'blocked'
      ? rawStatus
      : 'all'

  const search = (rawQ ?? '').trim().slice(0, 100)
  const searchLike = `%${search.toLowerCase()}%`

  // Sort whitelist — sino caemos en 'recent'. CRITICAL: SORT_SQL es un
  // string literal mapeado, NO interpolación de input del usuario.
  const sortKey: SortKey = (rawSort && rawSort in SORT_SQL ? (rawSort as SortKey) : 'recent')
  const orderClause = SORT_SQL[sortKey]

  // Mapeo del filter pill → WHERE clause de la query principal.
  const statusWhere = (() => {
    if (statusFilter === 'blocked') return sql`AND c.reputation = 'blocked'`
    if (statusFilter === 'noshow') return sql`AND COALESCE(c.no_shows, 0) > 0`
    if (statusFilter === 'inactivo') {
      // Inactivo: tiene historial (total_bookings ≥ 1) Y su última visita es >90d
      // (o nunca tuvo). Excluimos los que aún no tienen bookings — esos son
      // "Nuevo, sin venir aún", no "Inactivo".
      return sql`AND COALESCE(c.total_bookings, 0) >= 1
                 AND (c.last_booking_at IS NULL
                      OR c.last_booking_at < NOW() - INTERVAL '${sql.raw(`${INACTIVO_DAYS} days`)}')`
    }
    return sql``
  })()

  // Búsqueda por nombre o phone (insensible a mayúsculas, parcial).
  const searchWhere = search
    ? sql`AND (LOWER(COALESCE(c.name, '')) LIKE ${searchLike}
               OR c.phone LIKE ${searchLike}
               OR LOWER(COALESCE(c.email, '')) LIKE ${searchLike})`
    : sql``

  const result = await db.execute(sql`
    SELECT
      c.id, c.phone, c.name, c.email, c.total_bookings, c.no_shows, c.cancellations,
      c.reputation, c.last_booking_at,
      c.first_source,
      COALESCE(b.spent_cents, 0)::bigint AS spent_cents,
      COALESCE(b.completed_count, 0)::int AS completed_count,
      COALESCE(t.tips_cents, 0)::bigint AS tips_cents,
      COALESCE(r.rating_count, 0)::int AS rating_count,
      r.avg_rating
    FROM ${customers} c
    LEFT JOIN (
      SELECT customer_phone,
             SUM(price) * 100 AS spent_cents,
             COUNT(*) AS completed_count
      FROM ${bookings}
      WHERE client_id = ${client.id} AND status = 'completed'
      GROUP BY customer_phone
    ) b ON b.customer_phone = c.phone
    LEFT JOIN (
      SELECT customer_phone, SUM(amount_cents) AS tips_cents
      FROM ${tips}
      WHERE client_id = ${client.id} AND status = 'paid'
      GROUP BY customer_phone
    ) t ON t.customer_phone = c.phone
    LEFT JOIN (
      SELECT customer_phone, COUNT(*) AS rating_count, AVG(rating)::float AS avg_rating
      FROM ${ratings}
      WHERE client_id = ${client.id}
      GROUP BY customer_phone
    ) r ON r.customer_phone = c.phone
    WHERE c.client_id = ${client.id}
    ${statusWhere}
    ${searchWhere}
    ORDER BY ${sql.raw(orderClause)}
  `)

  const rows = (result as unknown as { rows: CustomerRow[] }).rows.map((r) => ({
    ...r,
    spent_cents: Number(r.spent_cents),
    tips_cents: Number(r.tips_cents),
    completed_count: Number(r.completed_count),
    rating_count: Number(r.rating_count),
    avg_rating: r.avg_rating !== null ? Number(r.avg_rating) : null,
    last_booking_at: r.last_booking_at ? new Date(r.last_booking_at) : null,
  }))

  // Counts para los filter pills — una sola query con COUNT FILTER por estado.
  // No mostramos "totales" como KPI: el número en cada pill ya da contexto.
  const countsResult = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE COALESCE(total_bookings, 0) >= 1
        AND (last_booking_at IS NULL
             OR last_booking_at < NOW() - INTERVAL '${sql.raw(`${INACTIVO_DAYS} days`)}')
      )::int AS inactivos,
      COUNT(*) FILTER (WHERE COALESCE(no_shows, 0) > 0)::int AS noshows,
      COUNT(*) FILTER (WHERE reputation = 'blocked')::int AS bloqueados
    FROM ${customers}
    WHERE client_id = ${client.id}
  `)

  const counts = (countsResult as unknown as {
    rows: Array<{ total: number; inactivos: number; noshows: number; bloqueados: number }>
  }).rows[0] ?? { total: 0, inactivos: 0, noshows: 0, bloqueados: 0 }

  // El breakdown de origen (atribución) se movió a su propia pestaña
  // /dashboard/clientes/atribucion (contrato de IA) — esta vista es solo
  // la Lista accionable.

  return (
    <AreaShell area="clientes">
      <AreaContent scroll="region" maxWidth="7xl">
      <p className="text-ink-2 mb-4" style={{ fontSize: 'var(--text-meta)' }}>
        Quién no viene · quién falla · quién está bloqueado.{' '}
        <span className="text-ink-3">Para gastado/propinas/ticket medio, ve a Ventas.</span>
      </p>

      {/* Buscador + ordenar (la búsqueda es para el caso raro de lookup
          puntual; el barbero llega a un cliente normalmente desde la cita
          en Agenda). */}
      <SearchAndSort />

      {/* Filter pills — accionables, con contador. No hay pill "Todos los
          buenos" porque no se acciona; sí "Inactivos / No-shows / Bloqueados"
          porque cada uno tiene un curso de acción claro. */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        <FilterPill
          href={buildPillHref(null, search, sortKey)}
          active={statusFilter === 'all'}
          label="Todos"
          count={counts.total}
        />
        <FilterPill
          href={buildPillHref('inactivo', search, sortKey)}
          active={statusFilter === 'inactivo'}
          label="Inactivos"
          count={counts.inactivos}
          icon={Snowflake}
        />
        <FilterPill
          href={buildPillHref('noshow', search, sortKey)}
          active={statusFilter === 'noshow'}
          label="No-shows"
          count={counts.noshows}
          icon={AlertTriangle}
        />
        <FilterPill
          href={buildPillHref('blocked', search, sortKey)}
          active={statusFilter === 'blocked'}
          label="Bloqueados"
          count={counts.bloqueados}
          icon={Shield}
        />
      </div>

      {/* Banner accionable cuando filtras por Inactivos. La acción real está
          en el botón 💬 de cada fila — abre WhatsApp con su nombre prerellenado.
          La automatización masiva (reactivación con promo) viene en una
          siguiente iteración; por ahora ofrecemos lo que SÍ se puede hacer. */}
      {statusFilter === 'inactivo' && counts.inactivos > 0 && (
        <div className="mb-4 rounded-xl bg-brand-softer border border-brand/20 px-4 py-3">
          <p className="text-sm font-semibold text-brand-strong">
            {counts.inactivos} {counts.inactivos === 1 ? 'cliente' : 'clientes'} sin venir hace más de 90 días
          </p>
          <p className="text-xs text-ink-2 mt-0.5">
            Mándales un mensaje desde el botón <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-success/10 text-success align-middle"><MessageCircle className="h-3 w-3" /></span> de cada fila. Recuperas tráfico con 30 segundos de trabajo.
          </p>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="h-12 w-12 rounded-2xl bg-brand-softer flex items-center justify-center">
              <Users className="h-6 w-6 text-brand" />
            </div>
            {statusFilter === 'all' && search.length === 0 ? (
              <>
                <p className="text-base font-semibold text-ink mt-1">Sin clientes todavía</p>
                <p className="text-ink-3 text-sm max-w-xs">
                  Aparecerán aquí cuando alguien reserve por WhatsApp o por tu app pública.
                </p>
                <Link
                  href="/dashboard/app"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong transition-colors"
                >
                  Compartir mi app pública →
                </Link>
              </>
            ) : (
              <p className="text-ink-3 text-sm max-w-xs">
                {statusFilter === 'inactivo'
                  ? 'Ningún cliente lleva más de 90 días sin venir. Buen trabajo.'
                  : statusFilter === 'noshow'
                  ? 'Nadie ha hecho no-show. Tu agenda está limpia.'
                  : statusFilter === 'blocked'
                  ? 'No tienes a nadie bloqueado.'
                  : 'No hay clientes con este filtro o búsqueda.'}
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-overlay border-b border-line">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold text-ink-2">Cliente</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-center">Visitas</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-right hidden md:table-cell">Gastado</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 hidden md:table-cell">Última visita</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-center hidden sm:table-cell">Nota</th>
                  <th className="px-4 py-3 font-semibold text-ink-2">Estado</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 w-32 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const status = computeStatus(c.last_booking_at, c.total_bookings ?? 0)
                  const reputationVal = (c.reputation as Reputation | null) ?? 'good'
                  return (
                    <tr key={c.id} className="hover:bg-canvas transition-colors group">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/clientes/${c.id}`}
                          className="font-medium text-ink hover:text-brand transition-colors block truncate"
                        >
                          {c.name || 'Sin nombre'}
                        </Link>
                        <div className="text-xs text-ink-3 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          <a href={`tel:${c.phone}`} className="hover:text-brand transition-colors">
                            {c.phone}
                          </a>
                          {c.email && (
                            <>
                              <span className="text-ink-3/60">·</span>
                              <Mail className="h-3 w-3 shrink-0" />
                              <a
                                href={`mailto:${c.email}`}
                                className="hover:text-brand transition-colors truncate max-w-[160px]"
                              >
                                {c.email}
                              </a>
                            </>
                          )}
                          {c.first_source && (
                            <>
                              <span className="text-ink-3/60">·</span>
                              <SourceChip source={c.first_source} size="xs" />
                            </>
                          )}
                        </div>
                        {/* Mobile-only: contextual data hidden in dedicated
                            columns below md. Sin esto el barbero en móvil ve
                            solo Cliente/Visitas/Estado y pierde el 60% de la
                            info. */}
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3 md:hidden">
                          {c.spent_cents > 0 && (
                            <span className="tabular-nums">{(c.spent_cents / 100).toFixed(0)} €</span>
                          )}
                          {c.spent_cents > 0 && c.last_booking_at && <span>·</span>}
                          {c.last_booking_at && (
                            <span>{formatLastVisit(c.last_booking_at)}</span>
                          )}
                          {c.avg_rating !== null && (
                            <>
                              {(c.spent_cents > 0 || c.last_booking_at) && <span>·</span>}
                              <span className="inline-flex items-center gap-0.5">
                                <Star className="h-2.5 w-2.5 text-warning fill-warning" />
                                {c.avg_rating.toFixed(1)}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-ink tabular-nums">
                        {c.total_bookings ?? 0}
                        {(c.no_shows ?? 0) > 0 && (
                          <span className="ml-1.5 text-[10px] text-danger" title={`${c.no_shows} no-shows`}>
                            ({c.no_shows} NS)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ink hidden md:table-cell tabular-nums">
                        {c.spent_cents > 0 ? `${(c.spent_cents / 100).toFixed(0)} €` : <span className="text-ink-3">—</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-2 hidden md:table-cell">
                        {formatLastVisit(c.last_booking_at)}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {c.avg_rating !== null ? (
                          <span className="inline-flex items-center gap-1 text-ink">
                            <Star className="h-3 w-3 text-warning fill-warning" />
                            {c.avg_rating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={status} reputation={reputationVal} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <CustomerContactActions phone={c.phone} name={c.name} />
                          {reputationVal === 'blocked' ? (
                            <UnblockCustomerButton customerId={c.id} />
                          ) : (c.no_shows ?? 0) > 0 ? (
                            <ForgiveNoShowsButton customerId={c.id} customerName={c.name} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </AreaContent>
    </AreaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ─────────────────────────────────────────────────────────────────────────────

type Reputation = 'good' | 'warning' | 'blocked'
type CustomerStatus = 'habitual' | 'nuevo' | 'inactivo' | 'normal'

function computeStatus(lastBookingAt: Date | null, totalBookings: number): CustomerStatus {
  if (totalBookings === 0) return 'normal'
  if (totalBookings === 1) return 'nuevo'
  if (!lastBookingAt) return 'inactivo'
  const daysAgo = Math.floor((Date.now() - lastBookingAt.getTime()) / (1000 * 60 * 60 * 24))
  if (daysAgo > INACTIVO_DAYS) return 'inactivo'
  if (daysAgo <= HABITUAL_DAYS) return 'habitual'
  return 'normal'
}

function StatusChip({ status, reputation }: { status: CustomerStatus; reputation: Reputation }) {
  // La reputación bloqueada/aviso pisa al chip de actividad — es más
  // accionable para el barbero ("este me ha hecho no-shows" gana sobre
  // "este es habitual").
  if (reputation === 'blocked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 text-danger border border-danger/20 px-2.5 py-0.5 text-xs font-medium">
        Bloqueado
      </span>
    )
  }
  if (reputation === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">
        Aviso
      </span>
    )
  }
  if (status === 'habitual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">
        Habitual
      </span>
    )
  }
  if (status === 'nuevo') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-softer text-brand-strong border border-brand/20 px-2.5 py-0.5 text-xs font-medium">
        Nuevo
      </span>
    )
  }
  if (status === 'inactivo') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-3 border border-line px-2.5 py-0.5 text-xs font-medium">
        <Snowflake className="h-3 w-3" />
        Inactivo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-overlay/60 text-ink-2 border border-line px-2.5 py-0.5 text-xs font-medium">
      <Clock className="h-3 w-3" />
      Normal
    </span>
  )
}

function formatLastVisit(d: Date | null): React.ReactNode {
  if (!d) return <span className="text-ink-3">—</span>
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days}d`
  if (days < 60) return 'hace ~1 mes'
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return `hace ${Math.floor(days / 365)} años`
}

function FilterPill({
  href,
  active,
  label,
  count,
  icon: Icon,
}: {
  href: string
  active: boolean
  label: string
  count: number
  icon?: typeof Users
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors border ${
        active
          ? 'bg-brand text-brand-ink border-brand'
          : 'bg-surface text-ink-2 border-line hover:border-line-strong hover:text-ink'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
      <span className={`tabular-nums ${active ? 'opacity-80' : 'text-ink-3'}`}>{count}</span>
    </Link>
  )
}
