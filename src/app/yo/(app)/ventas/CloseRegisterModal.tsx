'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Loader2, Lock } from 'lucide-react';
import { formatEuros } from '../_lib/format';

// -----------------------------------------------------------------------------
// CloseRegisterModal — modal mobile-friendly para cerrar caja desde /yo.
//
// Carga la sesión activa (`/api/yo/cash/current`) y muestra:
//   · Esperado en efectivo según movimientos.
//   · Input "Lo que tengo en el cajón" (cents).
//   · Input opcional "Total datáfono" (si tienen TPV físico).
//   · Botón "Cerrar caja" → POST /api/yo/cash/close.
//
// Gated server-side por `close_register`. Si la caja no está activa o no
// hay sesión abierta, mostramos un empty-state correspondiente.
// -----------------------------------------------------------------------------

interface CurrentResponse {
  session: {
    id: string;
    openingCents: number;
    openedAt: string;
  } | null;
  expected: {
    cashExpectedCents: number;
    cardExpectedCents: number;
  } | null;
  cashRegisterEnabled?: boolean;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<CurrentResponse>);

interface Props {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}

export default function CloseRegisterModal({ open, onClose, onClosed }: Props) {
  const { data, isLoading } = useSWR<CurrentResponse>(
    open ? '/api/yo/cash/current' : null,
    fetcher,
  );

  const [cashEuros, setCashEuros] = useState('');
  const [cardEuros, setCardEuros] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCashEuros('');
      setCardEuros('');
      setNotes('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const cashCents = Math.round(Number(cashEuros) * 100);
    if (!Number.isFinite(cashCents) || cashCents < 0) {
      setError('Indica cuánto efectivo hay en el cajón.');
      return;
    }
    let cardCents: number | null = null;
    if (cardEuros.trim().length > 0) {
      const parsed = Math.round(Number(cardEuros) * 100);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Total datáfono inválido.');
        return;
      }
      cardCents = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/yo/cash/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingCentsCounted: cashCents,
          cardTerminalCountedCents: cardCents,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo cerrar la caja.');
        return;
      }
      onClosed();
    } catch {
      setError('Error de conexión.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const cashRegisterEnabled = data?.cashRegisterEnabled !== false;
  const session = data?.session ?? null;

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
            <Lock className="h-5 w-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-ink">Cerrar caja</h3>
            <p className="text-xs text-ink-2">
              Cuenta lo que hay físicamente y cierra el día.
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

        {!isLoading && !cashRegisterEnabled && (
          <div className="rounded-control border border-line bg-overlay/30 p-4 text-sm text-ink-2">
            La caja efectivo no está activa en este negocio. Pide al jefe que
            la habilite desde Ajustes.
          </div>
        )}

        {!isLoading && cashRegisterEnabled && !session && (
          <div className="rounded-control border border-line bg-overlay/30 p-4 text-sm text-ink-2">
            No hay caja abierta hoy. Pide al jefe que la abra antes de cerrar.
          </div>
        )}

        {!isLoading && cashRegisterEnabled && session && data?.expected && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-control border border-line bg-canvas p-3">
                <p className="text-[10px] uppercase tracking-wide text-ink-3">
                  Esperado en caja
                </p>
                <p className="mt-1 text-base font-bold text-ink">
                  {formatEuros(data.expected.cashExpectedCents)}
                </p>
              </div>
              <div className="rounded-control border border-line bg-canvas p-3">
                <p className="text-[10px] uppercase tracking-wide text-ink-3">
                  Esperado datáfono
                </p>
                <p className="mt-1 text-base font-bold text-ink">
                  {formatEuros(data.expected.cardExpectedCents)}
                </p>
              </div>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Efectivo contado (€)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={cashEuros}
                onChange={(e) => setCashEuros(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-3 text-base text-ink outline-none focus:border-brand"
                disabled={busy}
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Total datáfono (€, opcional)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={cardEuros}
                onChange={(e) => setCardEuros(e.target.value)}
                placeholder="Si no tienes TPV, déjalo vacío"
                className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-3 text-base text-ink outline-none focus:border-brand"
                disabled={busy}
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Notas (opcional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones del cierre"
                rows={2}
                className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                disabled={busy}
              />
            </label>

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
                {busy ? 'Cerrando…' : 'Cerrar caja'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
