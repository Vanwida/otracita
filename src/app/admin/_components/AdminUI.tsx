import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared layout primitives for admin pages. Keep the visual language
 * consistent across every admin screen — page title, section, KPI card,
 * tone-coloured badge, etc. Every admin page composes these instead of
 * re-declaring the same className strings.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex-1 min-w-0">
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-3 text-ink">
          {title}
        </h1>
        {subtitle && <div className="text-ink-2 text-lg tracking-wide">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      {(title || description || actions) && (
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3">{title}</h2>
            )}
            {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand' | 'gold' | 'info';

const TONE_BG: Record<Tone, string> = {
  success: 'bg-success/10 border-success/30 text-success',
  warning: 'bg-warning/10 border-warning/40 text-warning',
  danger: 'bg-danger/10 border-danger/40 text-danger',
  neutral: 'bg-overlay border-line-strong text-ink-2',
  brand: 'bg-brand-softer border-brand/30 text-brand-strong',
  gold: 'bg-gold-soft border-gold/40 text-brand-strong',
  info: 'bg-overlay border-line text-ink-2',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${TONE_BG[tone]}`}
    >
      {children}
    </span>
  );
}

export function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
}) {
  const accent = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    brand: 'text-brand',
    gold: 'text-[var(--color-brand-strong)]',
    info: 'text-ink-2',
    neutral: 'text-ink',
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand">
      {icon && (
        <div className="absolute -right-4 -top-4 text-brand-softer pointer-events-none">{icon}</div>
      )}
      <p className="relative z-10 text-xs font-bold uppercase tracking-widest text-ink-3 mb-3">
        {label}
      </p>
      <span className={`relative z-10 block font-display text-4xl md:text-5xl font-semibold ${accent}`}>
        {value}
      </span>
      {sub && <p className="relative z-10 mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function KpiGrid({
  children,
  cols = 4,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const map = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[cols];
  return <div className={`grid grid-cols-1 ${map} gap-5 mb-10`}>{children}</div>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-16 text-center">
      {Icon && <Icon className="mx-auto h-12 w-12 text-ink-3 mb-4" />}
      <p className="text-ink font-semibold">{title}</p>
      {description && <p className="text-ink-2 mt-2 text-sm">{description}</p>}
    </div>
  );
}

export function AlertCard({
  tone,
  title,
  description,
  href,
  cta,
}: {
  tone: 'danger' | 'warning' | 'success';
  title: string;
  description: string;
  href?: string;
  cta?: string;
}) {
  const variants = {
    danger: {
      border: 'border-danger/40',
      bg: 'bg-danger/5',
      accent: 'text-danger',
    },
    warning: {
      border: 'border-warning/50',
      bg: 'bg-warning/5',
      accent: 'text-warning',
    },
    success: {
      border: 'border-success/40',
      bg: 'bg-success/5',
      accent: 'text-success',
    },
  }[tone];

  return (
    <div
      className={`rounded-2xl border-2 ${variants.border} ${variants.bg} p-5 flex flex-col sm:flex-row sm:items-center gap-4`}
    >
      <div className="flex-1">
        <h3 className={`font-display text-lg font-semibold mb-1 ${variants.accent}`}>{title}</h3>
        <p className="text-sm text-ink-2 leading-relaxed">{description}</p>
      </div>
      {href && cta && (
        <Link
          href={href}
          className={`shrink-0 inline-flex items-center justify-center rounded-xl border ${variants.border} bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider ${variants.accent} transition-colors hover:bg-canvas`}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

export const TABLE_WRAPPER =
  'overflow-x-auto rounded-2xl border border-line bg-surface';
export const TABLE =
  'min-w-full text-left text-sm text-ink-2';
export const TABLE_HEAD =
  'border-b border-line bg-overlay uppercase tracking-wider text-xs';
export const TABLE_HEAD_CELL =
  'px-5 py-4 font-bold text-ink-3';
export const TABLE_BODY = 'divide-y divide-line';
export const TABLE_ROW = 'hover:bg-overlay/50 transition-colors';
export const TABLE_CELL = 'px-5 py-4';

export function formatEur(cents: number): string {
  return `${(cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

/**
 * Acepta Date, string ISO o null/undefined. Las queries con aggregates raw
 * (`sql<Date>\`max(...)\``) devuelven strings desde Drizzle, no Date — esta
 * función las normaliza para no estallar en el render con "Invalid time value".
 */
function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function relativeFromNow(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return '—';
  const ms = date.getTime() - Date.now();
  const abs = Math.abs(ms);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let value: number;
  let unit: 'minuto' | 'hora' | 'día';
  if (abs < hour) {
    value = Math.round(abs / minute);
    unit = 'minuto';
  } else if (abs < day) {
    value = Math.round(abs / hour);
    unit = 'hora';
  } else {
    value = Math.round(abs / day);
    unit = 'día';
  }
  const plural = value === 1 ? unit : `${unit}s`;
  return ms >= 0 ? `en ${value} ${plural}` : `hace ${value} ${plural}`;
}
