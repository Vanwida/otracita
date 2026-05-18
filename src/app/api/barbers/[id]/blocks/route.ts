import { db } from '@/db';
import { barbers, barberBlocks } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// /api/barbers/[id]/blocks — bloqueos EXCEPCIONALES de una fecha concreta:
//   · "Falta de disponibilidad" (franja parcial, screenshot 09.39.52)
//   · "Ausencia" de día completo con motivo (screenshot 10.22.23)
//
// GET    → lista; ?from=YYYY-MM-DD&to=YYYY-MM-DD opcional para acotar.
// POST   → crea un bloqueo.
// DELETE → ?blockId=<uuid> borra uno.
//
// Tenant SIEMPRE vía requireClientAccess — nunca clientId del body
// (convención #1). El barbero debe pertenecer al tenant autenticado.
// -----------------------------------------------------------------------------

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['block', 'absence'] as const;
const REASONS = ['personal', 'enfermedad', 'vacaciones', 'formacion'] as const;

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
    .from(barberBlocks)
    .where(eq(barberBlocks.barberId, id))
    .orderBy(asc(barberBlocks.date), asc(barberBlocks.startTime));

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const filtered = rows.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
  return Response.json({ blocks: filtered });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });

  let body: {
    date?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    kind?: unknown;
    reason?: unknown;
    note?: unknown;
    approved?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const date = String(body.date ?? '');
  if (!DATE_RE.test(date)) {
    return Response.json({ error: 'date debe ser YYYY-MM-DD.' }, { status: 400 });
  }

  const kind = String(body.kind ?? '');
  if (!(KINDS as readonly string[]).includes(kind)) {
    return Response.json({ error: "kind debe ser 'block' o 'absence'." }, { status: 400 });
  }

  // start/end null ⇒ día completo. Si viene uno, deben venir ambos y válidos.
  const hasStart = body.startTime != null && body.startTime !== '';
  const hasEnd = body.endTime != null && body.endTime !== '';
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (hasStart || hasEnd) {
    startTime = String(body.startTime ?? '');
    endTime = String(body.endTime ?? '');
    if (!HHMM_RE.test(startTime) || !HHMM_RE.test(endTime)) {
      return Response.json({ error: 'Horas deben ser HH:MM.' }, { status: 400 });
    }
    if (startTime >= endTime) {
      return Response.json(
        { error: 'El fin debe ser posterior al inicio.' },
        { status: 400 },
      );
    }
  }

  let reason: string | null = null;
  if (body.reason != null && body.reason !== '') {
    const r = String(body.reason);
    if (!(REASONS as readonly string[]).includes(r)) {
      return Response.json({ error: 'reason inválido.' }, { status: 400 });
    }
    reason = r;
  }

  let note: string | null = null;
  if (body.note != null && body.note !== '') {
    note = String(body.note).slice(0, 500);
  }

  const approved = typeof body.approved === 'boolean' ? body.approved : true;

  const [created] = await db
    .insert(barberBlocks)
    .values({
      clientId: access.client.id,
      barberId: id,
      date,
      startTime,
      endTime,
      kind,
      reason,
      note,
      approved,
    })
    .returning();
  return Response.json({ block: created }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const blockId = searchParams.get('blockId');
  if (!blockId) {
    return Response.json({ error: 'Falta blockId.' }, { status: 400 });
  }

  // Scope the delete to the owned barber so a tenant can't delete another
  // tenant's block by id-guessing.
  const [row] = await db
    .select()
    .from(barberBlocks)
    .where(and(eq(barberBlocks.id, blockId), eq(barberBlocks.barberId, id)));
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 });

  await db.delete(barberBlocks).where(eq(barberBlocks.id, blockId));
  return Response.json({ ok: true });
}
