export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { clients, subscriptions } from '@/db/schema';
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { CreditCard, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
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
  formatEur,
  formatDate,
  type Tone,
} from '../_components/AdminUI';

/**
 * Billing dashboard for the SaaS itself (NOT what the barbers invoice their
 * own customers — that lives in /admin/verifactu).
 *
 * The numbers Alex actually needs to know every morning:
 *   · MRR — active recurring revenue, broken down by tier/interval
 *   · Trials about to flip — Pro 14d trials that will convert (or churn) this week
 *   · Past-due / failed payments — subs that need contacting
 *   · Recent cancellations — churn signal
 *   · Stripe Connect activation pipeline — barbers stuck before they can accept payments
 *
 * Everything that links into Stripe links via the per-client edit page; no
 * direct Stripe API calls happen here (cheap, fast, idempotent reads).
 */

const TRIAL_EXPIRY_WINDOW_DAYS = 7;

export default async function AdminBillingPage() {
  const now = new Date();
  const trialExpirySoon = new Date(now);
  trialExpirySoon.setDate(trialExpirySoon.getDate() + TRIAL_EXPIRY_WINDOW_DAYS);
  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);

  const [
    activeSubsByTier,
    activeSubsByInterval,
    pastDueSubs,
    trialsExpiringSoon,
    recentCancellations,
    connectPipeline,
  ] = await Promise.all([
    // Active subs grouped by tier
    db
      .select({
        tier: subscriptions.tier,
        count: sql<number>`count(*)::int`,
        amountCents: sql<number>`coalesce(sum(${subscriptions.amount}), 0)::int`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))
      .groupBy(subscriptions.tier),

    // Active subs grouped by billing interval (monthly vs annual)
    db
      .select({
        interval: subscriptions.billingInterval,
        count: sql<number>`count(*)::int`,
        amountCents: sql<number>`coalesce(sum(${subscriptions.amount}), 0)::int`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))
      .groupBy(subscriptions.billingInterval),

    // Past due — Stripe failed retry, customer card declined, etc.
    db
      .select({
        id: subscriptions.id,
        clientId: subscriptions.clientId,
        businessName: clients.businessName,
        email: clients.email,
        tier: subscriptions.tier,
        amount: subscriptions.amount,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      })
      .from(subscriptions)
      .leftJoin(clients, eq(subscriptions.clientId, clients.id))
      .where(eq(subscriptions.status, 'past_due'))
      .orderBy(desc(subscriptions.currentPeriodEnd)),

    // Pro trials ending in the next 7 days
    db
      .select({
        id: clients.id,
        businessName: clients.businessName,
        email: clients.email,
        tier: clients.tier,
        trialEndsAt: clients.trialEndsAt,
        status: clients.status,
        stripeSubscriptionId: clients.stripeSubscriptionId,
      })
      .from(clients)
      .where(
        and(
          isNotNull(clients.trialEndsAt),
          gte(clients.trialEndsAt, now),
          lte(clients.trialEndsAt, trialExpirySoon),
        ),
      )
      .orderBy(clients.trialEndsAt),

    // Cancellations in the last 30 days
    db
      .select({
        id: subscriptions.id,
        clientId: subscriptions.clientId,
        businessName: clients.businessName,
        email: clients.email,
        tier: subscriptions.tier,
        amount: subscriptions.amount,
        cancelledAt: subscriptions.cancelledAt,
      })
      .from(subscriptions)
      .leftJoin(clients, eq(subscriptions.clientId, clients.id))
      .where(
        and(
          eq(subscriptions.status, 'cancelled'),
          isNotNull(subscriptions.cancelledAt),
          gte(subscriptions.cancelledAt, last30Days),
        ),
      )
      .orderBy(desc(subscriptions.cancelledAt))
      .limit(20),

    // Stripe Connect pipeline — active clients without a green Connect account.
    // These barbers can't accept online payments yet → friction in the funnel.
    db
      .select({
        id: clients.id,
        businessName: clients.businessName,
        email: clients.email,
        stripeConnectStatus: clients.stripeConnectStatus,
        stripeConnectAccountId: clients.stripeConnectAccountId,
      })
      .from(clients)
      .where(
        and(
          eq(clients.status, 'active'),
          inArray(clients.stripeConnectStatus, ['none', 'pending', 'restricted']),
        ),
      ),
  ]);

  // Derived totals
  const totalMrrCents = activeSubsByTier.reduce((acc, r) => acc + (r.amountCents || 0), 0);
  const totalActive = activeSubsByTier.reduce((acc, r) => acc + r.count, 0);

  // Monthly normalized MRR (annual / 12)
  const monthlyMrrCents = activeSubsByInterval.reduce((acc, r) => {
    if (r.interval === 'annual') return acc + Math.round(r.amountCents / 12);
    return acc + r.amountCents;
  }, 0);

  const churnedLast30 = recentCancellations.length;
  const trialsCount = trialsExpiringSoon.length;
  const pastDueCount = pastDueSubs.length;
  const connectIncomplete = connectPipeline.length;

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <PageHeader
        title="Billing"
        subtitle={
          <span>
            Lo que cobra otracita a sus barberías —{' '}
            <span className="text-brand font-semibold">{totalActive}</span> suscripciones activas,
            MRR <span className="text-brand font-semibold">{formatEur(monthlyMrrCents)}</span>.
          </span>
        }
      />

      {/* Alerts row */}
      {(pastDueCount > 0 || trialsCount > 0) && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pastDueCount > 0 && (
            <AlertCard
              tone="danger"
              title={`${pastDueCount} cobro${pastDueCount === 1 ? '' : 's'} en past_due`}
              description="Stripe no ha podido cobrar. Contacta al barbero antes de que se cancele la sub automáticamente."
            />
          )}
          {trialsCount > 0 && (
            <AlertCard
              tone="warning"
              title={`${trialsCount} trial${trialsCount === 1 ? '' : 's'} acaba${trialsCount === 1 ? '' : 'n'} en 7 días`}
              description="Comprueba que tienen la tarjeta guardada y nada que les frene a convertir."
            />
          )}
        </div>
      )}

      {/* KPIs */}
      <KpiGrid cols={4}>
        <KpiCard
          icon={<CreditCard size={120} />}
          label="MRR normalizado"
          value={formatEur(monthlyMrrCents)}
          sub="annual ÷ 12 + monthly"
          tone="brand"
        />
        <KpiCard
          label="ARR proyectado"
          value={formatEur(monthlyMrrCents * 12)}
          sub="si nadie churnea"
        />
        <KpiCard
          icon={<TrendingUp size={120} />}
          label="Suscripciones activas"
          value={totalActive.toLocaleString('es-ES')}
          sub={`facturado bruto ${formatEur(totalMrrCents)} / periodo`}
        />
        <KpiCard
          icon={<AlertTriangle size={120} />}
          label="Churn últ. 30d"
          value={churnedLast30.toLocaleString('es-ES')}
          tone={churnedLast30 === 0 ? 'success' : churnedLast30 < 3 ? 'warning' : 'danger'}
          sub="cancellations"
        />
      </KpiGrid>

      {/* Breakdown grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
        <Section title="Por tier">
          <div className="rounded-2xl border border-line bg-surface overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="border-b border-line bg-overlay">
                <tr className="text-left">
                  <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3">Tier</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3 text-right">Subs</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3 text-right">MRR bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activeSubsByTier.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-ink-3">
                      Aún sin suscripciones activas.
                    </td>
                  </tr>
                ) : (
                  activeSubsByTier.map((row) => (
                    <tr key={row.tier ?? 'unknown'} className="hover:bg-overlay/40">
                      <td className="px-5 py-3 font-bold uppercase text-xs tracking-wider text-brand-strong">
                        {row.tier ?? 'sin tier'}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-ink">{row.count}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink">{formatEur(row.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Por intervalo">
          <div className="rounded-2xl border border-line bg-surface overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="border-b border-line bg-overlay">
                <tr className="text-left">
                  <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3">Intervalo</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3 text-right">Subs</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-widest font-bold text-ink-3 text-right">MRR bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activeSubsByInterval.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-ink-3">
                      Aún sin suscripciones activas.
                    </td>
                  </tr>
                ) : (
                  activeSubsByInterval.map((row) => (
                    <tr key={row.interval ?? 'unknown'} className="hover:bg-overlay/40">
                      <td className="px-5 py-3 font-bold uppercase text-xs tracking-wider text-brand-strong">
                        {row.interval ?? 'sin intervalo'}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-ink">{row.count}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink">{formatEur(row.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* Past-due subs */}
      <Section title={`Cobros fallidos / past_due (${pastDueSubs.length})`}>
        {pastDueSubs.length === 0 ? (
          <EmptyState icon={CreditCard} title="Sin cobros fallidos." description="Toda la cartera al día." />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Email</th>
                  <th className={TABLE_HEAD_CELL}>Tier</th>
                  <th className={TABLE_HEAD_CELL}>Stripe sub</th>
                  <th className={TABLE_HEAD_CELL}>Fin periodo</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>Importe</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {pastDueSubs.map((r) => (
                  <tr key={r.id} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>
                      <Link
                        href={`/admin/clients/${r.clientId}`}
                        className="font-semibold text-ink hover:text-brand transition-colors"
                      >
                        {r.businessName || <span className="italic text-ink-3">desconocido</span>}
                      </Link>
                    </td>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{r.email}</td>
                    <td className={`${TABLE_CELL} text-xs uppercase font-bold text-brand-strong`}>{r.tier || '—'}</td>
                    <td className={`${TABLE_CELL} font-mono text-[11px] text-ink-3 truncate max-w-[14ch]`}>{r.stripeSubscriptionId}</td>
                    <td className={`${TABLE_CELL} text-xs text-ink-2`}>{formatDate(r.currentPeriodEnd)}</td>
                    <td className={`${TABLE_CELL} text-right font-mono text-ink`}>{formatEur(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Trials a punto de vencer */}
      <Section title={`Trials que acaban en ${TRIAL_EXPIRY_WINDOW_DAYS} días (${trialsExpiringSoon.length})`}>
        {trialsExpiringSoon.length === 0 ? (
          <EmptyState icon={Clock} title="Ningún trial activo se acaba esta semana." />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Email</th>
                  <th className={TABLE_HEAD_CELL}>Tier</th>
                  <th className={TABLE_HEAD_CELL}>Acaba</th>
                  <th className={TABLE_HEAD_CELL}>Status cliente</th>
                  <th className={TABLE_HEAD_CELL}>Tarjeta guardada</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {trialsExpiringSoon.map((r) => {
                  const daysLeft = r.trialEndsAt
                    ? Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const tone: Tone = daysLeft <= 2 ? 'danger' : daysLeft <= 4 ? 'warning' : 'info';
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
                      <td className={`${TABLE_CELL} text-xs uppercase font-bold text-brand-strong`}>{r.tier}</td>
                      <td className={TABLE_CELL}>
                        <Badge tone={tone}>en {daysLeft} día{daysLeft === 1 ? '' : 's'}</Badge>
                      </td>
                      <td className={`${TABLE_CELL} text-xs uppercase text-ink-2`}>{r.status}</td>
                      <td className={TABLE_CELL}>
                        {r.stripeSubscriptionId ? (
                          <Badge tone="success">sí</Badge>
                        ) : (
                          <Badge tone="warning">no</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Conexiones Stripe Connect pendientes */}
      <Section
        title={`Stripe Connect incompleto (${connectIncomplete})`}
        description="Barberías activas que no pueden aceptar pagos online todavía."
      >
        {connectIncomplete === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Toda la cartera con Connect activo."
            description="Todas las barberías activas pueden cobrar online."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Email</th>
                  <th className={TABLE_HEAD_CELL}>Estado Connect</th>
                  <th className={TABLE_HEAD_CELL}>Account ID</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {connectPipeline.map((r) => {
                  const tone: Tone =
                    r.stripeConnectStatus === 'restricted'
                      ? 'danger'
                      : r.stripeConnectStatus === 'pending'
                        ? 'warning'
                        : 'neutral';
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
                      <td className={TABLE_CELL}>
                        <Badge tone={tone}>{r.stripeConnectStatus}</Badge>
                      </td>
                      <td className={`${TABLE_CELL} font-mono text-[11px] text-ink-3 truncate max-w-[20ch]`}>
                        {r.stripeConnectAccountId || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Cancelaciones recientes */}
      <Section title={`Cancelaciones últ. 30 días (${recentCancellations.length})`}>
        {recentCancellations.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Ninguna cancelación reciente." />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Email</th>
                  <th className={TABLE_HEAD_CELL}>Tier</th>
                  <th className={TABLE_HEAD_CELL}>Cancelado</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>Importe perdido</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {recentCancellations.map((r) => (
                  <tr key={r.id} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>
                      <Link
                        href={`/admin/clients/${r.clientId}`}
                        className="font-semibold text-ink hover:text-brand transition-colors"
                      >
                        {r.businessName || <span className="italic text-ink-3">desconocido</span>}
                      </Link>
                    </td>
                    <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{r.email}</td>
                    <td className={`${TABLE_CELL} text-xs uppercase font-bold text-brand-strong`}>{r.tier || '—'}</td>
                    <td className={`${TABLE_CELL} text-xs text-ink-2`}>{formatDate(r.cancelledAt)}</td>
                    <td className={`${TABLE_CELL} text-right font-mono text-danger`}>{formatEur(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
