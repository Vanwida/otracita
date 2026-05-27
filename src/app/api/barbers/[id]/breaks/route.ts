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
    .where(
      and(
        eq(barberBreaks.clientId, access.client.id),
        eq(barberBreaks.barberId, id),
      ),
    )
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
  // Copy castellano-de-barbero — estos mensajes llegan al editor del
  // dashboard tal cual. Nada de "weekday" ni "HH:MM" en texto al usuario.
  if (!Array.isArray(body.breaks)) {
    return Response.json({ error: 'Formato de descansos inválido.' }, { status: 400 });
  }
  if (body.breaks.length > 50) {
    return Response.json(
      { error: 'Demasiados descansos (máximo 50).' },
      { status: 400 },
    );
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
      return Response.json({ error: 'Hay un descanso con datos inválidos.' }, { status: 400 });
    }
    const r = raw as Record<string, unknown>;
    const weekday =
      typeof r.weekday === 'number' ? r.weekday : Number.parseInt(String(r.weekday), 10);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return Response.json(
        { error: 'Hay un descanso asignado a un día inválido.' },
        { status: 400 },
      );
    }
    const startTime = String(r.startTime ?? '');
    const endTime = String(r.endTime ?? '');
    if (!HHMM_RE.test(startTime) || !HHMM_RE.test(endTime)) {
      return Response.json(
        { error: 'Las horas de un descanso no son válidas (debe ser tipo 13:00).' },
        { status: 400 },
      );
    }
    if (startTime >= endTime) {
      return Response.json(
        { error: `Un descanso (${startTime}–${endTime}) no es válido: el fin debe ser posterior al inicio.` },
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

  // Replace the whole set: DELETE-then-INSERT secuencial. El driver
  // neon-http NO soporta `db.transaction` (lanza "No transactions support
  // in neon-http driver" en runtime, lo que provocaba 500 ⇒ el cliente
  // mostraba "Se guardó el horario pero los descansos no" — task #100,
  // feedback Reni 2026-05-26). Mismo trade-off que `record-tip.ts` /
  // `customers/import.ts`: si el INSERT falla tras el DELETE el barbero
  // queda sin descansos, pero el caller (ScheduleEditorModal) reintenta
  // el PUT completo, por lo que la inconsistencia se recupera con un
  // segundo guardado.
  await db
    .delete(barberBreaks)
    .where(
      and(
        eq(barberBreaks.clientId, access.client.id),
        eq(barberBreaks.barberId, id),
      ),
    );
  if (clean.length > 0) {
    await db.insert(barberBreaks).values(clean);
  }

  const rows = await db
    .select()
    .from(barberBreaks)
    .where(
      and(
        eq(barberBreaks.clientId, access.client.id),
        eq(barberBreaks.barberId, id),
      ),
    )
    .orderBy(asc(barberBreaks.weekday), asc(barberBreaks.startTime));
  return Response.json({ breaks: rows });
}
