export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ArrowLeft, Save, ShieldCheck, MessageSquare } from 'lucide-react';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import { SecretInput } from './_components/SecretInput';
import { AutoGenerateBooksyEmail } from './_components/AutoGenerateBooksyEmail';

/**
 * Admin detail / edit page for a single client. This is where Alex actually
 * wires up Meta WhatsApp credentials, Booksy inbound email, and bumps the
 * onboarding timestamps. Form is split into four sections (identity,
 * WhatsApp, Booksy, notes); all fields live on the same form so "Guardar"
 * commits the whole row in one mutation.
 *
 * Side-buttons ("Verificar webhook", "Marcar test enviado") submit the same
 * form with a distinct `intent` value — the server action branches on it
 * before writing. That way the button you click updates ONLY the timestamp
 * the button describes, not whatever the user may have typed in other fields
 * without saving first. Saving the whole form uses intent='save'.
 */

const STATUS_OPTIONS = ['pending', 'onboarding', 'active', 'paused', 'cancelled'] as const;
type KnownStatus = (typeof STATUS_OPTIONS)[number];

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

  /**
   * Single server action handling the "save everything" case AND the two
   * single-timestamp bumps. Using one action keeps the code path obvious:
   * every mutation re-checks admin auth and re-validates the client id.
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

    const now = new Date();

    if (intent === 'verify_webhook') {
      await db
        .update(clients)
        .set({ metaWebhookVerifiedAt: now, updatedAt: now })
        .where(eq(clients.id, clientId));
    } else if (intent === 'mark_test_sent') {
      await db
        .update(clients)
        .set({ onboardingTestMessageSentAt: now, updatedAt: now })
        .where(eq(clients.id, clientId));
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
        updatedAt: now,
      };
      // Flipping to active should stamp onboardedAt the first time.
      if (safeStatus === 'active' && !existing.onboardedAt) {
        patch.onboardedAt = now;
      }

      await db.update(clients).set(patch).where(eq(clients.id, clientId));
    }

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin/onboarding');
    revalidatePath('/admin');
  }

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto relative z-10">
      {/* Back link */}
      <Link
        href="/admin/onboarding"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2 hover:text-brand mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Onboarding
      </Link>

      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-ink">
          {client.businessName}
        </h1>
        <p className="text-sm text-ink-3 font-mono">{client.id}</p>
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
            <Field label="Plan">
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
      </form>
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
