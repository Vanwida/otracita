export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  // Check existing session
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    redirect('/dashboard');
  }

  async function handleLogin(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) return;

    try {
      // Try sign in first
      const res = await auth.api.signInEmail({
        body: { email, password },
        headers: await headers(),
      });
      if (res) redirect('/dashboard');
    } catch {
      // User might not exist — try sign up
      try {
        await auth.api.signUpEmail({
          body: { email, password, name: email.split('@')[0] },
          headers: await headers(),
        });
        redirect('/dashboard');
      } catch (err) {
        const msg = encodeURIComponent(err instanceof Error ? err.message : 'Error de autenticación');
        redirect(`/login?error=${msg}`);
      }
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#050505] text-[#FAFAFA]">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-xl shadow-2xl shadow-indigo-500/10">
        <div className="mb-8 text-center">
          <img src="/logo.svg" alt="Agendalo Logo" className="mx-auto h-12 w-12" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Acceso Clientes</h2>
          <p className="mt-2 text-sm text-gray-400">Ingresa tu correo y contraseña para acceder.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={handleLogin} className="flex flex-col gap-4">
          <input
            name="email"
            type="email"
            placeholder="correo@tupeluqueria.com"
            required
            className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none transition-all placeholder:text-gray-600 focus:border-indigo-500/50 focus:bg-white/10"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none transition-all placeholder:text-gray-600 focus:border-indigo-500/50 focus:bg-white/10"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-500 py-3 text-sm font-bold text-white transition-all hover:bg-indigo-400 active:scale-95 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          >
            Entrar al Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
