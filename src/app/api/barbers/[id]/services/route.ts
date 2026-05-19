import { db } from '@/db';
import { barbers, barberServices } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// /api/barbers/[id]/services — qué servicios HACE el barbero (Booksy
// "SERVICIOS" del detalle de empleado, screenshot 10.16.45/58).
//
// GET → lista los serviceName asignados (vacío = hace TODOS, ver schema).
// PUT → REEMPLAZA el set completo. Mismo patrón que /breaks: el editor
//       guarda la lista entera de una vez ("EDITAR SERVICIOS" → marcar →
//       guardar); reemplazar es atómico y casa con esa UX.
//
// Tenant SIEMPRE vía requireClientAccess — nunca clientId del body
// (convención #1). El barbero debe pertenecer al tenant autenticado. El
// match es por NOMBRE de servicio (catálogo jsonb sin ID estable — mismo
// patrón que loyalty/promos/barberServiceCommissions).
// -----------------------------------------------------------------------------

async function loadOwnedBarber(clientId: string, id: string) {
  const [row] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.id, id), eq(barbers.clientId, clientId)));
  return row ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });

  const rows = await db
    .select()
    .from(barberServices)
    .where(
      and(
        eq(barberServices.clientId, access.client.id),
        eq(barberServices.barberId, id),
      ),
    )
    .orderBy(asc(barberServices.serviceName));
  return Response.json({ services: rows.map((r) => r.serviceName) });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });

  let body: { services?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.services)) {
    return Response.json({ error: 'services debe ser un array.' }, { status: 400 });
  }
  if (body.services.length > 200) {
    return Response.json({ error: 'Demasiados servicios.' }, { status: 400 });
  }

  // Normaliza: strings no vacíos, sin duplicados, ≤120 chars (los nombres
  // del catálogo no son más largos; cap defensivo).
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of body.services) {
    if (typeof raw !== 'string') {
      return Response.json({ error: 'Cada servicio debe ser un string.' }, { status: 400 });
    }
    const name = raw.trim().slice(0, 120);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  // Reemplaza el set completo de forma atómica (igual que /breaks).
  await db.transaction(async (tx) => {
    await tx
      .delete(barberServices)
      .where(
        and(
          eq(barberServices.clientId, access.client.id),
          eq(barberServices.barberId, id),
        ),
      );
    if (names.length > 0) {
      await tx.insert(barberServices).values(
        names.map((serviceName) => ({
          clientId: access.client.id,
          barberId: id,
          serviceName,
        })),
      );
    }
  });

  const rows = await db
    .select()
    .from(barberServices)
    .where(
      and(
        eq(barberServices.clientId, access.client.id),
        eq(barberServices.barberId, id),
      ),
    )
    .orderBy(asc(barberServices.serviceName));
  return Response.json({ services: rows.map((r) => r.serviceName) });
}
