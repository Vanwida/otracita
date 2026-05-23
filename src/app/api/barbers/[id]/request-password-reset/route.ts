import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { barbers, users } from '@/db/schema';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { auth } from '@/lib/auth';

// -----------------------------------------------------------------------------
// POST /api/barbers/[id]/request-password-reset — admin-only.
//
// Manda al barbero un email con enlace para restablecer su contraseña.
// El admin no ve la contraseña; sólo dispara el flow de Better Auth.
//
// Multi-tenant: el `barberId` viene del path (resuelto contra el tenant del
// caller via `requireClientAccess`). NUNCA aceptamos `email` ni `barberId`
// del body — se resuelven server-side a partir de la sesión + path.
//
// Better Auth hace el resto:
//   1. Genera token de reset (1h vida por defecto).
//   2. Llama a `emailAndPassword.sendResetPassword({ user, url, token })`
//      configurado en `src/lib/auth.ts` — manda email vía Resend.
//   3. La URL del email redirige a `/api/auth/reset-password/[token]` que
//      redirige al `redirectTo` con `?token=...` para que la UI consuma
//      `auth.api.resetPassword`.
// -----------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id: barberId } = await params;

  // 1. El barbero debe pertenecer al tenant del caller.
  const [barber] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.clientId, access.client.id)));
  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado.' }, { status: 404 });
  }

  // 2. Resolver el user Better Auth ligado al barbero.
  const [linkedUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.barberId, barberId), eq(users.role, 'barber')));
  if (!linkedUser) {
    return Response.json(
      { error: 'Este barbero todavía no tiene cuenta. Invítalo primero.' },
      { status: 400 },
    );
  }
  // Defensa en profundidad: el user debe ser del mismo tenant.
  if (linkedUser.clientId && linkedUser.clientId !== access.client.id) {
    return Response.json({ error: 'Barbero no encontrado.' }, { status: 404 });
  }

  // 3. Disparar el flow nativo de Better Auth.
  //    `redirectTo` apunta a la página de login del dashboard, que recibirá
  //    el `?token=` y dejará al barbero crear contraseña nueva.
  try {
    await auth.api.requestPasswordReset({
      body: {
        email: linkedUser.email,
        redirectTo: 'https://www.otracita.es/login',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[barbers/request-password-reset] Better Auth falló:', message);
    return Response.json(
      { error: 'No se pudo enviar el email. Inténtalo de nuevo.' },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, sentTo: linkedUser.email });
}
