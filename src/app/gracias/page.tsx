'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Wordmark } from '@/components/brand';

export default function GraciasPage() {
  return (
    <Suspense
      fallback={
        <ThankYouShell>
          <div className="flex items-center justify-center gap-3 text-gray-400">
            <Spinner />
            Cargando...
          </div>
        </ThankYouShell>
      }
    >
      <GraciasContent />
    </Suspense>
  );
}

function GraciasContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('session_id');
  const isDemo = searchParams.get('demo') === 'true';

  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingSession, setFetchingSession] = useState(false);
  const [error, setError] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);

  // Fetch session info from Stripe
  useEffect(() => {
    if (!sessionId) return;

    setFetchingSession(true);
    fetch(`/api/session-info?session_id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.email) setEmail(data.email);
        if (data.plan) setPlan(data.plan);
      })
      .catch(() => {
        setError('No se pudo verificar tu sesion de pago.');
      })
      .finally(() => setFetchingSession(false));
  }, [sessionId]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, sessionId: sessionId || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la cuenta');
      }

      setAccountCreated(true);

      // Small delay to let the cookie settle, then redirect
      setTimeout(() => {
        router.push('/dashboard/setup');
      }, 500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  // Demo mode — show same account creation flow but with editable email
  if (isDemo && !sessionId) {
    const demoPlan = searchParams.get('plan') || 'chatbot';
    if (!plan) setPlan(demoPlan);
  }

  // Show password creation form for payment OR demo
  if (sessionId || isDemo) {
    if (accountCreated) {
      return (
        <ThankYouShell>
          <CheckIcon />
          <h1 className="mt-8 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Cuenta creada
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg text-gray-400">
            Redirigiendo al panel de configuracion...
          </p>
        </ThankYouShell>
      );
    }

    return (
      <ThankYouShell>
        <div className="mx-auto w-full max-w-md">
          <CheckIcon />

          <h1 className="mt-8 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Bienvenido a otracita
          </h1>
          <p className="mt-4 text-gray-400">
            Tu pago se ha procesado correctamente. Crea tu contrasena para
            acceder al panel de configuracion.
          </p>

          {plan && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-400 uppercase">
              Plan: {plan}
            </div>
          )}

          {fetchingSession ? (
            <div className="mt-10 flex items-center justify-center gap-3 text-gray-400">
              <Spinner />
              Verificando pago...
            </div>
          ) : (
            <form onSubmit={handleCreateAccount} className="mt-10 space-y-5">
              {/* Email (read-only) */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-medium text-gray-300">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!sessionId}
                  placeholder="tu@email.com"
                  required
                  className={`rounded-lg border border-white/10 bg-[#0A0A0A] p-3 text-sm outline-none transition-all ${sessionId ? 'text-gray-400 cursor-not-allowed' : 'text-white focus:border-emerald-500/50 focus:bg-white/5'}`}
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-medium text-gray-300">
                  Contrasena
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  required
                  minLength={6}
                  className="rounded-lg border border-white/10 bg-[#0A0A0A] p-3 text-sm text-white outline-none transition-all focus:border-emerald-500/50 focus:bg-white/5"
                />
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-medium text-gray-300">
                  Confirmar Contrasena
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contrasena"
                  required
                  minLength={6}
                  className="rounded-lg border border-white/10 bg-[#0A0A0A] p-3 text-sm text-white outline-none transition-all focus:border-emerald-500/50 focus:bg-white/5"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-lg bg-emerald-500 py-3.5 text-sm font-bold text-black transition-all hover:bg-emerald-400 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Creando cuenta...
                  </>
                ) : (
                  'Crear mi cuenta'
                )}
              </button>
            </form>
          )}
        </div>
      </ThankYouShell>
    );
  }

  // Generic thank you (no params)
  return (
    <ThankYouShell>
      <CheckIcon />
      <h1 className="mt-8 text-4xl font-bold tracking-tight text-white sm:text-5xl">
        Gracias por confiar en nosotros
      </h1>
      <p className="mx-auto mt-6 max-w-lg text-lg text-gray-400">
        Tu chatbot estara listo en menos de 48 horas. Te contactaremos por
        WhatsApp para configurar todo.
      </p>

      <div className="mt-14 grid gap-6 text-left sm:grid-cols-3">
        <StepItem
          number={1}
          title="Te llamamos"
          description="En las proximas 24 horas nos pondremos en contacto contigo"
        />
        <StepItem
          number={2}
          title="Conectamos tu Booksy"
          description="Sincronizamos tu calendario para que el chatbot vea tus huecos"
        />
        <StepItem
          number={3}
          title="Activamos tu chatbot"
          description="Lo instalamos en tu WhatsApp y lo dejamos funcionando"
        />
      </div>

      <Link
        href="/"
        className="mt-14 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-semibold text-gray-900 transition-all hover:scale-105 hover:bg-gray-200"
      >
        Volver al inicio
      </Link>
    </ThankYouShell>
  );
}

function ThankYouShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-[#0A0A0A] to-[#111]" />

      {/* Logo top-left */}
      <div className="absolute left-6 top-5 z-20">
        <a href="/" className="flex items-center text-white">
          <Wordmark height={32} dividerColor="rgba(247,243,238,0.2)" />
        </a>
      </div>

      <div className="relative z-10 mx-auto max-w-2xl">{children}</div>
    </main>
  );
}

function CheckIcon() {
  return (
    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
      <svg
        className="h-10 w-10 text-emerald-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 13l4 4L19 7"
        />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function StepItem({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#1C1C1C] bg-[#141414] p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm font-bold text-emerald-500">
        {number}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-400">
        {description}
      </p>
    </div>
  );
}
