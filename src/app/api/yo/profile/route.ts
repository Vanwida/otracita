import { db } from '@/db';
import { barbers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireBarberRole,
  barberRoleErrorResponse,
} from '@/lib/auth/require-barber-role';

// -----------------------------------------------------------------------------
// PATCH /api/yo/profile — el barbero edita SU perfil desde la pestaña Tú.
//
// Body: { name?: string, photoUrl?: string }
//
// Scope-limited: solo el barbero current puede editar su propio row.
// Email NO editable aquí — eso debe pasar por el flow estándar de
// Better Auth para mantener verificaciones, sesiones y unicidad.
// -----------------------------------------------------------------------------

interface Body {
  name?: unknown;
  photoUrl?: unknown;
}

export async function PATCH(req: Request) {
  const access = await requireBarberRole(req);
  if (!access.ok) return barberRoleErrorResponse(access);
  const { barber } = access;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const patch: { name?: string; photoUrl?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) {
      return Response.json({ error: 'El nombre no puede estar vacío.' }, { status: 400 });
    }
    if (name.length > 80) {
      return Response.json({ error: 'Máximo 80 caracteres.' }, { status: 400 });
    }
    patch.name = name;
  }

  if (typeof body.photoUrl === 'string') {
    const url = body.photoUrl.trim();
    if (!url) {
      patch.photoUrl = null;
    } else {
      // Validación básica: solo aceptamos URLs http/https.
      try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol)) {
          throw new Error('Solo http(s).');
        }
        patch.photoUrl = url;
      } catch {
        return Response.json({ error: 'URL de foto no válida.' }, { status: 400 });
      }
    }
  }

  if (Object.keys(patch).length === 1) {
    // Solo updatedAt — no hubo campos.
    return Response.json({ ok: true, noChanges: true });
  }

  await db.update(barbers).set(patch).where(eq(barbers.id, barber.id));

  return Response.json({ ok: true });
}
