export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ArrowLeft, Plus } from 'lucide-react';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import { logAdminAction } from '@/lib/admin/audit';

/**
 * Alta manual de cliente. El path normal es Stripe checkout (pago → row
 * en `clients` con status='pending'). Esta página cubre los casos
 * excepcionales: partner, transferencia bancaria, cuenta de prueba para
 * un test, plan custom que pagaron por otro canal.
 *
 * Solo pide lo mínimo. Lo demás (WhatsApp, Booksy, fiscal, etc.) se
 * completa después en /admin/clients/[id].
 */

const TIERS = ['solo', 'pro', 'estudio'] as const;

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

async function createClient(formData: FormData) {
  'use server';
  const admin = await getAdminUser();
  if (!admin) redirect('/login');

  const businessName = strOrNull(formData.get('businessName'));
  const ownerName = strOrNull(formData.get('ownerName'));
  const email = strOrNull(formData.get('email'));
  const phone = strOrNull(formData.get('phone'));
  const rawTier = strOrNull(formData.get('tier')) ?? 'solo';
  const tier = (TIERS as readonly string[]).includes(rawTier) ? rawTier : 'solo';
  const city = strOrNull(formData.get('city'));
  const onboardingNotes = strOrNull(formData.get('onboardingNotes'));

  if (!businessName || !ownerName || !email || !phone) return;

  // Email único — Better Auth y la propia tabla lo exigen
  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.email, email))
    .limit(1);
  if (existing.length > 0) {
    // No duplicar — redirige al detalle del existente para que Alex no cree dos
    redirect(`/admin/clients/${existing[0].id}?dup=email`);
  }

  const [created] = await db
    .insert(clients)
    .values({
      businessName,
      ownerName,
      email,
      phone,
      city: city ?? 'Barcelona',
      tier,
      status: 'pending',
      plan: tier === 'solo' ? 'chatbot' : tier === 'pro' ? 'chatbot' : 'full',
      onboardingNotes,
    })
    .returning({ id: clients.id });

  await logAdminAction({
    adminEmail: admin.email,
    intent: 'client_create_manual',
    targetType: 'client',
    targetId: created.id,
    summary: `Creó cliente manual "${businessName}" (${tier})`,
    metadata: { businessName, ownerName, email, tier },
  });

  revalidatePath('/admin/clients');
  revalidatePath('/admin/onboarding');
  revalidatePath('/admin');
  redirect(`/admin/clients/${created.id}`);
}

export default async function NuevoClientePage() {
  const admin = await getAdminUser();
  if (!admin) redirect('/login');

  return (
    <div className="p-8 md:p-12 max-w-3xl mx-auto relative z-10">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2 hover:text-brand mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Clientes
      </Link>

      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-ink">
        Nuevo cliente
      </h1>
      <p className="text-ink-2 mb-8">
        Alta manual — para casos sin Stripe checkout (partner, transferencia, plan custom).
        El cliente entra como <span className="font-mono text-brand-strong">pending</span> y aparece en
        onboarding.
      </p>

      <form action={createClient} className="space-y-8">
        <Section title="Negocio">
          <Grid>
            <Field label="Nombre del negocio" required>
              <input type="text" name="businessName" required className={INPUT_CLASS} />
            </Field>
            <Field label="Dueño" required>
              <input type="text" name="ownerName" required className={INPUT_CLASS} />
            </Field>
            <Field label="Email" required hint="Será el login (Better Auth). Único.">
              <input type="email" name="email" required className={INPUT_CLASS} />
            </Field>
            <Field label="Teléfono" required>
              <input type="tel" name="phone" required className={`${INPUT_CLASS} font-mono`} />
            </Field>
            <Field label="Ciudad">
              <input type="text" name="city" defaultValue="Barcelona" className={INPUT_CLASS} />
            </Field>
            <Field label="Tier">
              <select name="tier" defaultValue="solo" className={`${INPUT_CLASS} cursor-pointer font-semibold`}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
          </Grid>
        </Section>

        <Section title="Notas iniciales">
          <textarea
            name="onboardingNotes"
            rows={5}
            className={`${INPUT_CLASS} resize-y py-3`}
            placeholder="Cómo entró, por qué tier, contacto interno, etc."
          />
        </Section>

        <div className="flex justify-end gap-3">
          <Link
            href="/admin/clients"
            className="rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-brand text-brand-ink px-5 py-3 text-sm font-bold uppercase tracking-wider transition-colors hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" />
            Crear cliente
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
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-3">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}
