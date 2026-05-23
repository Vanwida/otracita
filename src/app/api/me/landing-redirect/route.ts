import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// GET /api/me/landing-redirect — mismo decisor de URL que /api/me/landing,
// pero devuelve un 302. Lo usamos como `callbackURL` del signIn social
// (Google). Better Auth nos redirige aquí tras crear/recuperar la sesión,
// y nosotros enrutamos por role.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  const sessionUserId = session?.user?.id ?? null;

  if (!sessionUserId) {
    return Response.redirect(new URL('/login', req.url), 302);
  }

  const [user] = await db.select().from(users).where(eq(users.id, sessionUserId));
  if (!user) {
    return Response.redirect(new URL('/login', req.url), 302);
  }
  if (user.disabledAt) {
    return Response.redirect(new URL('/login?error=disabled', req.url), 302);
  }

  const target = user.role === 'barber' ? '/yo/agenda' : '/dashboard';
  return Response.redirect(new URL(target, req.url), 302);
}
