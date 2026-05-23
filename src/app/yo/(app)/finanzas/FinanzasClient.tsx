'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { LineChart, Scissors, ShoppingBag, Heart } from 'lucide-react';
import { formatEuros } from '../_lib/format';

// -----------------------------------------------------------------------------
// FinanzasClient (#72) — vista de finanzas del local para el manager con
// `view_finances`. Muestra ingresos brutos por periodo (Día/Semana/Mes) y
// un histórico de 7 días para gráfica simple (barras).
//
// Composición: cortes (bookings completados) + productos (no internos) +
// propinas cash. Cifras del LOCAL, no por barbero — para eso está /equipo.
//
// UI: sin scroll vertical, tokens semánticos, sin hex, layout coherente con
// el resto de pantallas /yo (filtros segmentados arriba, headline, cards).
// -----------------------------------------------------------------------------

interface DayTotals {
  date: string;
  bookingsCents: number;
  productsCents: number;
  tipsCashCents: number;
  totalCents: number;
}

interface FinanzasResponse {
  period: 'day' | 'week' | 'month';
  range: { start: string; end: string };
  totals: {
    bookingsCents: number;
    productsCents: number;
    tipsCashCents: number;
    totalCents: number;
  };
  history: DayTotals[];
}

const PERIODS = [
  { key: 'day', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
] as const;

type Period = (typeof PERIODS)[number]['key'];

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<FinanzasResponse>);

export default function FinanzasClient() {
  const [period, setPeriod] = useState<Period>('day');
  const { data, isLoading } = useSWR<FinanzasResponse>(
    `/api/yo/finanzas?period=${period}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  );

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div role="tablist" className="flex rounded-full bg-overlay/60 p-1">
        {PERIODS.map(({ key, label }) => {
          const active = period === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(key)}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Headline */}
      <section className="rounded-control border border-line bg-gradient-to-br from-brand-softer to-surface p-5 text-center shadow-sm">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
          <LineChart className="h-5 w-5 text-brand" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Ingresos del local · {periodLabel(period)}
        </p>
        <p className="mt-1 text-3xl font-bold text-ink">
          {formatEuros(data?.totals.totalCents ?? 0)}
        </p>
        {data && (
          <p className="mt-1 text-xs text-ink-2">
            {prettyRange(data.range.start, data.range.end)}
          </p>
        )}
      </section>

      {/* Desglose */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Desglose
        </h2>
        <div className="grid grid-cols-1 gap-2">
          <BreakdownRow
            Icon={Scissors}
            label="Cortes"
            cents={data?.totals.bookingsCents ?? 0}
          />
          <BreakdownRow
            Icon={ShoppingBag}
            label="Productos"
            cents={data?.totals.productsCents ?? 0}
          />
          <BreakdownRow
            Icon={Heart}
            label="Propinas en efectivo"
            cents={data?.totals.tipsCashCents ?? 0}
          />
        </div>
      </section>

      {/* Mini-histórico (7 días) */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Últimos 7 días
        </h2>
        <div className="rounded-control border border-line bg-surface p-4">
          {isLoading || !data ? (
            <p className="py-4 text-center text-sm text-ink-3">Cargando…</p>
          ) : (
            <BarsHistory data={data.history} />
          )}
        </div>
      </section>

      <p className="px-1 text-[11px] text-ink-3">
        Tú no aparece desglosado por barbero aquí. Para comisiones del equipo
        usa la pestaña Equipo.
      </p>
    </div>
  );
}

function BreakdownRow({
  Icon,
  label,
  cents,
}: {
  Icon: typeof Scissors;
  label: string;
  cents: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-surface p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-softer">
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <p className="flex-1 text-sm font-medium text-ink">{label}</p>
      <p className="text-base font-bold text-ink">{formatEuros(cents)}</p>
    </div>
  );
}

function BarsHistory({ data }: { data: DayTotals[] }) {
  const max = Math.max(1, ...data.map((d) => d.totalCents));
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 120 }}>
      {data.map((d) => {
        const heightPct = (d.totalCents / max) * 100;
        const today = new Date().toISOString().slice(0, 10) === d.date;
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-full w-full items-end">
              <div
                className={`w-full rounded-t ${today ? 'bg-brand' : 'bg-brand/40'}`}
                style={{ height: `${Math.max(heightPct, 2)}%` }}
                title={`${d.date}: ${formatEuros(d.totalCents)}`}
              />
            </div>
            <p className="text-[10px] text-ink-3">{dayLabel(d.date)}</p>
          </div>
        );
      })}
    </div>
  );
}

function periodLabel(p: Period): string {
  if (p === 'day') return 'Hoy';
  if (p === 'week') return 'Esta semana';
  return 'Este mes';
}

function dayLabel(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-ES', { weekday: 'narrow' });
}

function prettyRange(start: string, end: string): string {
  if (start === end) return pretty(start);
  return `${pretty(start)} → ${pretty(end)}`;
}

function pretty(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
