'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Wordmark } from '@/components/brand';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      router.push('/dashboard');
      return;
    }

    // User might not exist — try sign up
    const { error: signUpError } = await authClient.signUp.email({
      email,
      password,
      name: email.split('@')[0],
    });

    if (!signUpError) {
      router.push('/dashboard');
      return;
    }

    setError(signUpError.message || 'Error de autenticación');
    setLoading(false);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
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
      </div>
    </div>
  );
}
