export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import {
  clients,
  subscriptions,
  analytics,
  invoices,
  leads,
  bookings,
  emailParseLog,
} from '@/db/schema';
import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { MS_IN_DAY } from '@/lib/time';
import {
  Users,
  CreditCard,
  MessageCircle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import {
  PageHeader,
  Section,
  KpiCard,
  KpiGrid,
  AlertCard,
  formatEur,
} from './_components/AdminUI';

/**
 * Admin overview — el "command center". El objetivo de esta página NO es ser
 * un dump de tablas, es responder a la pregunta "¿qué tengo que hacer hoy?".
 *
 * Top: bloque de alertas accionables (algo se rompió, algo caduca pronto).
 * Centro: KPIs reales del negocio.
 * Abajo: shortcuts grandes a cada subsección.
 *
 * Tablas (clientes, leads) tienen sus propias páginas — aquí no se duplican.
 */

const TOKEN_EXPIRY_DAYS = 7;
const TRIAL_EXPIRY_DAYS = 7;

export default async function AdminOverview() {
  const now = new Date();
  const last24h = new Date(now.getTime() - MS_IN_DAY);
  const tokenSoon = new Date(now);
  tokenSoon.setDate(tokenSoon.getDate() + TOKEN_EXPIRY_DAYS);
  const trialSoon = new Date(now);
  trialSoon.setDate(trialSoon.getDate() + TRIAL_EXPIRY_DAYS);
  const parserSince = new Date(now.getTime() - MS_IN_DAY);

  const [
    activeClientsAgg,
    onboardingCount,
    mrrAgg,
    msg24hAgg,
    bookings24hCount,
    pastDueCount,
    trialsExpiringCount,
    tokensExpiringCount,
    parserFailures24h,
    verifactuFailing,
    newLeadsCount,
    todayBookingsCount,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${clients.status} = 'active')::int`,
      })
      .from(clients)
      .then((r) => r[0] ?? { total: 0, active: 0 }),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.status, 'pending'))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({
        amount: sql<number>`coalesce(sum(${subscriptions.amount}), 0)::int`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))
      .then((r) => r[0]?.amount ?? 0),

    db
      .select({
        received: sql<number>`coalesce(sum(${analytics.messagesReceived}), 0)::int`,
        replied: sql<number>`coalesce(sum(${analytics.messagesReplied}), 0)::int`,
      })
      .from(analytics)
      .where(gte(analytics.date, last24h))
      .then((r) => r[0] ?? { received: 0, replied: 0 }),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(bookings)
      .where(gte(bookings.createdAt, last24h))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'past_due'))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          isNotNull(clients.trialEndsAt),
          gte(clients.trialEndsAt, now),
          lte(clients.trialEndsAt, trialSoon),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.status, 'active'),
          isNotNull(clients.whatsappAccessToken),
          isNotNull(clients.metaTokenExpiresAt),
          lte(clients.metaTokenExpiresAt, tokenSoon),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(emailParseLog)
      .where(
        and(
          gte(emailParseLog.receivedAt, parserSince),
          inArray(emailParseLog.status, ['partial', 'failed', 'unmatched_client']),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(invoices)
      .where(inArray(invoices.verifactuStatus, ['pending', 'rejected', 'accepted_with_errors', 'error']))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.status, 'new'))
      .then((r) => r[0]?.c ?? 0),

    db
      .select({ c: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.date, now.toISOString().slice(0, 10)),
          inArray(bookings.status, ['confirmed', 'completed']),
        ),
      )
      .then((r) => r[0]?.c ?? 0),
  ]);

  // Leads con próxima acción vencida (o hoy) — alerta separada de "newLeads"
  // porque son cosas distintas: new = falta primer contacto; due = follow-up
  // ya programado que toca ejecutar.
  const leadsDueCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(isNotNull(leads.nextActionAt), lte(leads.nextActionAt, now)))
    .then((r) => r[0]?.c ?? 0);

  const mrrMonthlyCents = mrrAgg; // raw bruto — el normalizado vive en /billing
  const replyRate = msg24hAgg.received === 0 ? null : msg24hAgg.replied / msg24hAgg.received;

  // Alerts ordered by gravity. Empty alerts list = todo en verde.
  const alerts: Array<{
    tone: 'danger' | 'warning' | 'success';
    title: string;
    description: string;
    href: string;
    cta: string;
  }> = [];

  if (verifactuFailing > 0) {
    alerts.push({
      tone: 'danger',
      title: `${verifactuFailing} factura${verifactuFailing === 1 ? '' : 's'} fuera de la cadena AEAT`,
      description:
        'Cada factura sin aceptar es una sanción potencial. Compliance VeriFactu no admite retraso.',
      href: '/admin/verifactu',
      cta: 'Ver VeriFactu',
    });
  }
  if (pastDueCount > 0) {
    alerts.push({
      tone: 'danger',
      title: `${pastDueCount} cobro${pastDueCount === 1 ? '' : 's'} en past_due`,
      description: 'Stripe no consigue cobrar — contacta al barbero antes de que cancele Stripe la sub.',
      href: '/admin/billing',
      cta: 'Ver billing',
    });
  }
  if (tokensExpiringCount > 0) {
    alerts.push({
      tone: 'warning',
      title: `${tokensExpiringCount} token Meta caduca${tokensExpiringCount === 1 ? '' : 'n'} esta semana`,
      description: 'Rota el access token en Meta Business antes de que el bot deje de responder.',
      href: '/admin/bot',
      cta: 'Ver bot',
    });
  }
  if (trialsExpiringCount > 0) {
    alerts.push({
      tone: 'warning',
      title: `${trialsExpiringCount} trial${trialsExpiringCount === 1 ? '' : 's'} acaba${trialsExpiringCount === 1 ? '' : 'n'} en 7 días`,
      description: 'Comprueba que tienen tarjeta guardada — son ingresos a punto de entrar (o de irse).',
      href: '/admin/billing',
      cta: 'Ver billing',
    });
  }
  if (parserFailures24h > 0) {
    alerts.push({
      tone: 'warning',
      title: `${parserFailures24h} fallo${parserFailures24h === 1 ? '' : 's'} del parser en 24h`,
      description: 'Emails Booksy que no se han parseado bien. Cliente con doble-booking potencial.',
      href: '/admin/email-health',
      cta: 'Ver parser',
    });
  }
  if (onboardingCount > 0) {
    alerts.push({
      tone: 'warning',
      title: `${onboardingCount} cliente${onboardingCount === 1 ? '' : 's'} esperando onboarding`,
      description: 'Pagaron pero todavía no están operativos. Completar setup Meta + Booksy.',
      href: '/admin/onboarding',
      cta: 'Ver onboarding',
    });
  }
  if (leadsDueCount > 0) {
    alerts.push({
      tone: 'warning',
      title: `${leadsDueCount} lead${leadsDueCount === 1 ? '' : 's'} con acción pendiente`,
      description: 'Programaste un follow-up para hoy o antes — toca llamar / escribir.',
      href: '/admin/leads?status=due',
      cta: 'Ver pendientes',
    });
  }
  if (newLeadsCount > 0) {
    alerts.push({
      tone: 'success',
      title: `${newLeadsCount} lead${newLeadsCount === 1 ? '' : 's'} sin contactar`,
      description: 'Leads que entraron por la web o referral. Cuanto antes los contactes, mejor conversión.',
      href: '/admin/leads',
      cta: 'Ver leads',
    });
  }

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <PageHeader
        title="Inicio"
        subtitle={
          <span>
            Comando otracita —{' '}
            <span className="text-brand font-semibold">{activeClientsAgg.active}</span> activas de{' '}
            <span className="text-brand font-semibold">{activeClientsAgg.total}</span> registradas.
          </span>
        }
      />

      {/* Acción hoy */}
      <Section
        title="Acción hoy"
        description={alerts.length === 0 ? undefined : `${alerts.length} cosa${alerts.length === 1 ? '' : 's'} pidiendo atención.`}
      >
        {alerts.length === 0 ? (
          <AlertCard
            tone="success"
            title="Todo en orden."
            description="No hay alertas activas. Tokens al día, billing limpio, parser sano, cadena AEAT íntegra."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {alerts.map((a) => (
              <AlertCard key={a.title} {...a} />
            ))}
          </div>
        )}
      </Section>

      {/* KPIs */}
      <Section title="Métricas del negocio">
        <KpiGrid cols={4}>
          <KpiCard
            icon={<Users size={120} />}
            label="Clientes activos"
            value={activeClientsAgg.active.toLocaleString('es-ES')}
            sub={`${activeClientsAgg.total} totales`}
          />
          <KpiCard
            icon={<CreditCard size={120} />}
            label="MRR bruto"
            value={formatEur(mrrMonthlyCents)}
            tone="brand"
            sub="suscripciones activas"
          />
          <KpiCard
            icon={<MessageCircle size={120} />}
            label="Mensajes 24h"
            value={msg24hAgg.received.toLocaleString('es-ES')}
            sub={
              replyRate === null
                ? 'sin tráfico aún'
                : `reply rate ${(replyRate * 100).toFixed(0)}%`
            }
          />
          <KpiCard
            icon={<TrendingUp size={120} />}
            label="Reservas 24h"
            value={bookings24hCount.toLocaleString('es-ES')}
            sub={`${todayBookingsCount} hoy en calendario`}
          />
        </KpiGrid>
      </Section>

      {/* Shortcuts grandes */}
      <Section title="Ir a">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Shortcut
            href="/admin/clients"
            title="Clientes"
            description="Búsqueda + filtros, métricas por tenant, edición individual."
          />
          <Shortcut
            href="/admin/onboarding"
            title="Onboarding"
            description="Checklist de cada cliente pendiente. Activar cuando esté todo verde."
            badge={onboardingCount > 0 ? onboardingCount : undefined}
          />
          <Shortcut
            href="/admin/leads"
            title="Leads"
            description="Pipeline web + cold outreach. Nuevo lead, notas, próxima acción."
            badge={newLeadsCount + leadsDueCount > 0 ? newLeadsCount + leadsDueCount : undefined}
          />
          <Shortcut
            href="/admin/buscar"
            title="Buscar"
            description="Cross-entidad: teléfono, email, nº de factura, nombre…"
          />
          <Shortcut
            href="/admin/billing"
            title="Billing"
            description="MRR, trials por vencer, past_due, churn, Stripe Connect."
          />
          <Shortcut
            href="/admin/verifactu"
            title="VeriFactu"
            description="Compliance AEAT cross-tenant. Cadena, errores, eventos."
            badge={verifactuFailing > 0 ? verifactuFailing : undefined}
          />
          <Shortcut
            href="/admin/bot"
            title="Bot WhatsApp"
            description="Tokens Meta/SumUp, conversaciones stuck, volumen."
            badge={tokensExpiringCount > 0 ? tokensExpiringCount : undefined}
          />
          <Shortcut
            href="/admin/email-health"
            title="Parser Booksy"
            description="Tasa éxito, fallos recientes, reprocesar con LLM."
            badge={parserFailures24h > 0 ? parserFailures24h : undefined}
          />
          <Shortcut
            href="/admin/system"
            title="Infraestructura"
            description="Webhooks Stripe, push, sesiones móvil, tamaño de tablas."
          />
        </div>
      </Section>
    </div>
  );
}

function Shortcut({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand hover:bg-canvas"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-ink group-hover:text-brand transition-colors">
          {title}
        </h3>
        {badge && badge > 0 ? (
          <span className="inline-flex min-w-[1.5rem] h-6 items-center justify-center rounded-full bg-danger/10 border border-danger/30 px-2 text-xs font-bold text-danger">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : (
          <ArrowRight className="h-4 w-4 text-ink-3 group-hover:text-brand transition-colors" />
        )}
      </div>
      <p className="text-sm text-ink-2 leading-relaxed">{description}</p>
    </Link>
  );
}
