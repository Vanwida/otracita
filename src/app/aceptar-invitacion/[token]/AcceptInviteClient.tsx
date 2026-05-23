'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface Props {
  token: string;
  email: string;
  barberName: string;
  barberPhoto: string | null;
  businessName: string | null;
}

export default function AcceptInviteClient({
  token,
  email,
  barberName,
  barberPhoto,
  businessName,
}: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !submitting &&
    password.length >= 8 &&
    password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/barber-invites/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof body?.error === 'string'
            ? body.error
            : 'No se pudo aceptar la invitación.',
        );
        return;
      }
      // Better Auth ya seteó la cookie en la response. Redirigimos a /yo.
      const target = typeof body?.redirectTo === 'string' ? body.redirectTo : '/yo';
      window.location.href = target;
    } catch {
      setError('Error de conexión. Vuelve a intentarlo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-control border border-line bg-surface p-6 shadow-sm">
          {/* Avatar + nombre */}
          <div className="mb-5 text-center">
            {barberPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={barberPhoto}
                alt={barberName}
                className="mx-auto h-20 w-20 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-line bg-overlay text-2xl font-bold text-ink-2">
                {barberName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <h1 className="mt-3 text-lg font-bold text-ink">
              Hola, {barberName.split(' ')[0]}
            </h1>
            {businessName && (
              <p className="mt-1 text-sm text-ink-2">
                Te han invitado a unirte a{' '}
                <span className="font-semibold text-ink">{businessName}</span>
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Email
              </label>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full cursor-not-allowed rounded-lg border border-line bg-overlay/40 px-3 py-2 text-sm text-ink-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Crea tu contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 pr-10 text-sm text-ink outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Repite la contraseña
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              {confirm && password !== confirm && (
                <p className="mt-1 text-xs text-danger">No coincide.</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-control bg-[var(--color-espresso)] py-3 text-sm font-semibold text-[var(--color-cream-high)] shadow-sm transition-colors hover:bg-[var(--color-espresso-2)] disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Creando cuenta…' : 'Aceptar y entrar'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-3">
          Tu acceso te permite ver tu agenda, ventas y propinas. No tendrás
          acceso a la administración del negocio.
        </p>
      </div>
    </div>
  );
}
