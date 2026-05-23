import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { bookings, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { isAdminUser } from '@/lib/auth/admin';

// -----------------------------------------------------------------------------
// requireBookingOwnership — guard compartido para operaciones sobre una
// cita (cobrar, propinar, marcar no-show, marcar inicio).
//
// Reglas:
//   · Admin (operador o dueño con email aistudios.pro / alex*) puede operar
//     sobre cualquier cita del tenant que tenga acceso (vía `clientId`
//     del booking — verificado por el caller via requireClientAccess).
//   · role='barber' solo puede operar sobre citas donde
//     `bookings.barberId === user.barberId`.
//
// El motivo de centralizar: el modo barbero v2 reutiliza los endpoints
// /api/bookings/[id]/* del admin. Sin guard, un barbero podría operar
// sobre una cita de otro miembro del equipo. Este helper aplica el filtro.
// -----------------------------------------------------------------------------

export type BookingRow = typeof bookings.$inferSelect;

export type BookingOwnershipAccess =
  | {
      ok: true;
      booking: BookingRow;
      /** El user actor (admin o barber). Útil para auditar quién hizo qué. */
      user: { id: string; email: string; role: 'admin' | 'barber' };
      /** `true` si el caller es admin (sin restricción de ownership). */
      isAdmin: boolean;
      /** El `barbers.id` del actor si role='barber'. null para admins. */
      barberId: string | null;
    }
  | {
      ok: false;
      status: 401 | 403 | 404;
      error: string;
    };

interface RequireBookingOwnershipOptions {
  /** clientId del tenant — el booking debe pertenecer a este tenant. */
  clientId: string;
  bookingId: string;
}

export async function requireBookingOwnership(
  request: Request,
  options: RequireBookingOwnershipOptions,
): Promise<BookingOwnershipAccess> {
  const session = await auth.api.getSession({ headers: request.headers });
  const sessionUserId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email ?? null;

  if (!sessionUserId || !sessionEmail) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const [user] = await db.select().from(users).where(eq(users.id, sessionUserId));
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (user.disabledAt) {
    return { ok: false, status: 401, error: 'Cuenta desactivada.' };
  }

  const isAdmin = isAdminUser(session);

  const [booking] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.id, options.bookingId),
        eq(bookings.clientId, options.clientId),
      ),
    );
  if (!booking) {
    return { ok: false, status: 404, error: 'Reserva no encontrada.' };
  }

  if (isAdmin) {
    return {
      ok: true,
      booking,
      user: { id: user.id, email: sessionEmail, role: 'admin' },
      isAdmin: true,
      barberId: null,
    };
  }

  // No-admin: solo si role='barber' y la cita pertenece a su barberId.
  if (user.role !== 'barber') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (!user.barberId) {
    return { ok: false, status: 403, error: 'Cuenta sin barbero asignado.' };
  }
  if (booking.barberId !== user.barberId) {
    return { ok: false, status: 403, error: 'Esta cita no es tuya.' };
  }

  return {
    ok: true,
    booking,
    user: { id: user.id, email: sessionEmail, role: 'barber' },
    isAdmin: false,
    barberId: user.barberId,
  };
}

export function bookingOwnershipErrorResponse(
  access: Extract<BookingOwnershipAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status });
}
