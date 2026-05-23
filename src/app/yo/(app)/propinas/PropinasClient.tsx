'use client';

import useSWR from 'swr';
import { Heart, Wallet, CreditCard } from 'lucide-react';
import type { TodayFeed } from '../_lib/types';
import { formatEuros } from '../_lib/format';

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<TodayFeed>);

export default function PropinasClient() {
  const { data } = useSWR<TodayFeed>('/api/yo/today', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-control border border-line bg-gradient-to-br from-brand-softer to-surface p-5 text-center shadow-sm">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
          <Heart className="h-5 w-5 text-brand" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Propinas hoy
        </p>
        <p className="mt-1 text-3xl font-bold text-ink">
          {formatEuros(data?.tips.todayCents ?? 0)}
        </p>
        <p className="mt-1 text-xs text-ink-2">
          {data?.tips.todayCount ?? 0} cliente
          {(data?.tips.todayCount ?? 0) === 1 ? '' : 's'}
        </p>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Pendiente de liquidar
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-control border border-line bg-surface p-4">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
              <Wallet className="h-4 w-4 text-success" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Efectivo en mano
            </p>
            <p className="mt-1 text-xl font-bold text-ink">
              {formatEuros(data?.tips.cashEntregadaCents ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-ink-3">Ya entregado.</p>
          </div>
          <div className="rounded-control border border-line bg-surface p-4">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
              <CreditCard className="h-4 w-4 text-warning" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Tarjeta pendiente
            </p>
            <p className="mt-1 text-xl font-bold text-ink">
              {formatEuros(data?.tips.cardPendienteCents ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-ink-3">
              Te lo pagará el jefe.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-control border border-line bg-surface p-4 text-center">
        <p className="text-xs text-ink-3">Total acumulado este mes</p>
        <p className="mt-1 text-2xl font-bold text-ink">
          {formatEuros(
            (data?.tips.cashEntregadaCents ?? 0) +
              (data?.tips.cardPendienteCents ?? 0),
          )}
        </p>
      </section>
    </div>
  );
}
