import { db } from '@/db';
import { barbers, barberInvites, clients } from '@/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { barberPhotoUrl } from '@/lib/barber-photo-url';
import AcceptInviteClient from './AcceptInviteClient';

// -----------------------------------------------------------------------------
// /aceptar-invitacion/[token] — pantalla pública para que el barbero
// invitado por email cree su cuenta y entre en /yo (#71v2).
//
// El render server resuelve el token contra DB. Si está vivo, pasa los
// datos mínimos al cliente (nombre, foto, business, email). Si no
// existe / caducó / fue revocado → pantalla de error (mensaje genérico,
// sin filtrar la razón).
// -----------------------------------------------------------------------------

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AceptarInvitacionPage({ params }: Props) {
  const { token } = await params;

  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return <ErrorScreen />;
  }

  const now = new Date();
  const [invite] = await db
    .select({
      email: barberInvites.email,
      barberId: barberInvites.barberId,
      clientId: barberInvites.clientId,
      expiresAt: barberInvites.expiresAt,
    })
    .from(barberInvites)
    .where(
      and(
        eq(barberInvites.token, token),
        isNull(barberInvites.acceptedAt),
        isNull(barberInvites.revokedAt),
        gt(barberInvites.expiresAt, now),
      ),
    );

  if (!invite || !invite.barberId) {
    return <ErrorScreen />;
  }

  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, invite.barberId));
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, invite.clientId));

  if (!barber || !barber.active || !client) {
    return <ErrorScreen />;
  }

  return (
    <AcceptInviteClient
      token={token}
      email={invite.email}
      barberName={barber.name}
      barberPhoto={barber.photoUrl ? barberPhotoUrl(barber.id) : null}
      businessName={client.businessName}
    />
  );
}

function ErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 text-warning"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-ink">
          Invitación no válida
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          Este enlace ya no funciona. Puede que haya caducado, que el jefe
          lo haya revocado, o que ya la hayas aceptado.
        </p>
        <p className="mt-4 text-sm text-ink-2">
          Habla con tu jefe para que te mande una nueva invitación.
        </p>
      </div>
    </div>
  );
}
