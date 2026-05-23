import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { barbers, users } from '@/db/schema';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import {
  isValidManagerPermission,
  normalizeManagerPermissions,
  type ManagerPermission,
} from '@/lib/manager-permissions';

// -----------------------------------------------------------------------------
// PATCH /api/barbers/[id]/permissions — admin-only.
//
// Edita `user.isManager` y `user.managerPermissions` del usuario Better Auth
// vinculado al barbero (`user.barberId === barberId`). Solo el dueño (admin)
// puede llamar a este endpoint — `requireClientAccess` ya restringe a su
// propio tenant.
//
// Body:
//   {
//     isManager: boolean,
//     managerPermissions: string[]   // se filtra a claves válidas
//   }
//
// Si el barbero NO tiene cuenta Better Auth (no aceptó invitación todavía),
// devolvemos 400 con instrucción explícita — el flow correcto es invitar
// primero y editar permisos cuando el barbero crea su cuenta.
//
// Multi-tenant: el barber se carga filtrando por `clientId = access.client.id`
// y el user se busca por `users.barberId` (que la migración crea con FK al
// tenant — defensa en profundidad). Si por algún error de datos hubiera un
// user con `barberId` apuntando a un barbero de OTRO tenant, el endpoint
// devuelve 404.
// -----------------------------------------------------------------------------

interface Body {
  isManager?: unknown;
  managerPermissions?: unknown;
}

export async function PATCH(
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

  // 2. Body parsing + validación.
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (typeof body.isManager !== 'boolean') {
    return Response.json(
      { error: 'isManager debe ser boolean.' },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.managerPermissions)) {
    return Response.json(
      { error: 'managerPermissions debe ser array.' },
      { status: 400 },
    );
  }

  // Si vinieran entradas no válidas, las rechazamos en vez de filtrarlas en
  // silencio — el caller (UI admin) debería mandar siempre claves válidas y
  // un bug de ese lado debe ser visible.
  for (const v of body.managerPermissions) {
    if (!isValidManagerPermission(v)) {
      return Response.json(
        { error: `Permiso desconocido: ${String(v)}` },
        { status: 400 },
      );
    }
  }

  const normalized: ManagerPermission[] = normalizeManagerPermissions(
    body.managerPermissions,
  );

  // 3. Buscamos el user Better Auth ligado al barbero.
  const [linkedUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.barberId, barberId), eq(users.role, 'barber')));
  if (!linkedUser) {
    return Response.json(
      {
        error:
          'Barbero sin cuenta — invítalo primero por email y vuelve a editar permisos cuando acepte.',
      },
      { status: 400 },
    );
  }
  // Defensa en profundidad: aseguramos que el user pertenece al mismo tenant.
  if (linkedUser.clientId && linkedUser.clientId !== access.client.id) {
    return Response.json({ error: 'Barbero no encontrado.' }, { status: 404 });
  }

  // 4. UPDATE. Si isManager=false, igualmente persistimos el array (vacío o
  //    con claves) para no perder el último estado si el admin lo reactiva.
  await db
    .update(users)
    .set({
      isManager: body.isManager,
      managerPermissions: normalized,
      updatedAt: new Date(),
    })
    .where(eq(users.id, linkedUser.id));

  return Response.json({
    ok: true,
    user: {
      id: linkedUser.id,
      isManager: body.isManager,
      managerPermissions: normalized,
    },
  });
}
