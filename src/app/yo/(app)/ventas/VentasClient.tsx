'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { TrendingUp, Lock, Plus } from 'lucide-react';
import type { TodayFeed } from '../_lib/types';
import { formatEuros } from '../_lib/format';
import CloseRegisterModal from './CloseRegisterModal';
import NewProductSaleSlideOver from './NewProductSaleSlideOver';

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<TodayFeed>);

const FILTERS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function VentasClient() {
  const { data, mutate } = useSWR<TodayFeed>('/api/yo/today', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  const [filter, setFilter] = useState<FilterKey>('today');
  const [closeOpen, setCloseOpen] = useState(false);
  const [newSaleOpen, setNewSaleOpen] = useState(false);

  const canCloseRegister = data?.permissions?.keys.includes('close_register') ?? false;

  const headlineCents = useMemo(() => {
    if (!data) return 0;
    if (filter === 'today') return data.sales.todayCents;
    if (filter === 'week') return data.sales.weekCents;
    return data.sales.monthCents;
  }, [data, filter]);

  const dailyHistory = useMemo(() => {
    if (!data) return [];
    const completed = data.week.bookings.filter(
      (b) => b.status === 'completed',
    );
    const byDate = new Map<string, { count: number; cents: number }>();
    for (const b of completed) {
      const cur = byDate.get(b.date) || { count: 0, cents: 0 };
      cur.count += 1;
      cur.cents += (b.price ?? 0) * 100;
      byDate.set(b.date, cur);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, v]) => ({ date, ...v }));
  }, [data]);

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex rounded-full bg-overlay/60 p-1">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(key)}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <section className="rounded-control border border-line bg-gradient-to-br from-brand-softer to-surface p-5 text-center shadow-sm">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
          <TrendingUp className="h-5 w-5 text-brand" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {filter === 'today'
            ? 'Hoy llevas'
            : filter === 'week'
              ? 'Esta semana'
              : 'Este mes'}
        </p>
        <p className="mt-1 text-3xl font-bold text-ink">
          {formatEuros(headlineCents)}
        </p>
        {filter === 'today' && data && (
          <p className="mt-1 text-xs text-ink-2">
            {data.sales.todayCount} corte
            {data.sales.todayCount === 1 ? '' : 's'} cobrado
            {data.sales.todayCount === 1 ? '' : 's'}
          </p>
        )}
      </section>

      {/* Nueva venta producto (walk-in TPV mínimo) — disponible para todo
          barbero. Reusa /api/pos/sale del admin TPV; el endpoint atribuye
          al barberId del actor por defecto. */}
      <button
        type="button"
        onClick={() => setNewSaleOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-control bg-brand py-3 text-sm font-semibold text-brand-ink shadow-sm transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nueva venta de producto
      </button>

      {/* Cerrar caja — gated por close_register (#72) */}
      {canCloseRegister && (
        <button
          type="button"
          onClick={() => setCloseOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface py-3 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-overlay/40"
        >
          <Lock className="h-4 w-4" />
          Cerrar caja del día
        </button>
      )}

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Histórico de la semana
        </h2>
        <ul className="space-y-2">
          {dailyHistory.length === 0 && (
            <li className="rounded-control border border-line bg-surface p-6 text-center text-sm text-ink-3">
              Sin cobros esta semana todavía.
            </li>
          )}
          {dailyHistory.map((d) => (
            <li
              key={d.date}
              className="flex items-center justify-between rounded-control border border-line bg-surface p-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {prettyDate(d.date)}
                </p>
                <p className="text-xs text-ink-3">
                  {d.count} corte{d.count === 1 ? '' : 's'}
                </p>
              </div>
              <p className="text-base font-bold text-ink">
                {formatEuros(d.cents)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <CloseRegisterModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onClosed={() => {
          setCloseOpen(false);
          mutate();
        }}
      />

      <NewProductSaleSlideOver
        open={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onSold={() => {
          setNewSaleOpen(false);
          mutate();
        }}
      />
    </div>
  );
}

function prettyDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}
