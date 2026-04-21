'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Wordmark } from '@/components/brand';

export default function GraciasPage() {
  return (
    <Suspense
      fallback={
        <ThankYouShell>
          <div className="flex items-center justify-center gap-3 text-ink-2">
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

      // Give the user a moment to read the activation expectations before
      // bouncing them to the setup wizard.
      setTimeout(() => {
        router.push('/dashboard/setup');
      }, 4000);
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
          <div className="mx-auto w-full max-w-lg">
            <CheckIcon />

            <h1 className="font-display mt-8 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Cuenta creada
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-ink-2">
              Te llevamos al panel para que completes los datos de tu negocio.
            </p>

            <ActivationExpectations className="mt-8" />

            <p className="mt-6 text-sm text-ink-3">
              Redirigiendo al panel de configuracion...
            </p>
          </div>
        </ThankYouShell>
      );
    }

    return (
      <ThankYouShell>
        <div className="mx-auto w-full max-w-md">
          <CheckIcon />

          <h1 className="font-display mt-8 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Bienvenido a otracita
          </h1>
          <p className="mt-4 text-ink-2">
            Tu pago se ha procesado correctamente. Crea tu contrasena para
            acceder al panel de configuracion.
          </p>

          {plan && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-softer border border-brand/20 px-4 py-2 text-sm font-bold text-brand uppercase">
              Plan: {plan}
            </div>
          )}

          {fetchingSession ? (
            <div className="mt-10 flex items-center justify-center gap-3 text-ink-2">
              <Spinner />
              Verificando pago...
            </div>
          ) : (
            <form onSubmit={handleCreateAccount} className="mt-10 space-y-5">
              {/* Email (read-only when from Stripe) */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-medium text-ink-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!sessionId}
                  placeholder="tu@email.com"
                  required
                  className={`rounded-lg border border-line bg-surface p-3 text-sm outline-none transition-all ${
                    sessionId
                      ? 'text-ink-2 cursor-not-allowed'
                      : 'text-ink focus:border-brand focus:ring-2 focus:ring-brand/20'
                  }`}
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-medium text-ink-2">
                  Contrasena
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  required
                  minLength={6}
                  className="rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-medium text-ink-2">
                  Confirmar Contrasena
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contrasena"
                  required
                  minLength={6}
                  className="rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-danger/10 border border-danger/30 p-4 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-lg bg-brand py-3.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          <ActivationExpectations className="mt-10" />
        </div>
      </ThankYouShell>
    );
  }

  // Generic thank you (no params)
  return (
    <ThankYouShell>
      <CheckIcon />
      <h1 className="font-display mt-8 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Gracias por confiar en nosotros
      </h1>
      <p className="mx-auto mt-6 max-w-lg text-lg text-ink-2">
        Tu chatbot estara listo en menos de 48 horas. Te contactaremos por
        WhatsApp para configurar todo.
      </p>

      <div className="mt-14 grid gap-6 text-left sm:grid-cols-3">
        <StepItem
          number={1}
          title="Te escribimos"
          description="En las proximas 24 horas nos pondremos en contacto contigo por WhatsApp"
        />
        <StepItem
          number={2}
          title="Conectamos tu Booksy"
          description="Sincronizamos tu calendario para que el bot vea tus huecos"
        />
        <StepItem
          number={3}
          title="Activamos tu bot"
          description="Lo instalamos en tu WhatsApp y lo dejamos funcionando"
        />
      </div>

      <Link
        href="/"
        className="mt-14 inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-lg font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
      >
        Volver al inicio
      </Link>
    </ThankYouShell>
  );
}

function ThankYouShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-20 text-center text-ink">
      {/* Logo top-left */}
      <div className="absolute left-6 top-5 z-20">
        <Link href="/" className="flex items-center text-ink">
          <Wordmark height={32} inkColor="currentColor" />
        </Link>
      </div>

      <div className="relative z-10 mx-auto max-w-2xl">{children}</div>
    </main>
  );
}

function CheckIcon() {
  return (
    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-success/30 bg-success/10">
      <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-sm font-bold text-brand">
        {number}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{description}</p>
    </div>
  );
}

/**
 * Shared block that sets clear expectations about bot activation timing.
 * Used in both the post-signup success view and after the account is created.
 */
function ActivationExpectations({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-5 text-left ${className}`}
    >
      <p className="text-sm leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">Activamos tu bot en 24 horas.</span>{' '}
        Te escribiremos por WhatsApp cuando este listo para hacer pruebas.
        Mientras tanto, completa los datos de tu negocio en el dashboard.
      </p>
    </div>
  );
}
