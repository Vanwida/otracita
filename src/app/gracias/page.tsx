'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Wordmark } from '@/components/brand';

// -----------------------------------------------------------------------------
// /gracias — post-checkout de Stripe.
//
// Flow: barbero paga → Stripe redirige aquí con session_id → pre-cargamos su
// email vía /api/session-info (readOnly) → pide solo contraseña → POST
// /api/auth/create-account verifica pago + email + crea cuenta → redirige al
// setup wizard.
//
// UX 2026:
//   · Email pre-rellenado y bloqueado (viene de Stripe).
//   · Password 8 chars min, un solo campo con toggle mostrar/ocultar.
//   · Expectativas claras: dashboard YA funciona; bot WhatsApp lo activamos
//     nosotros en paralelo.
// -----------------------------------------------------------------------------

const MIN_PASSWORD_LENGTH = 8;

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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingSession, setFetchingSession] = useState(false);
  const [error, setError] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);

  // Fetch session info from Stripe — pre-llena email + plan.
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
        setError('No se pudo verificar tu sesión de pago.');
      })
      .finally(() => setFetchingSession(false));
  }, [sessionId]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
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

      // Transición rápida al setup — el barbero ya leyó el mensaje de éxito,
      // no hay necesidad de hacerle esperar 4s.
      setTimeout(() => {
        router.push('/dashboard/setup');
      }, 1500);
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

  // ── Estado: cuenta recién creada ────────────────────────────────────────
  if ((sessionId || isDemo) && accountCreated) {
    return (
      <ThankYouShell>
        <div className="mx-auto w-full max-w-lg">
          <CheckIcon />
          <h1 className="font-display mt-8 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Cuenta creada
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-ink-2">
            Te llevamos al asistente de configuración.
          </p>
          <p className="mt-8 text-sm text-ink-3">
            <Spinner /> Redirigiendo…
          </p>
        </div>
      </ThankYouShell>
    );
  }

  // ── Estado: formulario de crear cuenta ──────────────────────────────────
  if (sessionId || isDemo) {
    return (
      <ThankYouShell>
        <div className="mx-auto w-full max-w-md">
          <CheckIcon />

          <h1 className="font-display mt-8 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Bienvenido a otracita
          </h1>
          <p className="mt-4 text-ink-2">
            Pago confirmado. Elige tu contraseña para entrar al panel y
            configurar tu cuenta.
          </p>

          {plan && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-softer border border-brand/20 px-4 py-1.5 text-xs font-bold text-brand uppercase tracking-widest">
              Plan: {plan}
            </div>
          )}

          {fetchingSession ? (
            <div className="mt-10 flex items-center justify-center gap-3 text-ink-2">
              <Spinner />
              Verificando pago…
            </div>
          ) : (
            <form onSubmit={handleCreateAccount} className="mt-10 space-y-4">
              {/* Email — readOnly cuando viene de Stripe (el pago lo fija) */}
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-sm font-medium text-ink-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!sessionId}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  className={`rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none transition-all ${
                    sessionId
                      ? 'text-ink-2 cursor-not-allowed'
                      : 'text-ink focus:border-brand focus:ring-2 focus:ring-brand/20'
                  }`}
                />
                {sessionId && (
                  <p className="text-xs text-ink-3">
                    Usaremos este email (el que pagó en Stripe) como tu acceso.
                  </p>
                )}
              </div>

              {/* Password con toggle mostrar/ocultar */}
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-sm font-medium text-ink-2">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-3 pr-10 text-sm text-ink outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-ink-3 hover:text-ink-2 hover:bg-overlay transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email || password.length < MIN_PASSWORD_LENGTH}
                className="w-full rounded-lg bg-brand py-3.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Creando cuenta…
                  </>
                ) : (
                  'Entrar al panel'
                )}
              </button>
            </form>
          )}

          <ActivationExpectations className="mt-10" />
        </div>
      </ThankYouShell>
    );
  }

  // ── Vista genérica (sin session_id ni demo) — raro, mensaje neutro ─────
  return (
    <ThankYouShell>
      <CheckIcon />
      <h1 className="font-display mt-8 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Gracias
      </h1>
      <p className="mx-auto mt-6 max-w-lg text-lg text-ink-2">
        Si acabas de suscribirte, revisa tu email para acceder al panel. Si
        has entrado aquí por error, vuelve al inicio.
      </p>
      <Link
        href="/"
        className="mt-12 inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-lg font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
      >
        Volver al inicio
      </Link>
    </ThankYouShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function ThankYouShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-20 text-center text-ink">
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
    <svg className="h-4 w-4 animate-spin inline-block" viewBox="0 0 24 24" fill="none">
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

/**
 * Comunica expectativas realistas del producto tras crear cuenta:
 *   · Dashboard + agenda + facturación + PWA pública funcionan YA
 *   · Bot de WhatsApp requiere activación técnica paralela (nosotros)
 */
function ActivationExpectations({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 text-left ${className}`}>
      <p className="text-sm leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">Tu panel estará listo en cuanto completes la configuración.</span>{' '}
        Podrás recibir reservas desde tu link público, emitir facturas y
        gestionar tu agenda inmediatamente.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">El bot de WhatsApp</span> lo
        activamos nosotros en paralelo con tu número (trámite con Meta). Te
        avisamos cuando pueda responder a tus clientes.
      </p>
    </div>
  );
}
