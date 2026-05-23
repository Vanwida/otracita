import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireBarberRole } from '@/lib/auth/require-barber-role';
import BottomNav from './BottomNav';

// -----------------------------------------------------------------------------
// Modo barbero v2 — layout móvil con header de identidad + bottom nav.
//
// Auth: requireBarberRole resuelve la sesión Better Auth con role='barber'.
// Si no hay sesión (o role!='barber'), redirige a /login con next=/yo.
// Si el user está disabled/role='admin' → redirige al destino correspondiente.
// -----------------------------------------------------------------------------

export default async function YoAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // En Next 16, headers() es async.
  const hdrs = await headers();
  // Construimos un Request mínimo a partir de los headers actuales para
  // pasárselo a requireBarberRole (que solo necesita la cookie de sesión).
  const fakeReq = new Request('http://internal/yo', { headers: hdrs });
  const access = await requireBarberRole(fakeReq);

  if (!access.ok) {
    if (access.status === 401) {
      redirect('/login?next=/yo/agenda');
    }
    if (access.status === 403) {
      // role=admin o cuenta revocada/desactivada.
      redirect('/dashboard');
    }
    redirect('/login?next=/yo/agenda&error=invite');
  }

  const { barber, client } = access;

  return (
    <div
      className="min-h-screen bg-canvas text-ink antialiased"
      style={{
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
      }}
    >
      <div className="mx-auto max-w-[480px]">
        <Header
          barberName={barber.name}
          photoUrl={barber.photoUrl}
          businessName={client.businessName}
        />
        <main className="px-4 pb-8 pt-4">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

function Header({
  barberName,
  photoUrl,
  businessName,
}: {
  barberName: string;
  photoUrl: string | null;
  businessName: string | null;
}) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-3 bg-canvas/95 px-4 py-3 backdrop-blur"
      style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={barberName}
          className="h-11 w-11 rounded-full border border-line object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-ink-2">
          {barberName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Greeting name={barberName} />
        {businessName && (
          <p className="truncate text-xs text-ink-3">{businessName}</p>
        )}
      </div>
    </header>
  );
}

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? 'Buenas noches'
      : hour < 13
        ? 'Buenos días'
        : hour < 20
          ? 'Buenas tardes'
          : 'Buenas noches';
  const firstName = name.split(' ')[0];
  return (
    <p className="truncate text-base font-semibold text-ink">
      {greeting}, {firstName}
    </p>
  );
}
