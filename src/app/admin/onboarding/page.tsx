export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Check, X, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';

/**
 * Admin onboarding dashboard. This is Alex's operational checklist for every
 * new paying client. The barber pays on Stripe → a row lands in `clients` with
 * status='pending'. Nothing in the product actually works for that barber
 * until Alex (manually, in meta.com and in this UI) wires up the WhatsApp
 * plumbing. Each step of that wire-up has its own timestamp/boolean on the
 * `clients` row; this page renders those as a visible checklist so steps
 * can't silently slip.
 *
 * The admin /admin layout already gates access (@aistudios.pro / alex / ADMIN
 * role). We still re-check inside the server action below as defense-in-depth
 * since server actions are callable from anywhere a fetch can reach them.
 */

type ClientRow = typeof clients.$inferSelect;

const STATUS_FILTERS = ['pending', 'active', 'paused', 'cancelled', 'all'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return !!v && (STATUS_FILTERS as readonly string[]).includes(v);
}

interface ChecklistItem {
  label: string;
  state: 'done' | 'pending' | 'failed';
}

/**
 * Derive the onboarding checklist from a client row. Keep this pure so the
 * same logic works for the "Activar" gating (all steps green).
 */
function buildChecklist(c: ClientRow): ChecklistItem[] {
  const hasSetupWizard = Boolean(c.businessName) && c.chatbotServices !== null;
  return [
    { label: 'Pago recibido', state: 'done' },
    { label: 'Setup wizard completado', state: hasSetupWizard ? 'done' : 'pending' },
    { label: 'Meta: phoneNumberId asignado', state: c.whatsappPhoneNumberId ? 'done' : 'pending' },
    { label: 'Meta: access token asignado', state: c.whatsappAccessToken ? 'done' : 'pending' },
    { label: 'Meta: webhook verificado', state: c.metaWebhookVerifiedAt ? 'done' : 'pending' },
    { label: 'Booksy inbound email asignado', state: c.booksyInboundEmail ? 'done' : 'pending' },
    { label: 'Mensaje de test enviado', state: c.onboardingTestMessageSentAt ? 'done' : 'pending' },
    { label: 'Status ACTIVE', state: c.status === 'active' ? 'done' : 'pending' },
  ];
}

function allReadyExceptActivate(items: ChecklistItem[]): boolean {
  // All steps green except the last (Status ACTIVE).
  return items.slice(0, -1).every((i) => i.state === 'done');
}

function ChecklistIcon({ state }: { state: ChecklistItem['state'] }) {
  if (state === 'done') {
    return (
      <Check className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
    );
  }
  if (state === 'failed') {
    return <X className="h-3.5 w-3.5 text-rose-400" />;
  }
  return <Clock className="h-3.5 w-3.5 text-amber-400/70" />;
}

function StatusPill({ value, count: c }: { value: string; count: number }) {
  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-[#04040A] px-5 py-4 backdrop-blur-2xl">
      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/80">
        {value}
      </p>
      <p className="text-3xl font-black text-white drop-shadow-md">{c}</p>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filter: StatusFilter = isStatusFilter(sp.status) ? sp.status : 'pending';

  // Stats: count per status. Drizzle select groupBy would work too, but small
  // dataset + clear intent = five tiny queries is fine.
  const [pendingC, activeC, pausedC, cancelledC, totalC] = await Promise.all([
    db.select({ c: count() }).from(clients).where(eq(clients.status, 'pending')),
    db.select({ c: count() }).from(clients).where(eq(clients.status, 'active')),
    db.select({ c: count() }).from(clients).where(eq(clients.status, 'paused')),
    db.select({ c: count() }).from(clients).where(eq(clients.status, 'cancelled')),
    db.select({ c: count() }).from(clients),
  ]);

  const stats = {
    pending: pendingC[0]?.c ?? 0,
    active: activeC[0]?.c ?? 0,
    paused: pausedC[0]?.c ?? 0,
    cancelled: cancelledC[0]?.c ?? 0,
    all: totalC[0]?.c ?? 0,
  };

  const rows: ClientRow[] =
    filter === 'all'
      ? await db.select().from(clients).orderBy(desc(clients.createdAt))
      : await db.select().from(clients).where(eq(clients.status, filter)).orderBy(desc(clients.createdAt));

  /**
   * Flip a client to `status = 'active'`. Only exposed when the checklist is
   * fully green — but we re-check server-side because the client could have
   * crafted a POST that bypasses the button rendering guard.
   */
  async function activateClient(formData: FormData) {
    'use server';
    const admin = await getAdminUser();
    if (!admin) redirect('/login');

    const clientId = formData.get('clientId') as string | null;
    if (!clientId) return;

    const [target] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!target) return;

    const items = buildChecklist(target);
    if (!allReadyExceptActivate(items)) {
      // Refuse — UI shouldn't have shown the button, but defend anyway.
      return;
    }

    await db
      .update(clients)
      .set({ status: 'active', onboardedAt: new Date(), updatedAt: new Date() })
      .where(eq(clients.id, clientId));

    revalidatePath('/admin/onboarding');
    revalidatePath('/admin');
  }

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-indigo-300 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">
          Onboarding de clientes
        </h1>
        <p className="text-indigo-200/70 text-lg font-medium tracking-wide">
          Checklist visual por cliente. Cada paso es una{' '}
          <span className="text-cyan-400 font-semibold drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
            acción manual
          </span>{' '}
          que se olvida fácil.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <StatusPill value="Pending" count={stats.pending} />
        <StatusPill value="Active" count={stats.active} />
        <StatusPill value="Paused" count={stats.paused} />
        <StatusPill value="Cancelled" count={stats.cancelled} />
        <StatusPill value="Total" count={stats.all} />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {STATUS_FILTERS.map((s) => {
          const active = s === filter;
          return (
            <Link
              key={s}
              href={`/admin/onboarding?status=${s}`}
              className={`rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                active
                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.25)]'
                  : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300/80 hover:bg-indigo-500/10 hover:border-indigo-500/40'
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      {/* Cards list */}
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-indigo-500/15 bg-[#05050A]/80 p-12 text-center text-indigo-200/50">
          Sin clientes con status <span className="font-mono text-cyan-300">{filter}</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {rows.map((client) => {
            const items = buildChecklist(client);
            const canActivate =
              client.status !== 'active' && allReadyExceptActivate(items);
            return (
              <div
                key={client.id}
                className="group relative rounded-3xl border border-indigo-500/20 bg-[#05050A]/85 backdrop-blur-2xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.6)] hover:border-indigo-400/40 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)] transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white truncate drop-shadow-md">
                      {client.businessName}
                    </h3>
                    <p className="text-xs text-indigo-200/60 truncate">{client.email}</p>
                    <p className="text-xs text-indigo-300/40 font-mono mt-1">
                      {client.phone || 'sin teléfono'} ·{' '}
                      {client.createdAt
                        ? new Date(client.createdAt).toLocaleDateString('es-ES')
                        : '-'}
                    </p>
                  </div>
                  <StatusChip status={client.status} />
                </div>

                {/* Checklist */}
                <ul className="space-y-1.5 mb-5">
                  {items.map((it, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2.5 text-xs text-indigo-100/80"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/5 border border-indigo-500/20 shrink-0">
                        <ChecklistIcon state={it.state} />
                      </span>
                      <span
                        className={
                          it.state === 'done'
                            ? 'text-indigo-100'
                            : 'text-indigo-200/60'
                        }
                      >
                        {it.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-indigo-500/10">
                  {canActivate && (
                    <form action={activateClient}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400/60 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Activar
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-indigo-200 hover:bg-indigo-500/20 hover:border-cyan-500/40 hover:text-cyan-200 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all"
                  >
                    Editar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
    pending: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
    onboarding: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300',
    paused: 'bg-orange-500/10 border-orange-500/40 text-orange-300',
    cancelled: 'bg-rose-500/10 border-rose-500/40 text-rose-300',
  };
  const cls = styles[status] ?? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300';
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${cls}`}
    >
      {status}
    </span>
  );
}
