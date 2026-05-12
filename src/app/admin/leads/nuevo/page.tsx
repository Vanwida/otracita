export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ArrowLeft, Plus } from 'lucide-react';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { getAdminUser } from '@/lib/auth/require-admin';
import { logAdminAction } from '@/lib/admin/audit';

/**
 * Alta manual de un lead. Para cuando Alex contacta a una barbería por
 * Instagram, llamada en frío, evento, o cualquier canal off-form. La
 * diferencia con el endpoint público `/api/leads` es que aquí elegimos
 * fuente y podemos arrancar con notas e incluso programar la primera
 * acción al crear.
 */

const SOURCES = ['manual', 'whatsapp', 'referral', 'instagram', 'website', 'other'] as const;

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

async function createLead(formData: FormData) {
  'use server';
  const admin = await getAdminUser();
  if (!admin) redirect('/login');

  const name = strOrNull(formData.get('name'));
  const phone = strOrNull(formData.get('phone'));
  if (!name || !phone) return;

  const rawSource = strOrNull(formData.get('source')) ?? 'manual';
  const source = (SOURCES as readonly string[]).includes(rawSource) ? rawSource : 'manual';

  const businessName = strOrNull(formData.get('businessName'));
  const email = strOrNull(formData.get('email'));
  const message = strOrNull(formData.get('message'));
  const notes = strOrNull(formData.get('notes'));
  const nextActionRaw = strOrNull(formData.get('nextActionAt'));
  const nextActionAt = nextActionRaw ? new Date(nextActionRaw) : null;

  const [created] = await db
    .insert(leads)
    .values({
      name,
      phone,
      businessName,
      email,
      message,
      notes,
      source,
      nextActionAt,
      status: 'new',
    })
    .returning({ id: leads.id });

  await logAdminAction({
    adminEmail: admin.email,
    intent: 'lead_create_manual',
    targetType: 'lead',
    targetId: created?.id ?? null,
    summary: `Creó lead "${name}" (${source})`,
    metadata: { name, businessName, phone, email, source },
  });

  revalidatePath('/admin/leads');
  revalidatePath('/admin');
  redirect(created?.id ? `/admin/leads/${created.id}` : '/admin/leads');
}

export default async function NuevoLeadPage() {
  const admin = await getAdminUser();
  if (!admin) redirect('/login');

  return (
    <div className="p-8 md:p-12 max-w-3xl mx-auto relative z-10">
      <Link
        href="/admin/leads"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2 hover:text-brand mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Leads
      </Link>

      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-ink">
        Nuevo lead
      </h1>
      <p className="text-ink-2 mb-8">
        Alta manual desde llamada, Instagram, evento o cualquier canal off-form.
      </p>

      <form action={createLead} className="space-y-8">
        <Section title="Persona">
          <Grid>
            <Field label="Nombre de contacto" required>
              <input
                type="text"
                name="name"
                required
                className={INPUT_CLASS}
                placeholder="Reni"
                autoComplete="off"
              />
            </Field>
            <Field label="Negocio">
              <input
                type="text"
                name="businessName"
                className={INPUT_CLASS}
                placeholder="Barbería Tal"
                autoComplete="off"
              />
            </Field>
            <Field label="Teléfono" required hint="E.164 mejor (+34…), pero acepta cualquier formato.">
              <input
                type="tel"
                name="phone"
                required
                className={`${INPUT_CLASS} font-mono`}
                placeholder="+34 600 000 000"
                autoComplete="off"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                name="email"
                className={INPUT_CLASS}
                placeholder="reni@barberia.com"
                autoComplete="off"
              />
            </Field>
          </Grid>
        </Section>

        <Section title="Contexto">
          <Grid>
            <Field label="Fuente">
              <select name="source" defaultValue="manual" className={`${INPUT_CLASS} cursor-pointer`}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Próxima acción (opcional)" hint="Cuándo le vuelves a llamar / escribir.">
              <input type="datetime-local" name="nextActionAt" className={INPUT_CLASS} />
            </Field>
            <Field label="Mensaje / lo que pidió" wide hint="Texto original o lo que verbalmente expresó.">
              <textarea name="message" rows={3} className={`${INPUT_CLASS} resize-y py-3`} />
            </Field>
            <Field label="Notas iniciales" wide hint="Tu cuaderno privado. Ej: 'Cliente de Reni, trabaja con Booksy hace 2 años, quiere ver demo.'">
              <textarea name="notes" rows={4} className={`${INPUT_CLASS} resize-y py-3`} />
            </Field>
          </Grid>
        </Section>

        <div className="flex justify-end gap-3">
          <Link
            href="/admin/leads"
            className="rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-brand text-brand-ink px-5 py-3 text-sm font-bold uppercase tracking-wider transition-colors hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" />
            Crear lead
          </button>
        </div>
      </form>
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
  required,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'md:col-span-2 space-y-1.5' : 'space-y-1.5'}>
      <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-3">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}
