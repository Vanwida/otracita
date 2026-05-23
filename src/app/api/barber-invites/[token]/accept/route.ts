import { db } from '@/db';
import { barbers, barberInvites, users } from '@/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { auth } from '@/lib/auth/server';

// -----------------------------------------------------------------------------
// POST /api/barber-invites/[token]/accept — público (no auth previa).
//
// Body: { password: string }
//
// Flujo:
//   1. Resuelve invitación viva por token.
//   2. Carga el barbero (para nombre) y el client (tenant).
//   3. Llama a Better Auth signUpEmail con email del invite + password
//      + name (= barber.name). Better Auth crea el row en `user` con
//      role='admin' por default (additionalFields input:false impide
//      sobrescribirlo desde body).
//   4. UPDATE `user` SET role='barber', clientId, barberId — esto sí
//      lo hacemos server-side directamente porque los additionalFields
//      están bloqueados para input público.
//   5. Marca el invite como aceptado (`acceptedAt = now()`).
//   6. signUpEmail con `autoSignIn=true` (config) ya setea la cookie
//      de sesión, así que el cliente recibe la cookie en la response
//      y puede redirigir a /yo.
// -----------------------------------------------------------------------------

interface AcceptBody {
  password?: unknown;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return Response.json({ error: 'Invitación no válida.' }, { status: 404 });
  }

  let body: AcceptBody;
  try {
    body = (await req.json()) as AcceptBody;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) {
    return Response.json(
      { error: 'La contraseña debe tener al menos 8 caracteres.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const [invite] = await db
    .select()
    .from(barberInvites)
    .where(
      and(
        eq(barberInvites.token, token),
        isNull(barberInvites.acceptedAt),
        isNull(barberInvites.revokedAt),
        gt(barberInvites.expiresAt, now),
      ),
    );
  if (!invite) {
    return Response.json(
      { error: 'Invitación no válida o caducada.' },
      { status: 404 },
    );
  }
  if (!invite.barberId) {
    return Response.json(
      { error: 'Invitación corrupta (sin barbero).' },
      { status: 500 },
    );
  }

  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, invite.barberId));
  if (!barber || !barber.active) {
    return Response.json({ error: 'Barbero no disponible.' }, { status: 404 });
  }

  // ¿Email ya tomado? Mejor detectarlo aquí con mensaje claro que dejar
  // que Better Auth devuelva un genérico.
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, invite.email));
  if (existing) {
    return Response.json(
      { error: 'Ese email ya tiene cuenta. Inicia sesión en /login.' },
      { status: 409 },
    );
  }

  // 1. Crea la cuenta vía Better Auth (con autoSignIn=true del config).
  //    Pasamos `asResponse: true` para que devuelva la Response con la
  //    cookie Set-Cookie (sesión activa).
  let signUpResponse: Response;
  try {
    signUpResponse = await auth.api.signUpEmail({
      body: {
        email: invite.email,
        password,
        name: barber.name || invite.email.split('@')[0],
      },
      asResponse: true,
      headers: req.headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo crear la cuenta.';
    return Response.json({ error: msg }, { status: 500 });
  }
  if (!signUpResponse.ok) {
    // Better Auth devuelve 400/422/etc. con su propio body. Lo
    // pasamos al cliente tal cual.
    return signUpResponse;
  }

  // 2. Promueve el user a role='barber' con clientId/barberId.
  await db
    .update(users)
    .set({
      role: 'barber',
      clientId: invite.clientId,
      barberId: invite.barberId,
      disabledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.email, invite.email));

  // 3. Marca la invitación como aceptada.
  await db
    .update(barberInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(barberInvites.id, invite.id));

  // 4. Devuelve la response de Better Auth — incluye la cookie de sesión.
  //    Reescribimos el body para que el cliente sepa a dónde redirigir.
  const setCookieHeaders = signUpResponse.headers.getSetCookie?.() ?? [];
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const sc of setCookieHeaders) {
    headers.append('Set-Cookie', sc);
  }
  // Fallback para entornos sin getSetCookie (Edge runtime antiguo).
  if (setCookieHeaders.length === 0) {
    const sc = signUpResponse.headers.get('set-cookie');
    if (sc) headers.append('Set-Cookie', sc);
  }

  return new Response(
    JSON.stringify({ ok: true, redirectTo: '/yo' }),
    { status: 200, headers },
  );
}
