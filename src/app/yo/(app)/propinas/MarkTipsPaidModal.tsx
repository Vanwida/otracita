'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Loader2, BadgeCheck } from 'lucide-react';
import { formatEuros } from '../_lib/format';

// -----------------------------------------------------------------------------
// MarkTipsPaidModal — el manager con `mark_tips_paid` ve las propinas card
// pendientes de liquidar (agrupadas por barbero) y elige el método de pago
// (`cash` | `transfer` | `card_payroll`). POST /api/yo/tips/payout marca
// TODAS las pendientes a la vez (no hay selección granular en V1 — la lista
// del jefe en /dashboard ya lo cubre).
// -----------------------------------------------------------------------------

interface PendingTip {
  id: string;
  barberId: string | null;
  barberName: string | null;
  amountCents: number;
  paymentMethod: 'cash' | 'card' | null;
  paidAt: string | null;
  bookingId: string | null;
}

interface PendingResponse {
  pending: PendingTip[];
  summary: {
    barberId: string | null;
    barberName: string;
    cents: number;
    count: number;
  }[];
  totalCents: number;
}

const PAYOUT_METHODS = [
  { key: 'cash', label: 'Efectivo en mano' },
  { key: 'transfer', label: 'Transferencia' },
  { key: 'card_payroll', label: 'En la nómina' },
] as const;

type PayoutMethod = (typeof PAYOUT_METHODS)[number]['key'];

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<PendingResponse>);

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function MarkTipsPaidModal({ open, onClose, onDone }: Props) {
  const { data, isLoading, mutate } = useSWR<PendingResponse>(
    open ? '/api/yo/tips/pending' : null,
    fetcher,
  );
  const [method, setMethod] = useState<PayoutMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setMethod('cash');
    }
  }, [open]);

  const submit = async () => {
    if (!data || data.pending.length === 0) return;
    // card_payroll solo admite propinas card — filtramos antes.
    const ids =
      method === 'card_payroll'
        ? data.pending.filter((t) => t.paymentMethod === 'card').map((t) => t.id)
        : data.pending.map((t) => t.id);
    if (ids.length === 0) {
      setError('No hay propinas válidas para ese método.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/yo/tips/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipIds: ids, method }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo marcar.');
        return;
      }
      await mutate();
      onDone();
    } catch {
      setError('Error de conexión.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <BadgeCheck className="h-5 w-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-ink">
              Marcar propinas pagadas
            </h3>
            <p className="text-xs text-ink-2">
              Confirma que el equipo ya tiene su propina.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-2 hover:bg-overlay/40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading && (
          <p className="py-6 text-center text-sm text-ink-3">Cargando…</p>
        )}

        {!isLoading && data && data.pending.length === 0 && (
          <div className="rounded-control border border-line bg-overlay/30 p-4 text-center text-sm text-ink-2">
            No hay propinas pendientes de liquidar.
          </div>
        )}

        {!isLoading && data && data.pending.length > 0 && (
          <>
            <ul className="mb-4 space-y-1.5">
              {data.summary.map((s) => (
                <li
                  key={s.barberId ?? s.barberName}
                  className="flex items-center justify-between rounded-control border border-line bg-canvas p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{s.barberName}</p>
                    <p className="text-[11px] text-ink-3">
                      {s.count} propina{s.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="text-base font-bold text-ink">
                    {formatEuros(s.cents)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              Método de liquidación
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYOUT_METHODS.map((m) => {
                const active = method === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMethod(m.key)}
                    className={`rounded-control border p-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-brand bg-brand-softer text-ink'
                        : 'border-line bg-canvas text-ink-2 hover:border-line-strong'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg border border-line bg-canvas py-3 text-sm font-medium text-ink-2 hover:bg-overlay/40 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-lg bg-[var(--color-espresso)] py-3 text-sm font-semibold text-[var(--color-cream-high)] hover:bg-[var(--color-espresso-2)] disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy
                  ? 'Marcando…'
                  : `Marcar ${formatEuros(data.totalCents)} como pagado`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
