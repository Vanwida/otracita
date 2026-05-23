'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Clock, Sparkles, Users } from 'lucide-react';
import type { BarberBooking, TodayFeed } from '../_lib/types';
import {
  formatEuros,
  formatEurosFromEuros,
  relativeCountdown,
  statusLabel,
} from '../_lib/format';
import BookingSheet from './BookingSheet';

const FILTERS = [
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'week', label: 'Esta semana' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<TodayFeed>);

export default function AgendaClient() {
  const [asBarberId, setAsBarberId] = useState<string | null>(null);
  const swrUrl = asBarberId
    ? `/api/yo/today?asBarberId=${encodeURIComponent(asBarberId)}`
    : '/api/yo/today';
  const { data, mutate, isLoading } = useSWR<TodayFeed>(swrUrl, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  const [filter, setFilter] = useState<FilterKey>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canEditOthers =
    (data?.team && data.team.length > 0) ||
    (data?.permissions?.keys.includes('edit_others_bookings') ?? false);
  const viewingOther = !!(data?.self && data.barber.id !== data.self.id);

  // Tick para refrescar el countdown ("en X min") sin re-fetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const list = useMemo<BarberBooking[]>(() => {
    if (!data) return [];
    if (filter === 'today') return data.today.bookings;
    if (filter === 'tomorrow') return data.tomorrow.bookings;
    return data.week.bookings;
  }, [data, filter]);

  // Próxima cita del día (la primera confirmed cuya hora aún no pasó +120 min).
  const nextOnTodayList = useMemo(() => {
    if (!data) return null;
    const todays = data.today.bookings.filter((b) => b.status === 'confirmed');
    for (const b of todays) {
      const { isPast } = relativeCountdown(b.time, b.date);
      if (!isPast) return b;
    }
    return null;
  }, [data]);

  const selected = useMemo(() => {
    if (!data) return null;
    return data.week.bookings.find((b) => b.id === selectedId) ?? null;
  }, [data, selectedId]);

  return (
    <div className="space-y-5">
      {/* Selector de barbero — solo manager con `edit_others_bookings` */}
      {canEditOthers && data?.team && data.team.length > 1 && (
        <div className="flex items-center gap-2 rounded-control border border-line bg-surface p-2">
          <Users className="ml-1 h-4 w-4 shrink-0 text-ink-3" />
          <label className="sr-only" htmlFor="agenda-barber-select">
            Ver agenda de
          </label>
          <select
            id="agenda-barber-select"
            value={data.barber.id}
            onChange={(e) => {
              const id = e.target.value;
              setAsBarberId(data.self && id === data.self.id ? null : id);
              setSelectedId(null);
            }}
            className="flex-1 rounded-lg border-0 bg-transparent py-1 text-sm font-medium text-ink outline-none"
          >
            {data.team.map((b) => (
              <option key={b.id} value={b.id}>
                {data.self && b.id === data.self.id
                  ? `${b.name} (tú)`
                  : b.name}
              </option>
            ))}
          </select>
          {viewingOther && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
              Otro
            </span>
          )}
        </div>
      )}

      {/* Filtros segmentados */}
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
                active
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-2'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Card próxima cita */}
      {filter === 'today' && nextOnTodayList && (
        <NextBookingCard
          booking={nextOnTodayList}
          onTap={() => setSelectedId(nextOnTodayList.id)}
        />
      )}

      {/* Resumen rápido del día */}
      {filter === 'today' && data && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Cortes hoy" value={data.sales.todayCount.toString()} />
          <Stat label="Ventas" value={formatEuros(data.sales.todayCents)} />
          <Stat label="Propinas" value={formatEuros(data.tips.todayCents)} />
        </div>
      )}

      {/* Lista de citas */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          {filter === 'week'
            ? 'Esta semana'
            : filter === 'tomorrow'
              ? 'Mañana'
              : 'El resto del día'}
        </h2>
        <ul className="space-y-2">
          {isLoading && (
            <li className="py-8 text-center text-sm text-ink-3">Cargando…</li>
          )}
          {!isLoading && list.length === 0 && (
            <li className="rounded-control border border-line bg-surface p-6 text-center text-sm text-ink-3">
              Sin citas{' '}
              {filter === 'today'
                ? 'hoy'
                : filter === 'tomorrow'
                  ? 'mañana'
                  : 'esta semana'}
              .
            </li>
          )}
          {list.map((b) => (
            <li key={b.id}>
              <BookingRow
                booking={b}
                showDate={filter === 'week'}
                onTap={() => setSelectedId(b.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      <BookingSheet
        booking={selected}
        onClose={() => setSelectedId(null)}
        onChanged={() => {
          mutate();
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-line bg-surface p-3 text-center">
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-3">{label}</p>
    </div>
  );
}

function NextBookingCard({
  booking,
  onTap,
}: {
  booking: BarberBooking;
  onTap: () => void;
}) {
  const cd = relativeCountdown(booking.time, booking.date);
  return (
    <button
      type="button"
      onClick={onTap}
      className="block w-full overflow-hidden rounded-control border border-line bg-gradient-to-br from-brand-softer to-surface p-5 text-left shadow-sm transition-transform active:scale-[0.99]"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
        <Sparkles className="h-3.5 w-3.5" />
        {cd.isNow ? 'Atendiendo ahora' : 'Próxima cita'}
      </div>
      <p className="text-2xl font-bold text-ink">
        {booking.customerName || 'Cliente sin nombre'}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        {booking.service} · {booking.duration} min
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Clock className="h-4 w-4 text-ink-2" />
          {booking.time}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            cd.isNow
              ? 'bg-brand text-[var(--color-cream-high)]'
              : 'bg-surface text-ink'
          }`}
        >
          {cd.text}
        </span>
      </div>
    </button>
  );
}

function BookingRow({
  booking,
  showDate,
  onTap,
}: {
  booking: BarberBooking;
  showDate: boolean;
  onTap: () => void;
}) {
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';
  const isNoShow = booking.status === 'no_show';

  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex w-full items-center gap-3 rounded-control border border-line bg-surface p-3 text-left transition-colors active:bg-overlay/40 ${
        isCancelled || isNoShow ? 'opacity-60' : ''
      }`}
    >
      <div className="flex w-12 shrink-0 flex-col items-center">
        <span className="text-base font-bold text-ink">{booking.time}</span>
        {showDate && (
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">
            {shortDate(booking.date)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {booking.customerName || 'Cliente sin nombre'}
        </p>
        <p className="truncate text-xs text-ink-2">
          {booking.service} · {booking.duration} min
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold text-ink">
          {formatEurosFromEuros(booking.price)}
        </span>
        {(isCompleted || isCancelled || isNoShow) && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isCompleted
                ? 'bg-success/10 text-success'
                : isCancelled
                  ? 'bg-ink-3/10 text-ink-3'
                  : 'bg-warning/10 text-warning'
            }`}
          >
            {statusLabel(booking.status)}
          </span>
        )}
      </div>
    </button>
  );
}

function shortDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
}
