'use client';

/**
 * Generates a deterministic-ish inbound email for the client and writes it
 * into the target input. Pure client-side helper — the actual save still
 * happens via the outer form server action.
 *
 * Format: sync-{clientId first 8 chars}@inbound.otracita.es
 * Keeping the 8-char prefix guarantees per-tenant uniqueness against the DB
 * unique constraint without exposing the full UUID in the routing email.
 */

interface Props {
  clientId: string;
  inputId: string;
}

const INBOUND_DOMAIN = 'inbound.otracita.es';
const PREFIX_LENGTH = 8;

export function AutoGenerateBooksyEmail({ clientId, inputId }: Props): React.ReactElement {
  function handleClick(): void {
    const target = document.getElementById(inputId) as HTMLInputElement | null;
    if (!target) return;
    const prefix = clientId.replace(/-/g, '').slice(0, PREFIX_LENGTH);
    target.value = `sync-${prefix}@${INBOUND_DOMAIN}`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-200 hover:bg-cyan-500/15 hover:border-cyan-500/40 hover:text-cyan-200 transition-all"
    >
      Auto-generar
    </button>
  );
}
