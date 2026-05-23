import { db } from '@/db';
import { barbers, barberBlocks } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
  type TenantActorAccess,
} from '@/lib/auth/require-tenant-actor';

// El barbero solo puede gestionar SUS PROPIOS descansos/ausencias. Manager
// con `edit_others_bookings` puede gestionar los del equipo. Admin sin
// restricción. Este helper centraliza el check para los 4 handlers.
function canManageBarberBlocks(
  access: Extract<TenantActorAccess, { ok: true }>,
  targetBarberId: string,
): boolean {
  if (access.isAdmin) return true;
  if (!access.barberId) return false;
  if (access.barberId === targetBarberId) return true;
  return actorHasManagerPermission(access, 'edit_others_bookings');
}

// -----------------------------------------------------------------------------
// /api/barbers/[id]/blocks — bloqueos EXCEPCIONALES de una fecha concreta:
//   · "Falta de disponibilidad" (franja parcial, screenshot 09.39.52)
//   · "Ausencia" de día completo con motivo (screenshot 10.22.23)
//
// GET    → lista; ?from=YYYY-MM-DD&to=YYYY-MM-DD opcional para acotar.
// POST   → crea un bloqueo.
// PATCH  → ?blockId=<uuid> actualiza el bloqueo. Acepta:
//            · startTime/endTime → resize de bordes (U1, franjas parciales).
//            · date              → drag&drop entre días (Reni V1 P3).
//            · barberId          → drag&drop entre columnas de barbero.
//          Día-libre completo (start/end null en DB): solo permite cambio
//          de date y/o barberId — el rango horario queda null. Si la fila
//          tiene rango parcial, se permiten todos los campos. Aditivo,
//          idempotente.
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
  const access = await requireTenantActor(req);
  if (!access.ok) return tenantActorErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });
  if (!canManageBarberBlocks(access, id)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const access = await requireTenantActor(req);
  if (!access.ok) return tenantActorErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });
  if (!canManageBarberBlocks(access, id)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const access = await requireTenantActor(req);
  if (!access.ok) return tenantActorErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });
  if (!canManageBarberBlocks(access, id)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const blockId = searchParams.get('blockId');
  if (!blockId) {
    return Response.json({ error: 'Falta blockId.' }, { status: 400 });
  }

  let body: {
    startTime?: unknown;
    endTime?: unknown;
    date?: unknown;
    barberId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Carga el bloque ANTES de validar campos: necesitamos saber si es
  // día-libre completo (startTime/endTime null) para decidir qué campos
  // son legales. Scope al barbero+tenant (defensa en profundidad).
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

  const isFullDay = row.startTime === null && row.endTime === null;

  // Construimos el patch incremental — solo escribimos los campos que el
  // caller envió explícitamente. Los demás se preservan.
  const patch: {
    startTime?: string;
    endTime?: string;
    date?: string;
    barberId?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  // Rango horario: solo si ambos vienen, y solo si la fila ORIGINAL tenía
  // rango (no era día-libre completo). Mover un día-libre completo NUNCA
  // le añade franja por accidente — eso requiere borrar y recrear.
  const wantsTimes = body.startTime !== undefined || body.endTime !== undefined;
  if (wantsTimes) {
    if (isFullDay) {
      return Response.json(
        { error: 'Un día libre completo no tiene rango horario que cambiar.' },
        { status: 400 },
      );
    }
    if (body.startTime == null || body.endTime == null) {
      return Response.json(
        { error: 'startTime y endTime deben venir juntos.' },
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
    patch.startTime = startTime;
    patch.endTime = endTime;
  }

  // Fecha: drag&drop entre días.
  if (body.date !== undefined) {
    const date = String(body.date);
    if (!DATE_RE.test(date)) {
      return Response.json(
        { error: 'date debe ser YYYY-MM-DD.' },
        { status: 400 },
      );
    }
    patch.date = date;
  }

  // Barbero destino: drag&drop entre columnas. Debe pertenecer al mismo
  // tenant — verificamos cargándolo con loadOwnedBarber. Si el actor es
  // barbero limitado, también debe poder gestionar el barbero destino.
  if (body.barberId !== undefined) {
    const nextBarberId = String(body.barberId);
    if (nextBarberId !== row.barberId) {
      const targetBarber = await loadOwnedBarber(
        access.client.id,
        nextBarberId,
      );
      if (!targetBarber) {
        return Response.json(
          { error: 'Barbero destino no existe.' },
          { status: 404 },
        );
      }
      if (!canManageBarberBlocks(access, nextBarberId)) {
        return Response.json(
          { error: 'No puedes mover el bloqueo a otro barbero.' },
          { status: 403 },
        );
      }
      patch.barberId = nextBarberId;
    }
  }

  // Si el caller no mandó NADA editable, no hay nada que hacer. 400 (en
  // vez de no-op silencioso) facilita debugging al cliente.
  if (
    patch.startTime === undefined &&
    patch.date === undefined &&
    patch.barberId === undefined
  ) {
    return Response.json(
      { error: 'No hay campos para actualizar.' },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(barberBlocks)
    .set(patch)
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
  const access = await requireTenantActor(req);
  if (!access.ok) return tenantActorErrorResponse(access);
  const { id } = await params;

  const barber = await loadOwnedBarber(access.client.id, id);
  if (!barber) return Response.json({ error: 'No existe.' }, { status: 404 });
  if (!canManageBarberBlocks(access, id)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
