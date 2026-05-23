'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'sonner';
import { authClient } from '@/lib/auth/client';
import { Wordmark } from '@/components/brand';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function routeByRole() {
    // El backend decide. Modo barbero v2: role='barber' → /yo/agenda,
    // resto → /dashboard. Centralizado en /api/me/landing.
    try {
      const res = await fetch('/api/me/landing', { cache: 'no-store' });
      const body = (await res.json()) as { redirectTo?: string };
      const target = typeof body.redirectTo === 'string' ? body.redirectTo : '/dashboard';
      window.location.href = target;
    } catch {
      window.location.href = '/dashboard';
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    // Google SSO: callback a un endpoint que reenvía por role.
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/api/me/landing-redirect',
    });
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    setLoading(true);
    setError('');

    // Try sign in first
    const { error: signInError } = await authClient.signIn.email({ email, password });

    if (!signInError) {
      await routeByRole();
      return;
    }

    // User might not exist — try sign up. NOTA: signUp aquí solo crea
    // dueños (role='admin' default). Los barberos NO entran por esta
    // pantalla, entran via /aceptar-invitacion/[token]. Si alguien
    // intenta registrarse y ya tiene una invitación pendiente para
    // ese email, debería usar el link del email — pero por simplicidad
    // dejamos el signUp aquí como fallback.
    const { error: signUpError } = await authClient.signUp.email({
      email,
      password,
      name: email.split('@')[0],
    });

    if (!signUpError) {
      await routeByRole();
      return;
    }

    setError(signUpError.message || 'Error de autenticación');
    setLoading(false);
  }

  // Mantener router declarado para evitar regresiones si otro código lo
  // referencia. Cambiamos a window.location.href para forzar full reload
  // tras login (importante para que el server pille la cookie en el
  // primer render de /yo).
  void router;

  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="flex justify-center text-ink">
            <Wordmark height={36} />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-ink">Acceso clientes</h2>
          <p className="mt-2 text-sm text-ink-3">Ingresa tu correo y contraseña para acceder.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            name="email"
            type="email"
            placeholder="correo@tupeluqueria.com"
            required
            className="rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none transition-all placeholder:text-ink-3 focus:border-emerald-500"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            className="rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none transition-all placeholder:text-ink-3 focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar al Dashboard'}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-3">o</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface py-3 text-sm font-medium text-ink transition-all hover:bg-canvas active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          {googleLoading ? 'Redirigiendo...' : 'Continuar con Google'}
        </button>
      </div>
    </div>
  );
}
