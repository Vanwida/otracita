export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { clients, invoices, invoiceRegistroEvents } from '@/db/schema';
import { desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { Receipt, AlertTriangle } from 'lucide-react';
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
  formatDateTime,
  formatEur,
  type Tone,
} from '../_components/AdminUI';

/**
 * VeriFactu compliance dashboard. AEAT RD 1007/2023 requires every issued
 * invoice to be hashed, chained, and sent to AEAT in near-realtime. Any row
 * that doesn't make it through this pipeline is a potential sanción —
 * Alex's job is to keep that backlog at zero.
 *
 * The page is read-only on purpose: we don't expose "retry" buttons that
 * touch the hash chain, because re-sealing a row breaks the chain of all
 * subsequent invoices for that tenant. The visibility-first approach lets
 * Alex spot trouble and decide the right action manually (re-seal cycle
 * or contact AEAT support) without the admin UI doing something dangerous.
 */

type InvoiceVerifactuStatus =
  | 'pending'
  | 'sent'
  | 'accepted'
  | 'accepted_with_errors'
  | 'rejected'
  | 'error';

const STATUS_META: Record<InvoiceVerifactuStatus, { label: string; tone: Tone }> = {
  pending: { label: 'PENDING', tone: 'warning' },
  sent: { label: 'SENT', tone: 'info' },
  accepted: { label: 'ACCEPTED', tone: 'success' },
  accepted_with_errors: { label: 'ACCEPTED W/ ERR', tone: 'gold' },
  rejected: { label: 'REJECTED', tone: 'danger' },
  error: { label: 'ERROR', tone: 'danger' },
};

const PROBLEM_STATES: InvoiceVerifactuStatus[] = [
  'pending',
  'rejected',
  'accepted_with_errors',
  'error',
];

export default async function AdminVerifactuPage() {
  const now = new Date();
  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);

  const [
    statusCounts,
    last30Stats,
    problematicRows,
    recentEvents,
  ] = await Promise.all([
    // Aggregate counts by verifactuStatus (all-time)
    db
      .select({
        status: invoices.verifactuStatus,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
      })
      .from(invoices)
      .groupBy(invoices.verifactuStatus),

    // Last 30d window — what was emitted and what slipped
    db
      .select({
        status: invoices.verifactuStatus,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
      })
      .from(invoices)
      .where(gte(invoices.issueDate, last30.toISOString().slice(0, 10)))
      .groupBy(invoices.verifactuStatus),

    // Per-row drill-down for everything that needs attention (cross-tenant)
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        issueDate: invoices.issueDate,
        clientId: invoices.clientId,
        businessName: clients.businessName,
        verifactuStatus: invoices.verifactuStatus,
        verifactuErrorCode: invoices.verifactuErrorCode,
        verifactuErrorMsg: invoices.verifactuErrorMsg,
        verifactuRetryCount: invoices.verifactuRetryCount,
        verifactuSentAt: invoices.verifactuSentAt,
        totalCents: invoices.totalCents,
        type: invoices.type,
        tipoFactura: invoices.tipoFactura,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(inArray(invoices.verifactuStatus, PROBLEM_STATES))
      .orderBy(desc(invoices.issueDate))
      .limit(100),

    // System event log — last 50 entries
    db
      .select({
        id: invoiceRegistroEvents.id,
        eventType: invoiceRegistroEvents.eventType,
        clientId: invoiceRegistroEvents.clientId,
        businessName: clients.businessName,
        verifactuStatus: invoiceRegistroEvents.verifactuStatus,
        verifactuErrorMsg: invoiceRegistroEvents.verifactuErrorMsg,
        createdAt: invoiceRegistroEvents.createdAt,
      })
      .from(invoiceRegistroEvents)
      .leftJoin(clients, eq(invoiceRegistroEvents.clientId, clients.id))
      .orderBy(desc(invoiceRegistroEvents.createdAt))
      .limit(50),
  ]);

  const byStatus = new Map<string, { count: number; totalCents: number }>();
  for (const row of statusCounts) {
    byStatus.set(row.status, { count: row.count, totalCents: row.totalCents });
  }
  const totalInvoices = Array.from(byStatus.values()).reduce((acc, v) => acc + v.count, 0);
  const accepted = byStatus.get('accepted')?.count ?? 0;
  const failing = PROBLEM_STATES.reduce((acc, s) => acc + (byStatus.get(s)?.count ?? 0), 0);
  const acceptedRate = totalInvoices === 0 ? null : accepted / totalInvoices;

  const billedAccepted30d = (() => {
    let cents = 0;
    for (const row of last30Stats) {
      if (row.status === 'accepted' || row.status === 'accepted_with_errors') {
        cents += row.totalCents;
      }
    }
    return cents;
  })();

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <PageHeader
        title="VeriFactu"
        subtitle={
          <span>
            Cumplimiento AEAT cross-tenant. {failing > 0 ? (
              <span className="text-danger font-semibold">{failing} factura{failing === 1 ? '' : 's'} requiere{failing === 1 ? '' : 'n'} acción.</span>
            ) : (
              <span className="text-success font-semibold">Cadena al día.</span>
            )}
          </span>
        }
      />

      {failing > 0 && (
        <div className="mb-8 space-y-3">
          <AlertCard
            tone="danger"
            title={`${failing} factura${failing === 1 ? '' : 's'} fuera de la cadena`}
            description="Cada factura en estado pending/rejected/error es una sanción potencial. Ningún botón aquí toca la cadena — abre el cliente y resuelve manualmente para no romper la huella encadenada."
          />
        </div>
      )}

      {/* KPIs globales */}
      <KpiGrid cols={4}>
        <KpiCard
          icon={<Receipt size={120} />}
          label="Facturas totales"
          value={totalInvoices.toLocaleString('es-ES')}
          sub="todas las barberías, todos los tiempos"
        />
        <KpiCard
          label="Tasa aceptación"
          value={acceptedRate === null ? '—' : `${(acceptedRate * 100).toFixed(1)}%`}
          tone={acceptedRate === null ? 'neutral' : acceptedRate >= 0.95 ? 'success' : acceptedRate >= 0.8 ? 'warning' : 'danger'}
          sub={`${accepted.toLocaleString('es-ES')} aceptadas`}
        />
        <KpiCard
          label="Pendientes de acción"
          value={failing.toLocaleString('es-ES')}
          tone={failing === 0 ? 'success' : failing < 5 ? 'warning' : 'danger'}
          sub="pending + rejected + error"
        />
        <KpiCard
          label="Facturado últ. 30d"
          value={formatEur(billedAccepted30d)}
          sub="solo facturas aceptadas"
        />
      </KpiGrid>

      {/* Breakdown por estado */}
      <Section title={`Desglose por estado (${totalInvoices.toLocaleString('es-ES')} facturas)`}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(Object.keys(STATUS_META) as InvoiceVerifactuStatus[]).map((status) => {
            const stats = byStatus.get(status) ?? { count: 0, totalCents: 0 };
            const meta = STATUS_META[status];
            return (
              <div
                key={status}
                className="rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <p className="font-display text-3xl font-semibold text-ink mt-2">
                  {stats.count.toLocaleString('es-ES')}
                </p>
                <p className="text-[11px] text-ink-3 mt-1">
                  {formatEur(stats.totalCents)}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Tabla de facturas problemáticas */}
      <Section
        title={`Facturas que requieren acción (${problematicRows.length})`}
        description="Ordenadas por fecha de emisión. Click en una para abrir el detalle del cliente y revisar."
      >
        {problematicRows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Ninguna factura problemática."
            description="Toda la cadena está aceptada o en tránsito normal."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Nº factura</th>
                  <th className={TABLE_HEAD_CELL}>Fecha</th>
                  <th className={TABLE_HEAD_CELL}>Tipo</th>
                  <th className={TABLE_HEAD_CELL}>Estado</th>
                  <th className={TABLE_HEAD_CELL}>Error</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>Importe</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>Retries</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {problematicRows.map((r) => {
                  const meta = STATUS_META[r.verifactuStatus as InvoiceVerifactuStatus] ?? STATUS_META.pending;
                  return (
                    <tr key={r.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>
                        <Link
                          href={`/admin/clients/${r.clientId}`}
                          className="font-semibold text-ink hover:text-brand transition-colors"
                        >
                          {r.businessName || <span className="italic text-ink-3">desconocido</span>}
                        </Link>
                      </td>
                      <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{r.number}</td>
                      <td className={`${TABLE_CELL} text-xs text-ink-2`}>{r.issueDate}</td>
                      <td className={`${TABLE_CELL} text-xs uppercase text-ink-3`}>
                        {r.type} · {r.tipoFactura}
                      </td>
                      <td className={TABLE_CELL}>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className={`${TABLE_CELL} text-xs text-danger max-w-md truncate`} title={r.verifactuErrorMsg || ''}>
                        {r.verifactuErrorCode && (
                          <span className="font-mono text-[10px] text-ink-3 mr-2">[{r.verifactuErrorCode}]</span>
                        )}
                        {r.verifactuErrorMsg || '—'}
                      </td>
                      <td className={`${TABLE_CELL} text-right font-mono text-ink`}>
                        {formatEur(r.totalCents)}
                      </td>
                      <td className={`${TABLE_CELL} text-right font-mono text-ink-3`}>
                        {r.verifactuRetryCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Libro de eventos del sistema (últimos 50) */}
      <Section
        title="Libro de eventos del SIF (últimos 50)"
        description="Altas, anulaciones y eventos de sistema. Encadenados — la huella anterior valida la integridad."
      >
        {recentEvents.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No hay eventos registrados todavía."
            description="El libro de eventos se empieza a poblar cuando se emita la primera factura."
          />
        ) : (
          <div className={TABLE_WRAPPER}>
            <table className={TABLE}>
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_HEAD_CELL}>Cuándo</th>
                  <th className={TABLE_HEAD_CELL}>Cliente</th>
                  <th className={TABLE_HEAD_CELL}>Tipo</th>
                  <th className={TABLE_HEAD_CELL}>Estado</th>
                  <th className={TABLE_HEAD_CELL}>Error</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY}>
                {recentEvents.map((e) => {
                  const tone: Tone =
                    e.verifactuStatus === 'accepted'
                      ? 'success'
                      : e.verifactuStatus === 'rejected' || e.verifactuStatus === 'error'
                        ? 'danger'
                        : 'warning';
                  return (
                    <tr key={e.id} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} text-xs font-mono text-ink-3`}>
                        {formatDateTime(e.createdAt)}
                      </td>
                      <td className={TABLE_CELL}>
                        {e.clientId ? (
                          <Link
                            href={`/admin/clients/${e.clientId}`}
                            className="text-ink hover:text-brand transition-colors"
                          >
                            {e.businessName || <span className="italic text-ink-3">desconocido</span>}
                          </Link>
                        ) : (
                          <span className="italic text-ink-3">sistema</span>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} text-xs uppercase font-bold text-ink`}>
                        {e.eventType}
                      </td>
                      <td className={TABLE_CELL}>
                        <Badge tone={tone}>{e.verifactuStatus}</Badge>
                      </td>
                      <td className={`${TABLE_CELL} text-xs text-danger max-w-md truncate`} title={e.verifactuErrorMsg || ''}>
                        {e.verifactuErrorMsg || '—'}
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
