'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  logId: string;
}

/**
 * Admin-only button that kicks off an LLM re-extraction of a historical
 * parse log. Stays out of the critical path (the inbound webhook is untouched)
 * and uses a client component so the operator gets inline success/failure
 * feedback without a full page reload.
 */
export function ReprocessButton({ logId }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(
    null,
  );
  const router = useRouter();

  function handleClick(): void {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/email-health/reprocess?id=${encodeURIComponent(logId)}`, {
          method: 'POST',
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reason?: string;
          bookingId?: string;
          error?: string;
        };
        if (!res.ok) {
          setFeedback({ kind: 'err', text: data.error ?? `HTTP ${res.status}` });
          return;
        }
        if (data.ok) {
          setFeedback({
            kind: 'ok',
            text: data.bookingId ? `Reserva creada/actualizada` : 'Procesado (sin reserva)',
          });
          router.refresh();
          return;
        }
        setFeedback({ kind: 'warn', text: data.reason ?? 'Sin cambios' });
      } catch (err) {
        setFeedback({
          kind: 'err',
          text: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    });
  }

  const feedbackClass =
    feedback?.kind === 'ok'
      ? 'text-[var(--color-success)]'
      : feedback?.kind === 'err'
        ? 'text-[var(--color-danger)]'
        : 'text-[var(--color-warning)]';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-xl bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-brand)] hover:bg-[var(--color-brand)]/20 hover:border-[var(--color-brand)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Procesando…' : 'Reprocesar con LLM'}
      </button>
      {feedback && (
        <span className={`text-xs font-medium ${feedbackClass}`}>{feedback.text}</span>
      )}
    </div>
  );
}
