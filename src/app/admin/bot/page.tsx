export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { clients, conversations, analytics } from '@/db/schema';
import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { MessageSquare, AlertTriangle, Activity as ActivityIcon } from 'lucide-react';
import {
  PageHeader,
  Section,
  Badge,
  KpiCard,
  KpiGrid,
  EmptyState,
  AlertCard,
  TABLE_WRAPPER,
  TABLE,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_BODY,
  TABLE_ROW,
  TABLE_CELL,
  formatDateTime,
  relativeFromNow,
  type Tone,
} from '../_components/AdminUI';

/**
 * Bot health dashboard. Two integrations live here:
 *   · WhatsApp Cloud API — token expiry is a silent killer (bot dies, the
 *     barber finds out when a customer complains)
 *   · SumUp Tap to Pay — token expiry breaks online card collection
 *
 * Plus volume metrics (messages 24h/7d) and the live conversation state
 * table, so Alex can see who's mid-flow with the bot right now.
 */

/** Tokens within this window from today are "expiring soon" — bot will break unless rotated. */
const TOKEN_EXPIRY_DAYS = 7;
/** Hard cap on token expiry display — beyond this they're not actionable yet. */
const TOKEN_EXPIRY_LOOKAHEAD_DAYS = 30;
/** Conversations untouched for this many minutes are considered "stuck". */
const STUCK_CONVERSATION_HOURS = 24;

export default async function AdminBotPage() {
  const now = new Date();
  const expirySoon = new Date(now);
  expirySoon.setDate(expirySoon.getDate() + TOKEN_EXPIRY_DAYS);
  const expiryHorizon = new Date(now);
  expiryHorizon.setDate(expiryHorizon.getDate() + TOKEN_EXPIRY_LOOKAHEAD_DAYS);
  const stuckCutoff = new Date(now.getTime() - STUCK_CONVERSATION_HOURS * 60 * 60 * 1000);

  const last24h = new Date(now);
  last24h.setDate(last24h.getDate() - 1);
  const last7d = new Date(now);
  last7d.setDate(last7d.getDate() - 7);

  const [
    metaTokensExpiring,
    metaTokensActive,
    sumupTokensExpiring,
    msg24hAgg,
    msg7dAgg,
    activeConversations,
    stuckConversations,
    botCoverage,
  ] = await Promise.all([
    // Meta access tokens expiring within the lookahead window (or already expired)
    db
      .select({
        id: clients.id,
        businessName: clients.businessName,
        email: clients.email,
        metaTokenExpiresAt: clients.metaTokenExpiresAt,
        whatsappPhoneNumberId: clients.whatsappPhoneNumberId,
        status: clients.status,
      })
      .from(clients)
      .where(
        and(
          isNotNull(clients.whatsappAccessToken),
          isNotNull(clients.metaTokenExpiresAt),
          lte(clients.metaTokenExpiresAt, expiryHorizon),
        ),
      )
      .orderBy(clients.metaTokenExpiresAt),

    // Active clients with the bot fully wired up
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.status, 'active'),
          isNotNull(clients.whatsappAccessToken),
          isNotNull(clients.whatsappPhoneNumberId),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    // SumUp tokens — barberies with Tap to Pay set up + token about to die
    db
      .select({
        id: clients.id,
        businessName: clients.businessName,
        email: clients.email,
        sumupTokenExpiresAt: clients.sumupTokenExpiresAt,
        sumupReaderName: clients.sumupReaderName,
      })
      .from(clients)
      .where(
        and(
          isNotNull(clients.sumupAccessToken),
          isNotNull(clients.sumupTokenExpiresAt),
          lte(clients.sumupTokenExpiresAt, expiryHorizon),
        ),
      )
      .orderBy(clients.sumupTokenExpiresAt),

    // Aggregate messages last 24h across all clients
    db
      .select({
        received: sql<number>`coalesce(sum(${analytics.messagesReceived}), 0)::int`,
        replied: sql<number>`coalesce(sum(${analytics.messagesReplied}), 0)::int`,
        bookings: sql<number>`coalesce(sum(${analytics.bookingsMade}), 0)::int`,
      })
      .from(analytics)
      .where(gte(analytics.date, last24h))
      .then((r) => r[0] ?? { received: 0, replied: 0, bookings: 0 }),

    // Aggregate messages last 7d
    db
      .select({
        received: sql<number>`coalesce(sum(${analytics.messagesReceived}), 0)::int`,
        replied: sql<number>`coalesce(sum(${analytics.messagesReplied}), 0)::int`,
        bookings: sql<number>`coalesce(sum(${analytics.bookingsMade}), 0)::int`,
      })
      .from(analytics)
      .where(gte(analytics.date, last7d))
      .then((r) => r[0] ?? { received: 0, replied: 0, bookings: 0 }),

    // Active conversations grouped by client (most-recent first)
    db
      .select({
        clientId: conversations.clientId,
        businessName: clients.businessName,
        active: sql<number>`count(*)::int`,
        lastInteraction: sql<Date>`max(${conversations.lastInteraction})`,
      })
      .from(conversations)
      .leftJoin(clients, eq(conversations.clientId, clients.id))
      .groupBy(conversations.clientId, clients.businessName)
      .orderBy(desc(sql<Date>`max(${conversations.lastInteraction})`))
      .limit(50),

    // Stuck conversations — step != idle but no interaction for hours
    db
      .select({
        id: conversations.id,
        clientId: conversations.clientId,
        businessName: clients.businessName,
        customerPhone: conversations.customerPhone,
        step: conversations.step,
        lastInteraction: conversations.lastInteraction,
      })
      .from(conversations)
      .leftJoin(clients, eq(conversations.clientId, clients.id))
      .where(
        and(
          sql`${conversations.step} <> 'idle'`,
          lte(conversations.lastInteraction, stuckCutoff),
        ),
      )
      .orderBy(desc(conversations.lastInteraction))
      .limit(50),

    // Coverage — bot vs no-bot among ACTIVE clients
    db
      .select({
        total: sql<number>`count(*)::int`,
        withBot: sql<number>`count(*) filter (where ${clients.whatsappAccessToken} is not null and ${clients.whatsappPhoneNumberId} is not null)::int`,
      })
      .from(clients)
      .where(eq(clients.status, 'active'))
      .then(
        (r) => r[0] ?? { total: 0, withBot: 0 },
      ),
  ]);

  // Filter Meta tokens into 3 buckets: expired, ≤7d, 7-30d
  const expiredMeta = metaTokensExpiring.filter(
    (t) => t.metaTokenExpiresAt && t.metaTokenExpiresAt < now,
  );
  const urgentMeta = metaTokensExpiring.filter(
    (t) => t.metaTokenExpiresAt && t.metaTokenExpiresAt >= now && t.metaTokenExpiresAt <= expirySoon,
  );
  const upcomingMeta = metaTokensExpiring.filter(
    (t) => t.metaTokenExpiresAt && t.metaTokenExpiresAt > expirySoon,
  );

  const replyRate24h = msg24hAgg.received === 0 ? null : msg24hAgg.replied / msg24hAgg.received;

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <PageHeader
        title="Bot WhatsApp"
        subtitle={
          <span>
            Salud del bot —{' '}
            <span className="text-brand font-semibold">{metaTokensActive}</span> barberías con bot activo de{' '}
            <span className="text-brand font-semibold">{botCoverage.total}</span> activas.
          </span>
        }
      />

      {(expiredMeta.length > 0 || urgentMeta.length > 0) && (
        <div className="mb-8 space-y-3">
          {expiredMeta.length > 0 && (
            <AlertCard
              tone="danger"
              title={`${expiredMeta.length} token Meta ya caducado${expiredMeta.length === 1 ? '' : 's'}`}
              description="El bot no puede enviar mensajes. Rota el token en Meta Business y actualiza el campo en el cliente."
            />
          )}
          {urgentMeta.length > 0 && (
            <AlertCard
              tone="warning"
              title={`${urgentMeta.length} token${urgentMeta.length === 1 ? '' : 's'} caduca${urgentMeta.length === 1 ? '' : 'n'} en 7 días`}
              description="Programa la rotación esta semana — si caduca antes, el bot dejará de responder."
            />
          )}
        </div>
      )}

      {/* KPIs */}
      <KpiGrid cols={4}>
        <KpiCard
          icon={<MessageSquare size={120} />}
          label="Mensajes últ. 24h"
          value={msg24hAgg.received.toLocaleString('es-ES')}
          sub={`respondidos ${msg24hAgg.replied.toLocaleString('es-ES')}`}
        />
        <KpiCard
          label="Reply rate 24h"
          value={replyRate24h === null ? '—' : `${(replyRate24h * 100).toFixed(0)}%`}
          tone={
            replyRate24h === null
              ? 'neutral'
              : replyRate24h >= 0.9
                ? 'success'
                : replyRate24h >= 0.7
                  ? 'warning'
                  : 'danger'
          }
        />
        <KpiCard
          label="Reservas vía bot 7d"
          value={msg7dAgg.bookings.toLocaleString('es-ES')}
          sub={`mensajes 7d: ${msg7dAgg.received.toLocaleString('es-ES')}`}
        />
        <KpiCard
          icon={<ActivityIcon size={120} />}
          label="Cobertura bot"
          value={`${botCoverage.withBot}/${botCoverage.total}`}
          tone={botCoverage.total > 0 && botCoverage.withBot === botCoverage.total ? 'success' : 'warning'}
          sub="clientes activos con WA configurado"
        />
      </KpiGrid>

      {/* Tokens Meta */}
      <Section
        title={`Tokens Meta a vigilar (${metaTokensExpiring.length})`}
        description={`Lookhead ${TOKEN_EXPIRY_LOOKAHEAD_DAYS} días. Rota antes de la fecha o el bot deja de responder.`}
      >
        {metaTokensExpiring.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Todos los tokens Meta están a >30 días."
            description="Nada que rotar urgente."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Email</th>
                  <th className={TABLE_HEAD_CELL}>Phone ID</th>
                  <th className={TABLE_HEAD_CELL}>Caduca</th>
                  <th className={TABLE_HEAD_CELL}>Cuándo</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {[...expiredMeta, ...urgentMeta, ...upcomingMeta].map((r) => {
                  const expired = r.metaTokenExpiresAt && r.metaTokenExpiresAt < now;
                  const urgent =
                    r.metaTokenExpiresAt && r.metaTokenExpiresAt >= now && r.metaTokenExpiresAt <= expirySoon;
                  const tone: Tone = expired ? 'danger' : urgent ? 'warning' : 'info';
                  return (
                    <tr key={r.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>
                        <Link
                          href={`/admin/clients/${r.id}`}
                          className="font-semibold text-ink hover:text-brand transition-colors"
                        >
                          {r.businessName}
                        </Link>
                      </td>
                      <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{r.email}</td>
                      <td className={`${TABLE_CELL} font-mono text-xs text-ink-3`}>
                        {r.whatsappPhoneNumberId || '—'}
                      </td>
                      <td className={`${TABLE_CELL} text-xs text-ink-2`}>{formatDateTime(r.metaTokenExpiresAt)}</td>
                      <td className={TABLE_CELL}>
                        <Badge tone={tone}>{expired ? 'CADUCADO' : relativeFromNow(r.metaTokenExpiresAt)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Tokens SumUp */}
      <Section
        title={`Tokens SumUp a vigilar (${sumupTokensExpiring.length})`}
        description="Si caduca el token, deja de funcionar el cobro con datáfono físico."
      >
        {sumupTokensExpiring.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No hay tokens SumUp por caducar."
            description="Tokens SumUp renuevan vía refresh — sin acción manual."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Reader</th>
                  <th className={TABLE_HEAD_CELL}>Caduca</th>
                  <th className={TABLE_HEAD_CELL}>Cuándo</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {sumupTokensExpiring.map((r) => {
                  const expired = r.sumupTokenExpiresAt && r.sumupTokenExpiresAt < now;
                  const urgent =
                    r.sumupTokenExpiresAt &&
                    r.sumupTokenExpiresAt >= now &&
                    r.sumupTokenExpiresAt <= expirySoon;
                  const tone: Tone = expired ? 'danger' : urgent ? 'warning' : 'info';
                  return (
                    <tr key={r.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>
                        <Link
                          href={`/admin/clients/${r.id}`}
                          className="font-semibold text-ink hover:text-brand transition-colors"
                        >
                          {r.businessName}
                        </Link>
                      </td>
                      <td className={`${TABLE_CELL} text-xs text-ink-2`}>{r.sumupReaderName || '—'}</td>
                      <td className={`${TABLE_CELL} text-xs text-ink-2`}>{formatDateTime(r.sumupTokenExpiresAt)}</td>
                      <td className={TABLE_CELL}>
                        <Badge tone={tone}>
                          {expired ? 'CADUCADO' : relativeFromNow(r.sumupTokenExpiresAt)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Conversaciones stuck */}
      <Section
        title={`Conversaciones stuck (>${STUCK_CONVERSATION_HOURS}h sin avanzar) — ${stuckConversations.length}`}
        description="Bot dejó al cliente a medias de un flow. Suele indicar bug o cliente cambió de opinión."
      >
        {stuckConversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Ninguna conversación stuck."
            description="Todos los flows o se cerraron o están progresando."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Cliente final</th>
                  <th className={TABLE_HEAD_CELL}>Step actual</th>
                  <th className={TABLE_HEAD_CELL}>Última interacción</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {stuckConversations.map((r) => (
                  <tr key={r.id} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>
                      <Link
                        href={`/admin/clients/${r.clientId}`}
                        className="font-semibold text-ink hover:text-brand transition-colors"
                      >
                        {r.businessName || <span className="italic text-ink-3">desconocido</span>}
                      </Link>
                    </td>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{r.customerPhone}</td>
                    <td className={`${TABLE_CELL} text-xs font-mono uppercase`}>
                      <Badge tone="warning">{r.step}</Badge>
                    </td>
                    <td className={`${TABLE_CELL} text-xs text-ink-2`}>{formatDateTime(r.lastInteraction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Actividad por cliente */}
      <Section
        title={`Actividad por cliente (top ${activeConversations.length} por última interacción)`}
      >
        {activeConversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Aún sin conversaciones registradas."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Conversaciones</th>
                  <th className={TABLE_HEAD_CELL}>Última interacción</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {activeConversations.map((r) => (
                  <tr key={r.clientId} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>
                      <Link
                        href={`/admin/clients/${r.clientId}`}
                        className="font-semibold text-ink hover:text-brand transition-colors"
                      >
                        {r.businessName || <span className="italic text-ink-3">desconocido</span>}
                      </Link>
                    </td>
                    <td className={`${TABLE_CELL} text-right font-mono text-ink`}>
                      {r.active.toLocaleString('es-ES')}
                    </td>
                    <td className={`${TABLE_CELL} text-xs text-ink-2`}>
                      {formatDateTime(r.lastInteraction)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* hint si nada se ha enviado */}
      {msg24hAgg.received === 0 && msg7dAgg.received === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-overlay/40 p-5 text-sm text-ink-2 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>
            La tabla <code className="font-mono text-xs">analytics</code> no tiene filas. Probablemente el cron que la rellena aún no se ha ejecutado, o las barberías activas aún no han recibido mensajes.
          </span>
        </div>
      )}
    </div>
  );
}
