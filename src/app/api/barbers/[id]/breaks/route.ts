import { db } from '@/db';
import { barbers, barberBreaks } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// /api/barbers/[id]/breaks — descansos RECURRENTES semanales del barbero (R12,
// el "Descanso" inset bajo cada día en el editor de turnos, screenshot
// 10.18.21).
//
// GET → lista las filas del barbero (orden weekday, hora).
// PUT → REEMPLAZA el set completo del barbero. El editor de horario guarda la
//       semana entera de una vez ("GUARDAR" sticky de 10.18.57); reemplazar
//       todo es más simple y atómico que diff-ear filas, y casa con esa UX.
//
// Tenant: SIEMPRE vía requireClientAccess — nunca clientId del body
// (convención #1). El barbero debe pertenecer al tenant autenticado.
// -----------------------------------------------------------------------------

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    .from(barberBreaks)
    .where(eq(barberBreaks.barberId, id))
    .orderBy(asc(barberBreaks.weekday), asc(barberBreaks.startTime));
  return Response.json({ breaks: rows });
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

  let body: { breaks?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.breaks)) {
    return Response.json({ error: 'breaks debe ser un array.' }, { status: 400 });
  }
  if (body.breaks.length > 50) {
    return Response.json({ error: 'Demasiados descansos.' }, { status: 400 });
  }

  const clean: {
    clientId: string;
    barberId: string;
    weekday: number;
    startTime: string;
    endTime: string;
  }[] = [];
  for (const raw of body.breaks) {
    if (!raw || typeof raw !== 'object') {
      return Response.json({ error: 'Descanso inválido.' }, { status: 400 });
    }
    const r = raw as Record<string, unknown>;
    const weekday =
      typeof r.weekday === 'number' ? r.weekday : Number.parseInt(String(r.weekday), 10);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return Response.json({ error: 'weekday debe ser 0-6.' }, { status: 400 });
    }
    const startTime = String(r.startTime ?? '');
    const endTime = String(r.endTime ?? '');
    if (!HHMM_RE.test(startTime) || !HHMM_RE.test(endTime)) {
      return Response.json({ error: 'Horas deben ser HH:MM.' }, { status: 400 });
    }
    if (startTime >= endTime) {
      return Response.json(
        { error: 'El fin del descanso debe ser posterior al inicio.' },
        { status: 400 },
      );
    }
    clean.push({
      clientId: access.client.id,
      barberId: id,
      weekday,
      startTime,
      endTime,
    });
  }

  // Replace the whole set atomically.
  await db.transaction(async (tx) => {
    await tx.delete(barberBreaks).where(eq(barberBreaks.barberId, id));
    if (clean.length > 0) {
      await tx.insert(barberBreaks).values(clean);
    }
  });

  const rows = await db
    .select()
    .from(barberBreaks)
    .where(eq(barberBreaks.barberId, id))
    .orderBy(asc(barberBreaks.weekday), asc(barberBreaks.startTime));
  return Response.json({ breaks: rows });
}
