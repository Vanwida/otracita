import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// GET /api/me/landing — devuelve la URL a la que la sesión actual debe ir.
//
// Lo llama la pantalla /login después de un signin exitoso. Centraliza
// el routing por role:
//   · role='barber' (activo)  → /yo/agenda
//   · role='admin' (default)  → /dashboard
//   · disabledAt set          → /login?error=disabled
//   · sin sesión              → /login
//
// Devuelve { redirectTo: string } y NUNCA expone campos sensibles.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  const sessionUserId = session?.user?.id ?? null;

  if (!sessionUserId) {
    return Response.json({ redirectTo: '/login' });
  }

  const [user] = await db.select().from(users).where(eq(users.id, sessionUserId));
  if (!user) {
    return Response.json({ redirectTo: '/login' });
  }
  if (user.disabledAt) {
    // Cerrar sesión sería ideal pero el flow correcto es que el cliente
    // llame a signOut después. Devolvemos /login con mensaje.
    return Response.json({ redirectTo: '/login?error=disabled' });
  }

  const redirectTo = user.role === 'barber' ? '/yo/agenda' : '/dashboard';
  return Response.json({ redirectTo });
}
