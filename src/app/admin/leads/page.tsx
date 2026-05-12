export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { and, desc, eq, or, ilike, sql, lte, isNotNull } from 'drizzle-orm';
import {
  FileText,
  Phone,
  Mail,
  Search,
  Plus,
  StickyNote,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { getAdminUser } from '@/lib/auth/require-admin';
import { logAdminAction } from '@/lib/admin/audit';
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

const STATUSES = ['all', 'new', 'contacted', 'converted', 'lost', 'due'] as const;
type StatusFilter = (typeof STATUSES)[number];

const SOURCES = ['all', 'manual', 'website', 'whatsapp', 'referral', 'instagram', 'other'] as const;
type SourceFilter = (typeof SOURCES)[number];

const STATUS_OPTIONS = ['new', 'contacted', 'converted', 'lost'] as const;

const STATUS_TONE: Record<string, Tone> = {
  new: 'brand',
  contacted: 'gold',
  converted: 'success',
  lost: 'danger',
};

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return !!v && (STATUSES as readonly string[]).includes(v);
}

function isSourceFilter(v: string | undefined): v is SourceFilter {
  return !!v && (SOURCES as readonly string[]).includes(v);
}

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; source?: string }>;
}

export default async function AdminLeadsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const statusFilter: StatusFilter = isStatusFilter(sp.status) ? sp.status : 'all';
  const sourceFilter: SourceFilter = isSourceFilter(sp.source) ? sp.source : 'all';
  const now = new Date();

  const conditions = [];
  if (q) {
    conditions.push(
      or(
        ilike(leads.name, `%${q}%`),
        ilike(leads.businessName, `%${q}%`),
        ilike(leads.email, `%${q}%`),
        ilike(leads.phone, `%${q}%`),
        ilike(leads.notes, `%${q}%`),
      ),
    );
  }
  if (statusFilter === 'due') {
    // Filtro especial: leads con próxima acción vencida o hoy
    conditions.push(and(isNotNull(leads.nextActionAt), lte(leads.nextActionAt, now)));
  } else if (statusFilter !== 'all') {
    conditions.push(eq(leads.status, statusFilter));
  }
  if (sourceFilter !== 'all') conditions.push(eq(leads.source, sourceFilter));

  const [rows, countsByStatus, dueCountRow] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(500),
    db
      .select({ status: leads.status, c: sql<number>`count(*)::int` })
      .from(leads)
      .groupBy(leads.status),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(isNotNull(leads.nextActionAt), lte(leads.nextActionAt, now)))
      .then((r) => r[0]?.c ?? 0),
  ]);

  const counts: Record<string, number> = {};
  for (const r of countsByStatus) counts[r.status ?? 'new'] = r.c;
  const total = Object.values(counts).reduce((acc, v) => acc + v, 0);

  async function setStatus(formData: FormData) {
    'use server';
    const admin = await getAdminUser();
    if (!admin) redirect('/login');

    const leadId = formData.get('leadId');
    const newStatus = formData.get('newStatus');
    if (typeof leadId !== 'string' || typeof newStatus !== 'string') return;
    if (!(STATUS_OPTIONS as readonly string[]).includes(newStatus)) return;

    const [existing] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (!existing || existing.status === newStatus) return;

    await db
      .update(leads)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    await logAdminAction({
      adminEmail: admin.email,
      intent: 'lead_set_status',
      targetType: 'lead',
      targetId: leadId,
      summary: `Lead "${existing.name}": ${existing.status} → ${newStatus}`,
    });

    revalidatePath('/admin/leads');
    revalidatePath('/admin');
  }

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <PageHeader
        title="Leads"
        subtitle={
          <span>
            <span className="text-brand font-semibold">{total}</span> leads totales — pipeline desde web,
            cold outreach y referrals.
          </span>
        }
        actions={
          <Link
            href="/admin/leads/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-brand text-brand-ink px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" />
            Nuevo lead
          </Link>
        }
      />

      <KpiGrid cols={4}>
        <KpiCard label="Nuevos" value={counts.new ?? 0} tone="brand" sub="sin contactar todavía" />
        <KpiCard label="Contactados" value={counts.contacted ?? 0} tone="gold" sub="esperando respuesta" />
        <KpiCard label="Convertidos" value={counts.converted ?? 0} tone="success" sub="pagaron / cuenta creada" />
        <KpiCard
          label="Acción pendiente"
          value={dueCountRow}
          tone={dueCountRow > 0 ? 'danger' : 'success'}
          sub="próxima acción vencida o hoy"
        />
      </KpiGrid>

      <form method="get" className="mb-8 flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar nombre, negocio, email, teléfono, notas…"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-line text-ink placeholder:text-ink-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-sm transition-colors"
          />
        </div>
        <select
          name="status"
          defaultValue={statusFilter}
          className="px-4 py-3 rounded-xl bg-surface border border-line text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-colors cursor-pointer"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all'
                ? 'Todos los estados'
                : s === 'due'
                  ? `ACCIÓN PENDIENTE (${dueCountRow})`
                  : s.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={sourceFilter}
          className="px-4 py-3 rounded-xl bg-surface border border-line text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-colors cursor-pointer"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Todas las fuentes' : s.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-brand text-brand-ink text-sm font-semibold transition-colors hover:bg-brand-strong"
        >
          Filtrar
        </button>
        <a
          href="/api/admin/export/leads.csv"
          className="px-6 py-3 rounded-xl border border-line bg-surface text-ink-2 text-sm font-semibold transition-colors hover:border-brand hover:text-brand"
        >
          Export CSV
        </a>
      </form>

      <Section title={`Listado (${rows.length} mostrados)`}>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin leads que coincidan con los filtros."
            description="Añade uno manual con el botón “Nuevo lead” o conecta el formulario público."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Nombre</th>
                  <th className={TABLE_HEAD_CELL}>Negocio</th>
                  <th className={TABLE_HEAD_CELL}>Contacto</th>
                  <th className={TABLE_HEAD_CELL}>Fuente</th>
                  <th className={TABLE_HEAD_CELL}>Estado</th>
                  <th className={TABLE_HEAD_CELL}>Próxima acción</th>
                  <th className={TABLE_HEAD_CELL}>Notas</th>
                  <th className={TABLE_HEAD_CELL}>Recibido</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>Mover a</th>
                  <th className={TABLE_HEAD_CELL}></th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {rows.map((lead) => {
                  const tone = STATUS_TONE[lead.status ?? 'new'] ?? 'neutral';
                  const isDue = lead.nextActionAt && lead.nextActionAt <= now;
                  const isFuture = lead.nextActionAt && lead.nextActionAt > now;
                  return (
                    <tr key={lead.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="font-semibold text-ink hover:text-brand transition-colors"
                        >
                          {lead.name}
                        </Link>
                      </td>
                      <td className={`${TABLE_CELL} text-ink-2`}>{lead.businessName || '—'}</td>
                      <td className={TABLE_CELL}>
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-brand font-mono"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {lead.phone}
                        </a>
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            className="block mt-1 inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-brand"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {lead.email}
                          </a>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} text-xs uppercase font-bold tracking-wider text-brand-strong`}>
                        {lead.source}
                      </td>
                      <td className={TABLE_CELL}>
                        <Badge tone={tone}>{lead.status}</Badge>
                      </td>
                      <td className={TABLE_CELL}>
                        {lead.nextActionAt ? (
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs ${
                              isDue ? 'text-danger font-semibold' : 'text-ink-2'
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(lead.nextActionAt)}
                            {isDue && <Badge tone="danger">vencida</Badge>}
                            {isFuture && (
                              <span className="text-[10px] uppercase text-ink-3">programada</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">—</span>
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        {lead.notes ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-ink-2"
                            title={lead.notes.slice(0, 200)}
                          >
                            <StickyNote className="h-3.5 w-3.5 text-warning" />
                            sí
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">—</span>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} text-xs text-ink-3`}>
                        {formatDateTime(lead.createdAt)}
                      </td>
                      <td className={`${TABLE_CELL} text-right`}>
                        <form action={setStatus} className="inline-flex gap-2">
                          <input type="hidden" name="leadId" value={lead.id} />
                          <select
                            name="newStatus"
                            defaultValue={lead.status ?? 'new'}
                            className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand cursor-pointer"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s.toUpperCase()}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-xl bg-brand text-brand-ink px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-brand-strong transition-colors"
                          >
                            Ok
                          </button>
                        </form>
                      </td>
                      <td className={TABLE_CELL}>
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-brand hover:text-brand-strong text-xs font-semibold"
                        >
                          Editar
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
