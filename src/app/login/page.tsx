import Link from 'next/link';
import LoginForm from './LoginForm';
import ResetPasswordForm from './ResetPasswordForm';
import { Wordmark } from '@/components/brand';

// -----------------------------------------------------------------------------
// /login — server component. Detecta el flow según query string.
//
//   · ?token=<valid>      → form "Pon tu contraseña" (final step del reset).
//   · ?error=INVALID_TOKEN → tarjeta "Enlace caducado" (Better Auth manda
//                            esto cuando el token de reset no existe / expiró).
//   · sin query           → login normal (email + password + Google).
//
// El token completo lo genera Better Auth y la URL del email lo trae como
// `?token=...&callbackURL=https://www.otracita.es/login`. Nuestro callback
// reset-password/[token] redirige aquí con el token validado, listo para que
// el client component lo consuma vía POST /api/auth/reset-password.
// -----------------------------------------------------------------------------

type PageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token.trim() : '';
  const errorCode = typeof sp.error === 'string' ? sp.error : '';

  if (token) {
    return <ResetPasswordForm token={token} />;
  }

  if (errorCode === 'INVALID_TOKEN') {
    return <InvalidTokenCard />;
  }

  return <LoginForm />;
}

function InvalidTokenCard() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center text-ink">
            <Wordmark height={36} />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-ink">
            Enlace caducado
          </h2>
          <p className="mt-2 text-sm text-ink-3">
            Este enlace para crear contraseña ya no es válido. Pide al jefe que
            te mande otro desde la app.
          </p>
        </div>
        <Link
          href="/login"
          className="block w-full rounded-lg border border-line bg-surface py-3 text-center text-sm font-medium text-ink transition-all hover:bg-canvas active:scale-95"
        >
          Ir al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
