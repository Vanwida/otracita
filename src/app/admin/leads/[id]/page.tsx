export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ArrowLeft, Save, ArrowRightCircle, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { leads, clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import { logAdminAction, getRecentAdminActions } from '@/lib/admin/audit';
import { Badge, formatDateTime, type Tone } from '../../_components/AdminUI';

/**
 * Detalle de un lead. Tres áreas:
 *
 *  1. Form de edición — name, businessName, phone, email, status, source,
 *     notas y próxima acción. Save commit todo de golpe.
 *
 *  2. "Convertir a cliente" — crea un row en `clients` con tier='solo'
 *     y status='pending' (Solo es el plan gratuito; no necesita Stripe).
 *     Marca el lead como `converted`, linkea `convertedToClientId` y
 *     redirige al detalle del cliente recién creado.
 *
 *  3. Eliminar — para purgar spam. Confirma con el botón en sí (UI no
 *     muestra confirmación adicional; es un endpoint admin).
 */

const STATUSES = ['new', 'contacted', 'converted', 'lost'] as const;
const SOURCES = ['manual', 'website', 'whatsapp', 'referral', 'instagram', 'other'] as const;

const STATUS_TONE: Record<string, Tone> = {
  new: 'brand',
  contacted: 'gold',
  converted: 'success',
  lost: 'danger',
};

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function toDateTimeLocal(d: Date | null | undefined): string {
  if (!d) return '';
  // yyyy-MM-ddTHH:mm — formato esperado por input[type=datetime-local]
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) notFound();

  const linkedClient = lead.convertedToClientId
    ? (
        await db
          .select({ id: clients.id, businessName: clients.businessName, status: clients.status })
          .from(clients)
          .where(eq(clients.id, lead.convertedToClientId))
          .limit(1)
      )[0] ?? null
    : null;

  const history = await getRecentAdminActions({ targetType: 'lead', targetId: id, limit: 20 });

  async function handleAction(formData: FormData) {
    'use server';
    const admin = await getAdminUser();
    if (!admin) redirect('/login');

    const leadId = formData.get('leadId');
    if (typeof leadId !== 'string') return;
    const intent = String(formData.get('intent') ?? 'save');

    const [existing] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (!existing) return;

    const now = new Date();

    if (intent === 'delete') {
      await db.delete(leads).where(eq(leads.id, leadId));
      await logAdminAction({
        adminEmail: admin.email,
        intent: 'lead_delete',
        targetType: 'lead',
        targetId: leadId,
        summary: `Eliminó lead "${existing.name}"`,
      });
      revalidatePath('/admin/leads');
      revalidatePath('/admin');
      redirect('/admin/leads');
    }

    if (intent === 'convert_to_client') {
      // Si ya está convertido, no duplicamos.
      if (existing.convertedToClientId) {
        redirect(`/admin/clients/${existing.convertedToClientId}`);
      }

      // Validación mínima: necesitamos un email para crear cliente — Better Auth
      // y Stripe lo requieren. Si no hay, redirige al edit para pedirlo.
      if (!existing.email) {
        redirect(`/admin/leads/${leadId}?need=email`);
      }

      // Crear cliente en tier solo (gratis, sin Stripe) — Alex puede subirlo
      // luego desde el detalle del cliente.
      const [createdClient] = await db
        .insert(clients)
        .values({
          businessName: existing.businessName || existing.name,
          ownerName: existing.name,
          email: existing.email!,
          phone: existing.phone,
          status: 'pending',
          tier: 'solo',
          plan: 'chatbot',
        })
        .returning({ id: clients.id });

      await db
        .update(leads)
        .set({
          status: 'converted',
          convertedToClientId: createdClient.id,
          updatedAt: now,
        })
        .where(eq(leads.id, leadId));

      await logAdminAction({
        adminEmail: admin.email,
        intent: 'lead_convert_to_client',
        targetType: 'lead',
        targetId: leadId,
        summary: `Convirtió lead "${existing.name}" → cliente`,
        metadata: { clientId: createdClient.id },
      });
      await logAdminAction({
        adminEmail: admin.email,
        intent: 'client_create_from_lead',
        targetType: 'client',
        targetId: createdClient.id,
        summary: `Creó cliente desde lead (${existing.businessName || existing.name})`,
        metadata: { leadId },
      });

      revalidatePath('/admin/leads');
      revalidatePath('/admin/onboarding');
      revalidatePath('/admin');
      redirect(`/admin/clients/${createdClient.id}`);
    }

    // ── save (default) ──────────────────────────────────────────
    const name = strOrNull(formData.get('name')) ?? existing.name;
    const phone = strOrNull(formData.get('phone')) ?? existing.phone;
    const businessName = strOrNull(formData.get('businessName'));
    const email = strOrNull(formData.get('email'));
    const message = strOrNull(formData.get('message'));
    const notes = strOrNull(formData.get('notes'));
    const rawStatus = strOrNull(formData.get('status')) ?? existing.status;
    const status = (STATUSES as readonly string[]).includes(rawStatus ?? '') ? rawStatus : existing.status;
    const rawSource = strOrNull(formData.get('source')) ?? existing.source;
    const source = (SOURCES as readonly string[]).includes(rawSource ?? '') ? rawSource : existing.source;
    const nextRaw = strOrNull(formData.get('nextActionAt'));
    const nextActionAt = nextRaw ? new Date(nextRaw) : null;

    await db
      .update(leads)
      .set({
        name,
        phone,
        businessName,
        email,
        message,
        notes,
        status,
        source,
        nextActionAt,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId));

    await logAdminAction({
      adminEmail: admin.email,
      intent: 'lead_update',
      targetType: 'lead',
      targetId: leadId,
      summary: `Editó lead "${name}" (status=${status})`,
      metadata: {
        before: { status: existing.status, nextActionAt: existing.nextActionAt },
        after: { status, nextActionAt },
      },
    });

    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath('/admin/leads');
    revalidatePath('/admin');
  }

  const status = lead.status ?? 'new';

  return (
    <div className="p-8 md:p-12 max-w-4xl mx-auto relative z-10">
      <Link
        href="/admin/leads"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2 hover:text-brand mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Leads
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-ink">
            {lead.name}
          </h1>
          <p className="text-sm text-ink-3 font-mono">{lead.id}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
          <span className="text-[11px] text-ink-3 uppercase tracking-wider">
            fuente: {lead.source}
          </span>
        </div>
      </div>

      {linkedClient && (
        <div className="mb-6 rounded-2xl border border-success/30 bg-success/5 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-ink">
            Convertido a cliente:{' '}
            <span className="font-semibold">{linkedClient.businessName}</span> · status{' '}
            <span className="font-mono">{linkedClient.status}</span>
          </p>
          <Link
            href={`/admin/clients/${linkedClient.id}`}
            className="rounded-xl border border-success/40 bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-success transition-colors hover:bg-success/10"
          >
            Abrir cliente
          </Link>
        </div>
      )}

      <form action={handleAction} className="space-y-8">
        <input type="hidden" name="leadId" value={lead.id} />

        <Section title="Datos">
          <Grid>
            <Field label="Nombre">
              <input type="text" name="name" defaultValue={lead.name} className={INPUT_CLASS} />
            </Field>
            <Field label="Negocio">
              <input
                type="text"
                name="businessName"
                defaultValue={lead.businessName ?? ''}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="tel"
                name="phone"
                defaultValue={lead.phone}
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
            <Field label="Email" hint="Necesario para convertir a cliente.">
              <input type="email" name="email" defaultValue={lead.email ?? ''} className={INPUT_CLASS} />
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue={status}
                className={`${INPUT_CLASS} cursor-pointer font-semibold`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fuente">
              <select
                name="source"
                defaultValue={lead.source ?? 'manual'}
                className={`${INPUT_CLASS} cursor-pointer`}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Próxima acción" hint="Cuándo te toca volver a hablar con esta persona." wide>
              <input
                type="datetime-local"
                name="nextActionAt"
                defaultValue={toDateTimeLocal(lead.nextActionAt)}
                className={INPUT_CLASS}
              />
            </Field>
          </Grid>
        </Section>

        <Section title="Mensaje original">
          <textarea
            name="message"
            defaultValue={lead.message ?? ''}
            rows={3}
            className={`${INPUT_CLASS} resize-y py-3`}
            placeholder="Texto que envió el lead, o lo que dijo por teléfono."
          />
        </Section>

        <Section title="Notas (tu cuaderno)">
          <textarea
            name="notes"
            defaultValue={lead.notes ?? ''}
            rows={6}
            className={`${INPUT_CLASS} resize-y py-3`}
            placeholder="Lo que se ha hablado, objeciones, contexto, recordatorios."
          />
          <p className="text-[11px] text-ink-3 mt-2">
            Truco: prepende la fecha cada vez que añadas para tener un diario.
          </p>
        </Section>

        <div className="sticky bottom-4 flex justify-end gap-3">
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

        <section className="rounded-2xl border border-brand/30 bg-brand-softer/60 p-6 md:p-7">
          <h2 className="text-sm font-bold uppercase tracking-widest text-brand-strong mb-3">
            Convertir a cliente
          </h2>
          <p className="text-sm text-ink-2 mb-5">
            Crea un row en <code className="font-mono text-xs">clients</code> con los datos del lead
            (tier <span className="font-mono">solo</span>, status <span className="font-mono">pending</span>) y
            cierra el lead como <span className="font-mono">converted</span>. Necesita email.
          </p>
          {linkedClient ? (
            <p className="text-sm text-success">
              Ya está convertido →{' '}
              <Link href={`/admin/clients/${linkedClient.id}`} className="underline">
                {linkedClient.businessName}
              </Link>
            </p>
          ) : (
            <button
              type="submit"
              name="intent"
              value="convert_to_client"
              className="inline-flex items-center gap-2 rounded-xl bg-brand text-brand-ink px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-brand-strong"
            >
              <ArrowRightCircle className="h-4 w-4" />
              Convertir a cliente
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-danger/30 bg-danger/5 p-6 md:p-7">
          <h2 className="text-sm font-bold uppercase tracking-widest text-danger mb-3">
            Eliminar
          </h2>
          <p className="text-sm text-ink-2 mb-5">
            Borra la fila para siempre. Solo para spam — para descartar uno legítimo usa status{' '}
            <span className="font-mono">lost</span>.
          </p>
          <button
            type="submit"
            name="intent"
            value="delete"
            className="inline-flex items-center gap-2 rounded-xl bg-surface border border-danger/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar lead
          </button>
        </section>
      </form>

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-4">
            Historial sobre este lead
          </h2>
          <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
            {history.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between text-xs gap-4">
                <span className="text-ink-2 truncate">{h.summary}</span>
                <span className="text-ink-3 font-mono shrink-0">
                  {formatDateTime(h.createdAt)} · {h.adminEmail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 md:p-7">
      <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-5">{title}</h2>
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
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
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
