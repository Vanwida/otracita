'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'sonner';
import { Wordmark } from '@/components/brand';

// -----------------------------------------------------------------------------
// ResetPasswordForm — paso final del flow "Olvidé mi contraseña".
//
// Flow completo:
//   1. Admin desde /dashboard/equipo dispara
//      POST /api/barbers/[id]/request-password-reset (commit 17e324b).
//   2. Better Auth genera token y manda email (sendResetPassword en
//      src/lib/auth.ts).
//   3. Barbero pulsa link → /api/auth/reset-password/[token]?callbackURL=...
//      → Better Auth redirige a https://www.otracita.es/login?token=<valid>
//      o ?error=INVALID_TOKEN si caducó.
//   4. Esta UI consume el token vía POST /api/auth/reset-password con
//      body { newPassword, token } y al éxito redirige a /login limpio
//      para que el barbero entre con su contraseña nueva.
//
// No aceptamos `email` ni `userId` del usuario — Better Auth los deriva del
// token server-side. El componente sólo necesita el token + nueva clave.
// -----------------------------------------------------------------------------

type Props = {
  token: string;
};

// Better Auth aplica `minPasswordLength: 8` por defecto. Mantenemos el
// mismo número aquí para validar antes de hacer el round-trip.
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordForm({ token }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && confirm === password && !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (!res.ok) {
        // Better Auth devuelve 400 con { message } para token inválido /
        // caducado, password corta, etc. Sacamos un mensaje legible.
        let message = 'No se pudo guardar la contraseña.';
        try {
          const body = (await res.json()) as { message?: string; code?: string };
          if (body?.code === 'INVALID_TOKEN') {
            message = 'Este enlace ya no es válido. Pide otro al jefe.';
          } else if (body?.code === 'PASSWORD_TOO_SHORT') {
            message = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
          } else if (body?.message) {
            message = body.message;
          }
        } catch {
          /* respuesta no-JSON, dejamos el mensaje genérico */
        }
        toast.error(message);
        setSubmitting(false);
        return;
      }

      toast.success('Contraseña actualizada. Ya puedes entrar.');
      // Damos al toast 1.2s antes de navegar para que el barbero lo vea —
      // si redirigimos inmediatamente el <Toaster /> de esta pantalla se
      // desmonta antes de pintar nada.
      setTimeout(() => {
        router.replace('/login');
        router.refresh();
      }, 1200);
    } catch {
      toast.error('No se pudo conectar. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="flex justify-center text-ink">
            <Wordmark height={36} />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-ink">
            Pon tu contraseña
          </h2>
          <p className="mt-2 text-sm text-ink-3">
            Elige una contraseña nueva para tu cuenta. Mínimo {MIN_PASSWORD_LENGTH} caracteres.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className="text-xs font-medium text-ink-2">
              Nueva contraseña
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched(true)}
              className="rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none transition-all placeholder:text-ink-3 focus:border-emerald-500"
              placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
            />
            {touched && tooShort && (
              <p className="text-xs text-red-600">
                Debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirm-password" className="text-xs font-medium text-ink-2">
              Repite la contraseña
            </label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched(true)}
              className="rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none transition-all placeholder:text-ink-3 focus:border-emerald-500"
              placeholder="Repite la contraseña"
            />
            {touched && mismatch && (
              <p className="text-xs text-red-600">Las contraseñas no coinciden.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
