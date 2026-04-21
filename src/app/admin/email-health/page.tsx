import { db } from '@/db';
import { emailParseLog, clients } from '@/db/schema';
import { desc, eq, gte } from 'drizzle-orm';
import { getEmailHealthStats } from '@/lib/email-health-stats';
import { ReprocessButton } from './_components/ReprocessButton';

/**
 * Email-parser health dashboard. Lives behind the /admin layout's auth gate
 * (email === alex / @aistudios.pro / ADMIN role). Re-renders dynamically on
 * every request because the underlying data changes per webhook.
 *
 * Layout, top to bottom:
 *   1. Three stat cards — 24h rate, 7d rate, unmatched-client count.
 *   2. Table of non-'full' rows from the last 7 days with a <details> raw
 *      preview and a Reprocess-with-LLM button.
 */

export const dynamic = 'force-dynamic';

/** Lookback window for the failures table. Kept tight to avoid infinite scroll; Alex fixes fast. */
const FAILURES_WINDOW_DAYS = 7;
/** Hard cap on rows rendered — paginating a list this noisy means the parser is on fire, not a UX problem. */
const FAILURES_LIMIT = 200;

const STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  full: {
    label: 'FULL',
    color: 'bg-success/10 border-success/30 text-success',
  },
  llm_assisted: {
    label: 'LLM ASSISTED',
    color: 'bg-gold/15 border-gold/40 text-[var(--color-brand-strong)]',
  },
  partial: {
    label: 'PARTIAL',
    color: 'bg-warning/10 border-warning/40 text-warning',
  },
  failed: {
    label: 'FAILED',
    color: 'bg-danger/10 border-danger/40 text-danger',
  },
  unmatched_client: {
    label: 'UNMATCHED',
    color: 'bg-[var(--color-overlay)] border-line-strong text-ink-2',
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.unmatched_client;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${meta.color}`}
    >
      {meta.label}
    </span>
  );
}

function formatDateTime(d: Date | null): string {
  if (!d) return '-';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function rateClass(rate: number, total: number): string {
  // Green only when we have enough data AND the rate is solid.
  if (total === 0) return 'text-ink-2';
  if (rate >= 0.95) return 'text-success';
  if (rate >= 0.8) return 'text-warning';
  return 'text-danger';
}

export default async function EmailHealthPage() {
  const [stats24h, stats7d] = await Promise.all([
    getEmailHealthStats(1),
    getEmailHealthStats(7),
  ]);

  const since7d = (() => {
    const d = new Date();
    d.setDate(d.getDate() - FAILURES_WINDOW_DAYS);
    return d;
  })();

  // Pull problematic rows only — 'full' is the happy path and belongs to stats, not triage.
  const failures = await db
    .select({
      id: emailParseLog.id,
      receivedAt: emailParseLog.receivedAt,
      clientId: emailParseLog.clientId,
      businessName: clients.businessName,
      subject: emailParseLog.subject,
      status: emailParseLog.status,
      missingFields: emailParseLog.missingFields,
      rawSnippet: emailParseLog.rawSnippet,
      parsedFields: emailParseLog.parsedFields,
      parseSource: emailParseLog.parseSource,
      bookingId: emailParseLog.bookingId,
      alertSent: emailParseLog.alertSent,
      errorMessage: emailParseLog.errorMessage,
      fromEmail: emailParseLog.fromEmail,
      toEmail: emailParseLog.toEmail,
    })
    .from(emailParseLog)
    .leftJoin(clients, eq(emailParseLog.clientId, clients.id))
    .where(gte(emailParseLog.receivedAt, since7d))
    .orderBy(desc(emailParseLog.receivedAt))
    .limit(FAILURES_LIMIT);

  const nonFullFailures = failures.filter((f) => f.status !== 'full');

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <div className="mb-10">
        <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight mb-2 text-ink">
          Salud del parser Booksy
        </h1>
        <p className="text-ink-2 text-base tracking-wide">
          Observabilidad del pipeline de emails inbound. Un parse fallido = cliente con doble-booking.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        <div className="rounded-3xl border border-line bg-surface p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
            Últimas 24h
          </p>
          <p className={`text-5xl font-black mb-2 ${rateClass(stats24h.success_rate, stats24h.total - stats24h.unmatched_client)}`}>
            {formatPercent(stats24h.success_rate)}
          </p>
          <p className="text-xs text-ink-3">
            {stats24h.full + stats24h.llm_assisted} ok · {stats24h.partial + stats24h.failed} fallos · {stats24h.total} total
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
            Últimos 7d
          </p>
          <p className={`text-5xl font-black mb-2 ${rateClass(stats7d.success_rate, stats7d.total - stats7d.unmatched_client)}`}>
            {formatPercent(stats7d.success_rate)}
          </p>
          <p className="text-xs text-ink-3">
            {stats7d.full + stats7d.llm_assisted} ok · {stats7d.partial + stats7d.failed} fallos · {stats7d.total} total
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
            Sin match 24h
          </p>
          <p className={`text-5xl font-black mb-2 ${stats24h.unmatched_client > 0 ? 'text-warning' : 'text-ink-2'}`}>
            {stats24h.unmatched_client}
          </p>
          <p className="text-xs text-ink-3">emails a una dirección no registrada</p>
        </div>
      </div>

      {/* Failures table */}
      <div>
        <h2 className="text-xl font-bold uppercase tracking-widest text-ink mb-5">
          Fallos últimos {FAILURES_WINDOW_DAYS} días ({nonFullFailures.length})
        </h2>

        {nonFullFailures.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-12 text-center text-ink-3">
            Ningún fallo en los últimos {FAILURES_WINDOW_DAYS} días. El parser está aguantando.
          </div>
        ) : (
          <div className="space-y-3">
            {nonFullFailures.map((f) => {
              const parsed = f.parsedFields as Record<string, unknown> | null;
              return (
                <details
                  key={f.id}
                  className="group rounded-2xl border border-line bg-surface overflow-hidden"
                >
                  <summary className="flex flex-wrap items-center gap-3 px-5 py-4 cursor-pointer list-none hover:bg-overlay/60 transition-colors">
                    <span className="text-xs font-mono text-ink-3 w-20 shrink-0">
                      {formatDateTime(f.receivedAt)}
                    </span>
                    <StatusBadge status={f.status} />
                    <span className="text-sm font-semibold text-ink truncate flex-1 min-w-0">
                      {f.businessName ?? (f.status === 'unmatched_client' ? f.toEmail : '—')}
                    </span>
                    <span className="text-xs text-ink-2 truncate flex-1 min-w-0">
                      {f.subject || '(sin asunto)'}
                    </span>
                    {f.missingFields && f.missingFields.length > 0 && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-warning">
                        faltan: {f.missingFields.join(', ')}
                      </span>
                    )}
                    {f.alertSent && (
                      <span className="text-[10px] font-mono text-success/80 uppercase tracking-wider">
                        alertado
                      </span>
                    )}
                    <span className="text-xs text-ink-3 ml-auto">Ver raw ↓</span>
                  </summary>

                  <div className="border-t border-line px-5 py-4 space-y-4 bg-overlay/50">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-1">De / a</p>
                      <p className="text-xs font-mono text-ink-2">
                        {f.fromEmail || '-'} → {f.toEmail || '-'}
                      </p>
                    </div>

                    {parsed && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-1">
                          Parsed fields ({f.parseSource ?? 'regex'})
                        </p>
                        <pre className="text-xs font-mono text-ink bg-overlay border border-line rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(parsed, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-3 mb-1">Raw snippet</p>
                      <pre className="text-xs font-mono text-ink-2 bg-overlay border border-line rounded-xl p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
{f.rawSnippet ?? '(vacío)'}
                      </pre>
                    </div>

                    {f.errorMessage && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-danger/80 mb-1">Error</p>
                        <p className="text-xs font-mono text-danger">{f.errorMessage}</p>
                      </div>
                    )}

                    {f.clientId && f.status !== 'unmatched_client' && (
                      <div className="pt-2">
                        <ReprocessButton logId={f.id} />
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
