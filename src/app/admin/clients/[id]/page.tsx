export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  ArrowLeft,
  Save,
  ShieldCheck,
  MessageSquare,
  CreditCard,
  Calendar,
  Smartphone,
  ShoppingBag,
  AlertTriangle,
} from 'lucide-react';
import { db } from '@/db';
import {
  clients,
  subscriptions,
  bookings,
  customers,
  invoices,
  ratings,
  payments,
} from '@/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import { SecretInput } from './_components/SecretInput';
import { AutoGenerateBooksyEmail } from './_components/AutoGenerateBooksyEmail';
import { logAdminAction, getRecentAdminActions } from '@/lib/admin/audit';
import {
  Badge,
  formatEur,
  formatDateTime as formatDateTimeUI,
  type Tone,
} from '../../_components/AdminUI';

/**
 * Admin detail / edit page for a single client. This is the full 360º view:
 *   · Identity + status + onboarding meta
 *   · WhatsApp Business credentials (the part Alex actually wires up)
 *   · Booksy inbound email
 *   · Notes
 *
 * Plus read-only context panels for situational awareness:
 *   · Billing (tier, sub, trial)
 *   · Integraciones (Stripe Connect, SumUp, Google Cal, public page)
 *   · Stats (bookings 30d, customers, facturado, rating)
 *
 * And a Danger zone with reversible operational actions:
 *   · Extender trial +7d
 *   · Pausar / Reanudar
 *
 * Side-buttons ("Verificar webhook", "Marcar test enviado", danger-zone
 * actions) submit the same form with a distinct `intent` value so each
 * button only mutates the field it advertises — never the rest of the form.
 */

const STATUS_OPTIONS = ['pending', 'onboarding', 'active', 'paused', 'cancelled'] as const;
type KnownStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_TONE: Record<string, Tone> = {
  active: 'success',
  pending: 'warning',
  onboarding: 'brand',
  paused: 'neutral',
  cancelled: 'danger',
};

function formatDateTime(d: Date | null): string {
  if (!d) return 'nunca';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  // yyyy-mm-dd in UTC — matches <input type="date"> semantics.
  return d.toISOString().slice(0, 10);
}

/** Normalise a submitted trim-or-empty string to either a trimmed string or null. */
function strOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Shared input styling — kept here so every field across the form looks
 * identical without repeating the same long className blob. Used for text,
 * date, email, and select inputs.
 */
const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) notFound();

  // ─── Context queries (read-only) ─────────────────────────────────
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeSub,
    bookings30dAgg,
    customersAgg,
    invoicesAgg,
    ratingsAgg,
    paymentsAgg,
  ] = await Promise.all([
    db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.clientId, id), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
        noShow: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')::int`,
      })
      .from(bookings)
      .where(and(eq(bookings.clientId, id), gte(bookings.createdAt, last30Days)))
      .then((r) => r[0] ?? { total: 0, completed: 0, noShow: 0 }),

    db
      .select({
        total: sql<number>`count(*)::int`,
        blocked: sql<number>`count(*) filter (where ${customers.reputation} = 'blocked')::int`,
      })
      .from(customers)
      .where(eq(customers.clientId, id))
      .then((r) => r[0] ?? { total: 0, blocked: 0 }),

    db
      .select({
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
      })
      .from(invoices)
      .where(and(eq(invoices.clientId, id), eq(invoices.status, 'issued')))
      .then((r) => r[0] ?? { count: 0, totalCents: 0 }),

    db
      .select({
        count: sql<number>`count(*)::int`,
        avg: sql<number>`coalesce(avg(${ratings.rating}), 0)::float`,
      })
      .from(ratings)
      .where(eq(ratings.clientId, id))
      .then((r) => r[0] ?? { count: 0, avg: 0 }),

    db
      .select({
        succeeded: sql<number>`count(*) filter (where ${payments.status} = 'succeeded')::int`,
        succeededCents: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'succeeded'), 0)::int`,
      })
      .from(payments)
      .where(eq(payments.clientId, id))
      .then((r) => r[0] ?? { succeeded: 0, succeededCents: 0 }),
  ]);

  /**
   * Single server action handling the "save everything" case, the two
   * single-timestamp bumps, and the danger-zone actions. One action keeps
   * the code path obvious: every mutation re-checks admin auth and re-validates
   * the client id.
   */
  async function handleClientAction(formData: FormData) {
    'use server';
    const admin = await getAdminUser();
    if (!admin) redirect('/login');

    const clientId = formData.get('clientId');
    if (typeof clientId !== 'string' || clientId.length === 0) return;
    const intent = String(formData.get('intent') ?? 'save');

    // Always re-fetch to avoid writing stale status etc.
    const [existing] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!existing) return;

    const actionNow = new Date();

    if (intent === 'verify_webhook') {
      await db
        .update(clients)
        .set({ metaWebhookVerifiedAt: actionNow, updatedAt: actionNow })
        .where(eq(clients.id, clientId));
      await logAdminAction({
        adminEmail: admin.email,
        intent,
        targetType: 'client',
        targetId: clientId,
        summary: `Verificó webhook Meta de "${existing.businessName}"`,
      });
    } else if (intent === 'mark_test_sent') {
      await db
        .update(clients)
        .set({ onboardingTestMessageSentAt: actionNow, updatedAt: actionNow })
        .where(eq(clients.id, clientId));
      await logAdminAction({
        adminEmail: admin.email,
        intent,
        targetType: 'client',
        targetId: clientId,
        summary: `Marcó test enviado de "${existing.businessName}"`,
      });
    } else if (intent === 'extend_trial_7d') {
      // Bump trialEndsAt by 7 days. If already past, extend from now instead.
      const base = existing.trialEndsAt && existing.trialEndsAt > actionNow ? existing.trialEndsAt : actionNow;
      const extended = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
      await db
        .update(clients)
        .set({ trialEndsAt: extended, updatedAt: actionNow })
        .where(eq(clients.id, clientId));
      await logAdminAction({
        adminEmail: admin.email,
        intent,
        targetType: 'client',
        targetId: clientId,
        summary: `Extendió trial +7d de "${existing.businessName}"`,
        metadata: { from: existing.trialEndsAt, to: extended },
      });
    } else if (intent === 'pause_client') {
      if (existing.status !== 'cancelled') {
        await db
          .update(clients)
          .set({ status: 'paused', updatedAt: actionNow })
          .where(eq(clients.id, clientId));
        await logAdminAction({
          adminEmail: admin.email,
          intent,
          targetType: 'client',
          targetId: clientId,
          summary: `Pausó cliente "${existing.businessName}"`,
        });
      }
    } else if (intent === 'resume_client') {
      if (existing.status === 'paused') {
        await db
          .update(clients)
          .set({ status: 'active', updatedAt: actionNow })
          .where(eq(clients.id, clientId));
        await logAdminAction({
          adminEmail: admin.email,
          intent,
          targetType: 'client',
          targetId: clientId,
          summary: `Reanudó cliente "${existing.businessName}"`,
        });
      }
    } else {
      // Full form save. Only fields the admin can edit in this UI — never
      // touch payment/stripe/calendar fields from this form.
      const status = String(formData.get('status') ?? existing.status);
      const safeStatus: string = (STATUS_OPTIONS as readonly string[]).includes(status)
        ? status
        : existing.status;

      const tokenExpiresRaw = strOrNull(formData.get('metaTokenExpiresAt'));
      const metaTokenExpiresAt = tokenExpiresRaw ? new Date(tokenExpiresRaw) : null;

      const patch: Partial<typeof clients.$inferInsert> = {
        status: safeStatus,
        whatsappPhoneNumberId: strOrNull(formData.get('whatsappPhoneNumberId')),
        whatsappAccessToken: strOrNull(formData.get('whatsappAccessToken')),
        metaTokenExpiresAt,
        booksyInboundEmail: strOrNull(formData.get('booksyInboundEmail')),
        onboardingNotes: strOrNull(formData.get('onboardingNotes')),
        updatedAt: actionNow,
      };
      // Flipping to active should stamp onboardedAt the first time.
      if (safeStatus === 'active' && !existing.onboardedAt) {
        patch.onboardedAt = actionNow;
      }

      await db.update(clients).set(patch).where(eq(clients.id, clientId));
      const statusChanged = existing.status !== safeStatus;
      await logAdminAction({
        adminEmail: admin.email,
        intent: 'client_save',
        targetType: 'client',
        targetId: clientId,
        summary: statusChanged
          ? `Guardó "${existing.businessName}" (status ${existing.status} → ${safeStatus})`
          : `Guardó "${existing.businessName}"`,
        metadata: statusChanged ? { from: existing.status, to: safeStatus } : undefined,
      });
    }

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin/onboarding');
    revalidatePath('/admin');
    revalidatePath('/admin/billing');
  }

  // Audit history for this specific client (most recent first)
  const clientHistory = await getRecentAdminActions({
    targetType: 'client',
    targetId: id,
    limit: 20,
  });

  // ─── Integration health booleans ─────────────────────────────────
  const hasBot = Boolean(client.whatsappAccessToken && client.whatsappPhoneNumberId);
  const hasStripeConnect = client.stripeConnectStatus === 'active';
  const hasSumup = Boolean(client.sumupAccessToken);
  const hasCalendar = Boolean(client.googleCalendarConnected);
  const hasPublic = Boolean(client.publicSlug && client.publicEnabled);
  const hasInvoicing = Boolean(client.invoicingEnabled && client.fiscalNif);

  const inTrial = Boolean(client.trialEndsAt && client.trialEndsAt > now);
  const trialDaysLeft =
    client.trialEndsAt && inTrial
      ? Math.ceil((client.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto relative z-10">
      {/* Back link */}
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2 hover:text-brand mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Clientes
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-ink">
            {client.businessName}
          </h1>
          <p className="text-sm text-ink-3 font-mono">{client.id}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <Badge tone={STATUS_TONE[client.status] ?? 'neutral'}>{client.status}</Badge>
          <span className="text-[11px] text-ink-3 font-mono uppercase tracking-wider">
            {client.tier} · {client.billingInterval ?? 'sin sub'}
          </span>
        </div>
      </div>

      {/* ─── Resumen 360º (read-only) ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <HealthPill icon={MessageSquare} label="Bot WA" ok={hasBot} />
        <HealthPill icon={CreditCard} label="Stripe Connect" ok={hasStripeConnect} />
        <HealthPill icon={Smartphone} label="SumUp" ok={hasSumup} />
        <HealthPill icon={Calendar} label="Google Cal" ok={hasCalendar} />
        <HealthPill icon={ShoppingBag} label="Página pública" ok={hasPublic} />
        <HealthPill icon={ShieldCheck} label="Facturación" ok={hasInvoicing} />
      </div>

      <form action={handleClientAction} className="space-y-8">
        <input type="hidden" name="clientId" value={client.id} />

        {/* ─── Identidad ─── */}
        <Section title="Identidad">
          <Grid>
            <Field label="Negocio" hint="Editable por el cliente en su dashboard.">
              <ReadOnly value={client.businessName} />
            </Field>
            <Field label="Dueño" hint="Editable por el cliente.">
              <ReadOnly value={client.ownerName} />
            </Field>
            <Field label="Email">
              <ReadOnly value={client.email} />
            </Field>
            <Field label="Teléfono">
              <ReadOnly value={client.phone || '-'} />
            </Field>
            <Field label="Stripe customer ID">
              <ReadOnly value={client.stripeCustomerId || '-'} mono />
            </Field>
            <Field label="Plan (legacy)">
              <ReadOnly value={client.plan} mono />
            </Field>
            <Field label="Status" hint="Cambiar con cuidado — afecta billing.">
              <select
                name="status"
                defaultValue={client.status}
                className={`${INPUT_CLASS} cursor-pointer font-semibold`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
                {/* If the DB has an unknown status, render it as a disabled option so it survives a save. */}
                {!(STATUS_OPTIONS as readonly string[]).includes(client.status as KnownStatus) && (
                  <option value={client.status}>{client.status.toUpperCase()} (actual)</option>
                )}
              </select>
            </Field>
            <Field label="Onboarded at">
              <ReadOnly value={formatDateTime(client.onboardedAt)} />
            </Field>
          </Grid>
        </Section>

        {/* ─── Plan & Billing (read-only) ─── */}
        <Section title="Plan & Billing">
          <Grid>
            <Field label="Tier">
              <ReadOnly value={client.tier} />
            </Field>
            <Field label="Intervalo">
              <ReadOnly value={client.billingInterval ?? 'sin sub'} />
            </Field>
            <Field label="Trial empieza">
              <ReadOnly value={formatDateTime(client.trialStartedAt)} />
            </Field>
            <Field label="Trial acaba" hint={inTrial ? `Quedan ${trialDaysLeft} día${trialDaysLeft === 1 ? '' : 's'}.` : 'Sin trial activo.'}>
              <ReadOnly value={formatDateTime(client.trialEndsAt)} />
            </Field>
            <Field label="Stripe subscription">
              <ReadOnly value={client.stripeSubscriptionId || '—'} mono />
            </Field>
            <Field label="Importe sub activa">
              <ReadOnly
                value={
                  activeSub
                    ? `${formatEur(activeSub.amount)} / ${activeSub.billingInterval ?? 'periodo'}`
                    : '—'
                }
              />
            </Field>
          </Grid>
        </Section>

        {/* ─── WhatsApp Business ─── */}
        <Section title="WhatsApp Business (Meta Cloud API)">
          <Grid>
            <Field
              label="Phone Number ID"
              hint="Meta Business → WhatsApp → API → Phone number ID."
            >
              <input
                type="text"
                name="whatsappPhoneNumberId"
                defaultValue={client.whatsappPhoneNumberId ?? ''}
                placeholder="123456789012345"
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
            <Field
              label="Token caduca el"
              hint="Meta tokens rotan — alerta con antelación."
            >
              <input
                type="date"
                name="metaTokenExpiresAt"
                defaultValue={toDateInputValue(client.metaTokenExpiresAt)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field
              label="Access Token"
              hint="Sensible. Se almacena en texto plano en DB — rotar si se fuga."
              wide
            >
              <SecretInput
                name="whatsappAccessToken"
                defaultValue={client.whatsappAccessToken ?? ''}
                placeholder="EAAx..."
              />
            </Field>
          </Grid>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              name="intent"
              value="verify_webhook"
              className="inline-flex items-center gap-2 rounded-xl bg-success/10 border border-success/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-success transition-colors hover:bg-success/20 hover:border-success/50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Verificar webhook
            </button>
            <span className="text-[11px] text-ink-3">
              Verificado: {formatDateTime(client.metaWebhookVerifiedAt)}
            </span>

            <span className="mx-2 text-ink-3">·</span>

            <button
              type="submit"
              name="intent"
              value="mark_test_sent"
              className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:border-brand hover:text-brand"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Marcar test enviado
            </button>
            <span className="text-[11px] text-ink-3">
              Test enviado: {formatDateTime(client.onboardingTestMessageSentAt)}
            </span>
          </div>
        </Section>

        {/* ─── Booksy sync ─── */}
        <Section title="Booksy sync">
          <Grid>
            <Field
              label="Inbound email"
              hint="Dirección única de forwarding. El cliente configura su Gmail para reenviar aquí."
              wide
            >
              <div className="flex gap-2">
                <input
                  id="booksyInboundEmail"
                  type="email"
                  name="booksyInboundEmail"
                  defaultValue={client.booksyInboundEmail ?? ''}
                  placeholder="sync-xxxxxxxx@inbound.otracita.es"
                  autoComplete="off"
                  spellCheck={false}
                  className={`flex-1 ${INPUT_CLASS} font-mono`}
                />
                <AutoGenerateBooksyEmail clientId={client.id} inputId="booksyInboundEmail" />
              </div>
            </Field>
          </Grid>
        </Section>

        {/* ─── Integraciones (read-only) ─── */}
        <Section title="Integraciones">
          <Grid>
            <Field label="Stripe Connect status">
              <ReadOnly value={client.stripeConnectStatus} />
            </Field>
            <Field label="Stripe Connect account">
              <ReadOnly value={client.stripeConnectAccountId || '—'} mono />
            </Field>
            <Field label="SumUp merchant">
              <ReadOnly value={client.sumupMerchantCode || '—'} mono />
            </Field>
            <Field label="SumUp reader">
              <ReadOnly value={client.sumupReaderName || '—'} />
            </Field>
            <Field label="Google Calendar ID">
              <ReadOnly value={client.googleCalendarId || '—'} mono />
            </Field>
            <Field label="Google Cal conectado">
              <ReadOnly value={client.googleCalendarConnected ? 'sí' : 'no'} />
            </Field>
            <Field label="Slug público">
              <ReadOnly value={client.publicSlug || '—'} mono />
            </Field>
            <Field label="Página pública activa">
              <ReadOnly value={client.publicEnabled ? 'sí' : 'no'} />
            </Field>
          </Grid>
          {hasPublic && (
            <p className="mt-3 text-xs text-ink-3">
              URL pública:{' '}
              <a
                href={`/b/${client.publicSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                /b/{client.publicSlug}
              </a>
            </p>
          )}
        </Section>

        {/* ─── Stats (read-only) ─── */}
        <Section title="Stats (últimos 30 días salvo indicado)">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat
              label="Reservas 30d"
              value={bookings30dAgg.total}
              sub={`${bookings30dAgg.completed} completadas · ${bookings30dAgg.noShow} no-show`}
            />
            <Stat
              label="Customers totales"
              value={customersAgg.total}
              sub={customersAgg.blocked > 0 ? `${customersAgg.blocked} bloqueados` : 'reputación limpia'}
              tone={customersAgg.blocked > 0 ? 'warning' : 'neutral'}
            />
            <Stat
              label="Facturas emitidas"
              value={invoicesAgg.count}
              sub={formatEur(invoicesAgg.totalCents)}
            />
            <Stat
              label="Cobros online OK"
              value={paymentsAgg.succeeded}
              sub={formatEur(paymentsAgg.succeededCents)}
            />
            <Stat
              label="Ratings"
              value={ratingsAgg.count}
              sub={ratingsAgg.count > 0 ? `media ${ratingsAgg.avg.toFixed(2)} ⭐` : 'sin valorar'}
            />
            <Stat
              label="Bot tono"
              value={client.botTone}
              sub={client.botName ? `nombre: ${client.botName}` : 'sin nombre'}
            />
          </div>
        </Section>

        {/* ─── Notas ─── */}
        <Section title="Notas de onboarding">
          <textarea
            name="onboardingNotes"
            defaultValue={client.onboardingNotes ?? ''}
            rows={6}
            placeholder="Qué pediste al cliente, problemas al configurar Meta, recordatorios, etc."
            className={`${INPUT_CLASS} resize-y py-3`}
          />
        </Section>

        {/* Save */}
        <div className="sticky bottom-4 flex justify-end">
          <button
            type="submit"
            name="intent"
            value="save"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand text-brand-ink px-6 py-3 text-sm font-bold uppercase tracking-widest transition-colors hover:bg-brand-strong shadow-md"
          >
            <Save className="h-4 w-4" />
            Guardar
          </button>
        </div>

        {/* ─── Danger zone ─── */}
        <section className="rounded-2xl border border-danger/30 bg-danger/5 p-6 md:p-7">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-danger">
              Zona delicada
            </h2>
          </div>
          <p className="text-sm text-ink-2 mb-5">
            Acciones reversibles pero con efecto inmediato en facturación o acceso del cliente.
            Confirma con el barbero antes de tocarlas.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="intent"
              value="extend_trial_7d"
              className="inline-flex items-center gap-2 rounded-xl bg-surface border border-warning/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-warning transition-colors hover:bg-warning/10"
            >
              + 7 días al trial
            </button>
            {client.status !== 'paused' && client.status !== 'cancelled' && (
              <button
                type="submit"
                name="intent"
                value="pause_client"
                className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line-strong px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-2 transition-colors hover:border-warning hover:text-warning"
              >
                Pausar cliente
              </button>
            )}
            {client.status === 'paused' && (
              <button
                type="submit"
                name="intent"
                value="resume_client"
                className="inline-flex items-center gap-2 rounded-xl bg-success/10 border border-success/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-success transition-colors hover:bg-success/20"
              >
                Reanudar cliente
              </button>
            )}
          </div>
        </section>
      </form>

      {clientHistory.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-4">
            Historial admin sobre este cliente
          </h2>
          <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
            {clientHistory.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between text-xs gap-4">
                <span className="text-ink-2 truncate">{h.summary}</span>
                <span className="text-ink-3 font-mono shrink-0">
                  {formatDateTimeUI(h.createdAt)} · {h.adminEmail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── tiny local layout primitives ─────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 md:p-7">
      <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-5">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'md:col-span-2 space-y-1.5' : 'space-y-1.5'}>
      <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-3">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

function ReadOnly({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div
      className={`w-full rounded-xl border border-line bg-overlay px-4 py-2.5 text-sm text-ink-2 ${
        mono ? 'font-mono' : ''
      }`}
    >
      {value || '-'}
    </div>
  );
}

function HealthPill({
  icon: Icon,
  label,
  ok,
}: {
  icon: typeof MessageSquare;
  label: string;
  ok: boolean;
}) {
  const styles = ok
    ? 'border-success/30 bg-success/5 text-success'
    : 'border-line bg-overlay/40 text-ink-3';
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${styles}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-wider truncate">
        {label}
      </span>
      <span className="ml-auto text-[10px] font-mono">{ok ? 'OK' : 'NO'}</span>
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
  const color = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    brand: 'text-brand',
    gold: 'text-[var(--color-brand-strong)]',
    info: 'text-ink-2',
    neutral: 'text-ink',
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-overlay/30 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-3">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-3 mt-1">{sub}</p>}
    </div>
  );
}
