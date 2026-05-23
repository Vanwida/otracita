'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { Heart, Wallet, CreditCard, BadgeCheck, Plus } from 'lucide-react';
import type { TodayFeed } from '../_lib/types';
import { formatEuros } from '../_lib/format';
import MarkTipsPaidModal from './MarkTipsPaidModal';
import NewLooseTipSlideOver from './NewLooseTipSlideOver';

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<TodayFeed>);

export default function PropinasClient() {
  const { data, mutate } = useSWR<TodayFeed>('/api/yo/today', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const [markOpen, setMarkOpen] = useState(false);
  const [newTipOpen, setNewTipOpen] = useState(false);

  const canMarkTips = data?.permissions?.keys.includes('mark_tips_paid') ?? false;
  // `self.id` es el barberId real del actor (cuando un manager mira la
  // agenda de otro, `barber.id` es la del que mira — para registrar la
  // propina SUELTA siempre atribuimos al actor, no al barbero visto).
  const selfBarberId = data?.self?.id ?? data?.barber.id ?? null;

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

      {/* Registrar propina suelta cash — operativo para todo barbero. */}
      {selfBarberId && (
        <button
          type="button"
          onClick={() => setNewTipOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-control bg-brand py-3 text-sm font-semibold text-brand-ink shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Registrar propina en mano
        </button>
      )}

      {/* Manager: marcar propinas pagadas al equipo (#72) */}
      {canMarkTips && (
        <button
          type="button"
          onClick={() => setMarkOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface py-3 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-overlay/40"
        >
          <BadgeCheck className="h-4 w-4" />
          Marcar propinas pagadas al equipo
        </button>
      )}

      <section className="rounded-control border border-line bg-surface p-4 text-center">
        <p className="text-xs text-ink-3">Total acumulado este mes</p>
        <p className="mt-1 text-2xl font-bold text-ink">
          {formatEuros(
            (data?.tips.cashEntregadaCents ?? 0) +
              (data?.tips.cardPendienteCents ?? 0),
          )}
        </p>
      </section>

      <MarkTipsPaidModal
        open={markOpen}
        onClose={() => setMarkOpen(false)}
        onDone={() => {
          setMarkOpen(false);
          mutate();
        }}
      />

      {selfBarberId && (
        <NewLooseTipSlideOver
          open={newTipOpen}
          barberId={selfBarberId}
          onClose={() => setNewTipOpen(false)}
          onSaved={() => {
            setNewTipOpen(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}
