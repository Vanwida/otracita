'use client';

import { useState } from 'react';
import { Mail, Loader2, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Modal from './Modal';

// -----------------------------------------------------------------------------
// BarberInviteCard — UI dentro del editor de barbero. Tres estados:
//
//   1. Sin cuenta + sin invitación → botón "Invitar por email".
//   2. Invitación pendiente        → email + caducidad + "Reenviar / Revocar".
//   3. Cuenta activa               → email + "Revocar acceso".
//
// Toda la lógica vive en estos endpoints:
//   POST    /api/barber-invites               { barberId, email }
//   DELETE  /api/barber-invites/[token]
//   POST    /api/barber-account/disable      { userId }
//   POST    /api/barber-account/enable       { userId }
// -----------------------------------------------------------------------------

interface Account {
  userId: string;
  email: string;
  disabledAt: string | null;
}

interface PendingInvite {
  email: string;
  expiresAt: string;
  invitedAt: string;
}

interface Props {
  barberId: string;
  barberName: string;
  account: Account | null;
  pendingInvite: PendingInvite | null;
  onChanged?: () => void;
}

export default function BarberInviteCard({
  barberId,
  barberName,
  account,
  pendingInvite,
  onChanged,
}: Props) {
  const [emailDraft, setEmailDraft] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

  const sendInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/barber-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barberId, email: emailDraft.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || 'No se pudo enviar la invitación.';
        setError(msg);
        toast.error(msg);
        return;
      }
      setLastInviteToken(typeof body?.invite?.token === 'string' ? body.invite.token : null);
      setModalOpen(false);
      setEmailDraft('');
      toast.success('Invitación enviada');
      onChanged?.();
    } catch {
      const msg = 'Error de conexión.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const revokeInvite = async () => {
    // El token plano no lo tenemos en el state — usamos el endpoint
    // alternativo que toma barberId (la API revoca cualquier invite
    // viva del barbero). Lo más simple: re-llamamos POST con un email
    // distinto NO funciona — necesitamos un DELETE específico. Mejor:
    // implementamos un endpoint helper. Por ahora, lo hacemos via
    // `/api/barber-invites/revoke?barberId=...`.
    if (!confirm('¿Revocar la invitación pendiente?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/barber-invites/revoke?barberId=${barberId}`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || 'No se pudo revocar.';
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success('Invitación revocada');
      onChanged?.();
    } catch {
      const msg = 'Error de conexión.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const disableAccount = async () => {
    if (!account) return;
    if (
      !confirm(
        `¿Revocar el acceso de ${barberName}?\n\nDejará de poder entrar a /yo desde su móvil. Las citas pasadas se conservan.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/barber-account/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || 'No se pudo revocar.';
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success('Acceso revocado');
      onChanged?.();
    } catch {
      const msg = 'Error de conexión.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const enableAccount = async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/barber-account/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || 'No se pudo reactivar.';
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success('Acceso reactivado');
      onChanged?.();
    } catch {
      const msg = 'Error de conexión.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // -- Render --------------------------------------------------------------
  // Estado 3: Cuenta activa.
  if (account) {
    const isDisabled = account.disabledAt != null;
    return (
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Acceso a /yo</h4>
        <div className="flex items-start gap-3 rounded-control border border-line bg-surface p-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              isDisabled ? 'bg-warning/10' : 'bg-success/10'
            }`}
          >
            {isDisabled ? (
              <AlertCircle className="h-4 w-4 text-warning" />
            ) : (
              <Check className="h-4 w-4 text-success" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {isDisabled ? 'Acceso revocado' : 'Cuenta activa'}
            </p>
            <p className="truncate text-xs text-ink-2">{account.email}</p>
          </div>
          <button
            type="button"
            onClick={isDisabled ? enableAccount : disableAccount}
            disabled={busy}
            className="shrink-0 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-line-strong hover:bg-overlay/40 disabled:opacity-50"
          >
            {busy ? '…' : isDisabled ? 'Reactivar' : 'Revocar'}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Estado 2: Invitación pendiente.
  if (pendingInvite) {
    const days = Math.max(
      0,
      Math.ceil(
        (new Date(pendingInvite.expiresAt).getTime() - Date.now()) / 86400000,
      ),
    );
    return (
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Acceso a /yo</h4>
        <div className="flex items-start gap-3 rounded-control border border-line bg-surface p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <Mail className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Invitación enviada</p>
            <p className="truncate text-xs text-ink-2">{pendingInvite.email}</p>
            <p className="mt-0.5 text-[11px] text-ink-3">
              Caduca en {days} día{days === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEmailDraft(pendingInvite.email);
                setModalOpen(true);
              }}
              disabled={busy}
              className="rounded-lg border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-2 hover:border-line-strong disabled:opacity-50"
            >
              <RefreshCw className="mr-1 inline h-3 w-3" />
              Reenviar
            </button>
            <button
              type="button"
              onClick={revokeInvite}
              disabled={busy}
              className="rounded-lg border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-2 hover:border-line-strong disabled:opacity-50"
            >
              <X className="mr-1 inline h-3 w-3" />
              Revocar
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <InviteModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          barberName={barberName}
          email={emailDraft}
          setEmail={setEmailDraft}
          onSubmit={sendInvite}
          busy={busy}
          error={error}
        />
      </div>
    );
  }

  // Estado 1: Sin cuenta + sin invitación.
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-ink">Acceso a /yo</h4>
      <p className="mb-3 text-xs text-ink-2">
        Invita a {barberName.split(' ')[0]} por email para que pueda ver su
        agenda, ventas y propinas desde su móvil.
      </p>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink hover:border-line-strong hover:bg-overlay/40 disabled:opacity-50"
      >
        <Mail className="h-4 w-4" />
        Invitar por email
      </button>
      {lastInviteToken && (
        <p className="mt-3 text-xs text-success">
          Invitación enviada. Si el email no llega, copia el link:
          <br />
          <code className="break-all text-[11px] text-ink-2">
            {`${window.location.origin}/aceptar-invitacion/${lastInviteToken}`}
          </code>
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <InviteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        barberName={barberName}
        email={emailDraft}
        setEmail={setEmailDraft}
        onSubmit={sendInvite}
        busy={busy}
        error={error}
      />
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  barberName,
  email,
  setEmail,
  onSubmit,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  barberName: string;
  email: string;
  setEmail: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={`Invitar a ${barberName}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-overlay/40"
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!valid || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-espresso)] px-3 py-2 text-sm font-semibold text-[var(--color-cream-high)] hover:bg-[var(--color-espresso-2)] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </div>
      }
    >
      <div className="p-5">
        <h3 className="text-base font-semibold text-ink">
          Invitar a {barberName}
        </h3>
        <p className="mt-1 text-sm text-ink-2">
          Le mandamos un email con un enlace para crear su cuenta. El link
          caduca en 7 días.
        </p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-3">
          Email del barbero
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@correo.com"
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          disabled={busy}
        />
        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
