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
// PATCH  → ?blockId=<uuid> actualiza startTime/endTime de un bloqueo
//          (U1 — resize por drag de bordes en la agenda). Solo acepta
//          franjas parciales (start+end válidos) — un bloqueo de día
//          completo (start/end null) no se "resizea" porque no tiene
//          rango horario. Aditivo, idempotente.
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
    .where(
      and(
        eq(barberBlocks.clientId, access.client.id),
        eq(barberBlocks.barberId, id),
      ),
    )
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

export async function PATCH(
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

  let body: { startTime?: unknown; endTime?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Solo permitimos editar el rango horario (no kind ni date) — el caso de
  // uso es el resize de bordes en la agenda. Si el caller manda otros
  // campos, los ignoramos silenciosamente.
  if (body.startTime == null || body.endTime == null) {
    return Response.json(
      { error: 'startTime y endTime son obligatorios.' },
      { status: 400 },
    );
  }
  const startTime = String(body.startTime);
  const endTime = String(body.endTime);
  if (!HHMM_RE.test(startTime) || !HHMM_RE.test(endTime)) {
    return Response.json({ error: 'Horas deben ser HH:MM.' }, { status: 400 });
  }
  if (startTime >= endTime) {
    return Response.json(
      { error: 'El fin debe ser posterior al inicio.' },
      { status: 400 },
    );
  }

  // Scope al barbero+tenant: defensa en profundidad (mismo patrón que DELETE).
  // Un bloqueo de día completo (startTime/endTime null en DB) puede recibir
  // un PATCH que le añada franja — es un caso degenerado pero válido (el
  // barbero decidió convertir "día libre" en "ausencia parcial"). No lo
  // bloqueamos explícitamente.
  const [row] = await db
    .select()
    .from(barberBlocks)
    .where(
      and(
        eq(barberBlocks.clientId, access.client.id),
        eq(barberBlocks.id, blockId),
        eq(barberBlocks.barberId, id),
      ),
    );
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 });

  const [updated] = await db
    .update(barberBlocks)
    .set({ startTime, endTime, updatedAt: new Date() })
    .where(
      and(
        eq(barberBlocks.clientId, access.client.id),
        eq(barberBlocks.id, blockId),
      ),
    )
    .returning();
  return Response.json({ block: updated });
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
  // tenant's block by id-guessing. clientId added as defense-in-depth
  // (consistent with the rest of the codebase) on top of the barberId
  // ownership check above.
  const [row] = await db
    .select()
    .from(barberBlocks)
    .where(
      and(
        eq(barberBlocks.clientId, access.client.id),
        eq(barberBlocks.id, blockId),
        eq(barberBlocks.barberId, id),
      ),
    );
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 });

  await db
    .delete(barberBlocks)
    .where(
      and(
        eq(barberBlocks.clientId, access.client.id),
        eq(barberBlocks.id, blockId),
      ),
    );
  return Response.json({ ok: true });
}
