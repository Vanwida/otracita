'use client';

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import SlideOver from '@/app/dashboard/_components/SlideOver';

// -----------------------------------------------------------------------------
// NewLooseTipSlideOver — propina suelta (sin cita asociada).
//
// El barbero registra una propina cash que recibió "en mano" (la card pendiente
// se registra siempre vinculada al cobro de la cita; aquí solo cash).
// POST /api/tips/cash { amountCents, barberId, notes? } — atribuye al actor.
// Si el actor es manager con `edit_others_bookings`, puede usar otro barberId
// (no expuesto en V1 — siempre uno mismo desde la app móvil).
// -----------------------------------------------------------------------------

interface Props {
  open: boolean;
  /** barberId del actor (siempre el suyo desde /yo/propinas). */
  barberId: string;
  onClose: () => void;
  onSaved: () => void;
}

const QUICK_AMOUNTS_CENTS = [100, 200, 300, 500, 1000];

export default function NewLooseTipSlideOver({
  open,
  barberId,
  onClose,
  onSaved,
}: Props) {
  const [amountCents, setAmountCents] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAmountCents(0);
      setCustomAmount('');
      setNotes('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const cents =
      amountCents > 0
        ? amountCents
        : Math.round(Number.parseFloat(customAmount.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Importe inválido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tips/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: cents,
          barberId,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo registrar la propina.');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Error de conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Propina en efectivo"
      scrim="always"
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3 rounded-control border border-line bg-overlay/40 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
              <Heart className="h-5 w-5 text-brand" />
            </div>
            <p className="text-sm text-ink-2">
              Una propina cash queda 100% para ti y entra en el cuadre del día
              si la caja está activa.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              Importe
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {QUICK_AMOUNTS_CENTS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => {
                    setAmountCents(cents);
                    setCustomAmount('');
                  }}
                  className={`rounded-lg py-3 text-sm font-semibold transition-colors ${
                    amountCents === cents
                      ? 'bg-brand text-brand-ink'
                      : 'border border-line bg-surface text-ink-2'
                  }`}
                >
                  {cents / 100}€
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="custom-amount"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3"
            >
              O escribe importe (€)
            </label>
            <input
              id="custom-amount"
              type="text"
              inputMode="decimal"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setAmountCents(0);
              }}
              placeholder="0,00"
              className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-ink placeholder-ink-3 focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3"
            >
              Nota (opcional)
            </label>
            <input
              id="notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ej. Cliente fijo del miércoles"
              maxLength={500}
              className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-brand"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <div
          className="border-t border-line bg-surface p-4"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full rounded-control bg-brand py-3 text-sm font-semibold text-brand-ink shadow-sm transition-colors disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Registrar propina'}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}
