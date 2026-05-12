export const dynamic = 'force-dynamic';

import { db } from '@/db';
import {
  processedStripeEvents,
  pushSubscriptions,
  mobileSessions,
  appSessions,
  appUsers,
  customers,
  bookings,
  invoices,
  emailParseLog,
  conversations,
  appOtpCodes,
  payments,
  tips,
} from '@/db/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { AlertTriangle, Activity } from 'lucide-react';
import { getRecentAdminActions } from '@/lib/admin/audit';
import {
  PageHeader,
  Section,
  Badge,
  KpiCard,
  KpiGrid,
  EmptyState,
  TABLE_WRAPPER,
  TABLE,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_BODY,
  TABLE_ROW,
  TABLE_CELL,
  formatDateTime,
  type Tone,
} from '../_components/AdminUI';

/**
 * Sistema / Infraestructura. The sysadmin-style page: nothing here is about
 * a business KPI, it's about whether the plumbing is alive. Things Alex
 * needs to see at a glance:
 *   · Stripe events being processed (webhook health)
 *   · Push subscriptions: how many enabled vs how many stale
 *   · Mobile sessions (iPhone app pairings)
 *   · Crons that Vercel runs daily — we can't query the actual run history
 *     from inside the app, but we can show the schedule + the next expected
 *     window so a missing run is visible by comparing with reality
 *   · Row counts per table — sanity baseline for "is anything growing"
 */

interface CronInfo {
  path: string;
  schedule: string;
  description: string;
}

const CRONS: CronInfo[] = [
  {
    path: '/api/cron/reminders',
    schedule: '0 10 * * *',
    description: 'Recordatorios diarios de citas (10:00).',
  },
  {
    path: '/api/cron/loyalty-award',
    schedule: '0 22 * * *',
    description: 'Awarder de sellos/puntos post-servicio (22:00).',
  },
];

export default async function AdminSystemPage() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    stripeEvent24h,
    stripeEvent7d,
    recentStripeEvents,
    pushTotals,
    pushDevicesStale,
    mobileSessionTotals,
    appSessionTotals,
    rowCounts,
    paymentTotals24h,
    auditLog,
  ] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(processedStripeEvents)
      .where(gte(processedStripeEvents.processedAt, last24h))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(processedStripeEvents)
      .where(gte(processedStripeEvents.processedAt, last7d))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({
        eventId: processedStripeEvents.eventId,
        processedAt: processedStripeEvents.processedAt,
      })
      .from(processedStripeEvents)
      .orderBy(desc(processedStripeEvents.processedAt))
      .limit(20),

    db
      .select({
        total: sql<number>`count(*)::int`,
        enabled: sql<number>`count(*) filter (where ${pushSubscriptions.enabled})::int`,
      })
      .from(pushSubscriptions)
      .then((r) => r[0] ?? { total: 0, enabled: 0 }),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.enabled, true),
          lte(pushSubscriptions.lastUsedAt, staleCutoff),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${mobileSessions.revokedAt} is null)::int`,
      })
      .from(mobileSessions)
      .then((r) => r[0] ?? { total: 0, active: 0 }),

    db
      .select({
        total: sql<number>`count(*)::int`,
        valid: sql<number>`count(*) filter (where ${appSessions.expiresAt} > now())::int`,
      })
      .from(appSessions)
      .then((r) => r[0] ?? { total: 0, valid: 0 }),

    // Row counts across the most operationally relevant tables — sanity baseline
    Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(bookings).then((r) => ({ table: 'bookings', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(customers).then((r) => ({ table: 'customers', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(invoices).then((r) => ({ table: 'invoices', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(emailParseLog).then((r) => ({ table: 'email_parse_log', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(conversations).then((r) => ({ table: 'conversations', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(appUsers).then((r) => ({ table: 'app_users', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(appOtpCodes).then((r) => ({ table: 'app_otp_codes', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(payments).then((r) => ({ table: 'payments', count: r[0]?.c ?? 0 })),
      db.select({ c: sql<number>`count(*)::int` }).from(tips).then((r) => ({ table: 'tips', count: r[0]?.c ?? 0 })),
    ]),

    db
      .select({
        succeeded: sql<number>`count(*) filter (where ${payments.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
      })
      .from(payments)
      .where(gte(payments.createdAt, last24h))
      .then((r) => r[0] ?? { succeeded: 0, failed: 0 }),

    getRecentAdminActions({ limit: 30 }),
  ]);

  // We don't have a cron-run log on disk; the best signal we have for "has the
  // daily reminder cron run today" is: did anything happen in the database that
  // the cron would touch? `bookings.reminderSent` flips inside that cron. So if
  // the cron ran today, we expect at least one row with reminderSent flipped in
  // the last 24h. (Best-effort heuristic, NOT a real cron audit.)
  const cronHeuristic = await db
    .select({
      remindersFlipped: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.reminderSent, true),
        gte(bookings.createdAt, last7d),
      ),
    )
    .then((r) => r[0]?.remindersFlipped ?? 0);

  const pushHealthy = pushTotals.total === 0 || pushDevicesStale / pushTotals.total < 0.3;
  const stripeWebhookOk = stripeEvent24h > 0 || stripeEvent7d === 0;

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <PageHeader
        title="Infraestructura"
        subtitle="Sanidad del sistema — webhooks, crons, sesiones, push. Es lo que se rompe en silencio."
      />

      {/* KPIs */}
      <KpiGrid cols={4}>
        <KpiCard
          icon={<Activity size={120} />}
          label="Stripe events últ. 24h"
          value={stripeEvent24h.toLocaleString('es-ES')}
          sub={`7d: ${stripeEvent7d.toLocaleString('es-ES')}`}
          tone={stripeWebhookOk ? 'success' : 'warning'}
        />
        <KpiCard
          label="Push activos"
          value={`${pushTotals.enabled}/${pushTotals.total}`}
          tone={pushHealthy ? 'success' : 'warning'}
          sub={pushDevicesStale > 0 ? `${pushDevicesStale} sin usar 30d` : 'sin endpoints obsoletos'}
        />
        <KpiCard
          label="Sesiones móvil activas"
          value={`${mobileSessionTotals.active}/${mobileSessionTotals.total}`}
          sub="apps iPhone pareadas y vivas"
        />
        <KpiCard
          label="Cobros online 24h"
          value={paymentTotals24h.succeeded.toLocaleString('es-ES')}
          tone={paymentTotals24h.failed > 0 ? 'warning' : 'success'}
          sub={paymentTotals24h.failed > 0 ? `${paymentTotals24h.failed} fallidos` : 'sin fallos'}
        />
      </KpiGrid>

      {/* Crons */}
      <Section
        title="Cron jobs (vercel.json)"
        description="Schedule declarado en el repo. Heurística: si el cron ha corrido recientemente, las filas que toca deberían reflejarlo."
      >
        <div className={TABLE_WRAPPER}>
          <table className={TABLE}>
            <thead className={TABLE_HEAD}>
              <tr>
                <th className={TABLE_HEAD_CELL}>Path</th>
                <th className={TABLE_HEAD_CELL}>Schedule (UTC)</th>
                <th className={TABLE_HEAD_CELL}>Descripción</th>
                <th className={TABLE_HEAD_CELL}>Señal de vida</th>
              </tr>
            </thead>
            <tbody className={TABLE_BODY}>
              {CRONS.map((c) => {
                const tone: Tone =
                  c.path.endsWith('/reminders')
                    ? cronHeuristic > 0
                      ? 'success'
                      : 'warning'
                    : 'info';
                return (
                  <tr key={c.path} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink`}>{c.path}</td>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{c.schedule}</td>
                    <td className={`${TABLE_CELL} text-xs text-ink-2`}>{c.description}</td>
                    <td className={TABLE_CELL}>
                      {c.path.endsWith('/reminders') ? (
                        <Badge tone={tone}>
                          {cronHeuristic > 0 ? `${cronHeuristic} reminders 7d` : 'sin señal'}
                        </Badge>
                      ) : (
                        <Badge tone="info">señal indirecta</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Stripe events recientes */}
      <Section
        title={`Stripe events procesados — últimos ${recentStripeEvents.length}`}
        description="Tabla de idempotencia. Una fila por evento Stripe procesado correctamente."
      >
        {recentStripeEvents.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Aún no se ha procesado ningún event Stripe."
            description="Si esperabas tráfico, verifica el endpoint de webhook en Stripe."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Procesado</th>
                  <th className={TABLE_HEAD_CELL}>Event ID</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {recentStripeEvents.map((e) => (
                  <tr key={e.eventId} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} text-xs text-ink-2`}>{formatDateTime(e.processedAt)}</td>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink`}>{e.eventId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* App users */}
      <Section title="Usuarios PWA y app móvil">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="Sesiones PWA totales" value={appSessionTotals.total} sub={`${appSessionTotals.valid} vigentes`} />
          <Stat label="Push subscriptions" value={pushTotals.total} sub={`${pushTotals.enabled} enabled`} />
          <Stat
            label="Endpoints stale (>30d)"
            value={pushDevicesStale}
            tone={pushDevicesStale > 0 ? 'warning' : 'success'}
            sub="probable cleanup"
          />
        </div>
      </Section>

      {/* Row counts */}
      <Section
        title="Tamaño de tablas (sanidad)"
        description="Si una de estas no crece como esperabas, algo está silenciado."
      >
        <div className="rounded-2xl border border-line bg-surface overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="border-b border-line bg-overlay">
              <tr className="text-left">
                <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3">Tabla</th>
                <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3 text-right">Filas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rowCounts.map((r) => (
                <tr key={r.table} className="hover:bg-overlay/40">
                  <td className="px-5 py-3 font-mono text-xs text-ink">{r.table}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink">
                    {r.count.toLocaleString('es-ES')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Audit log */}
      <Section
        title="Audit log — últimas acciones admin"
        description='Quién hizo qué cuándo. Cada mutación operativa desde el panel registra un row.'
      >
        {auditLog.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Sin acciones registradas todavía."
            description="Al pausar un cliente, extender un trial, o crear un lead, aparecerá aquí."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cuándo</th>
                  <th className={TABLE_HEAD_CELL}>Admin</th>
                  <th className={TABLE_HEAD_CELL}>Acción</th>
                  <th className={TABLE_HEAD_CELL}>Target</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {auditLog.map((a) => (
                  <tr key={a.id} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} text-xs font-mono text-ink-3`}>{formatDateTime(a.createdAt)}</td>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{a.adminEmail}</td>
                    <td className={`${TABLE_CELL} text-ink`}>{a.summary}</td>
                    <td className={`${TABLE_CELL} text-[11px] font-mono text-ink-3`}>
                      {a.targetType}
                      {a.targetId ? `:${a.targetId.slice(0, 8)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* hint sin datos */}
      {stripeEvent7d === 0 && rowCounts.every((r) => r.count === 0) && (
        <div className="rounded-2xl border border-line bg-overlay/40 p-5 text-sm text-ink-2 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>
            Todas las tablas operativas están vacías. Probablemente este es un entorno de staging o no se ha lanzado todavía.
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
}) {
  const colors = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    brand: 'text-brand',
    gold: 'text-[var(--color-brand-strong)]',
    info: 'text-ink-2',
    neutral: 'text-ink',
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-3">{label}</p>
      <p className={`font-display text-3xl font-semibold mt-1 ${colors}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-3 mt-1">{sub}</p>}
    </div>
  );
}
