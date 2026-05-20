import { db } from '@/db';
import { barbers, bookings } from '@/db/schema';
import { and, eq, gte, ne } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { BUSINESS_TIMEZONE } from '@/lib/time';

// -----------------------------------------------------------------------------
// /api/barbers/[id]
//
// PATCH  → update fields (name, hours, blockedDates, displayOrder, active).
//          hours / blockedDates accept `null` to mean "inherit shop defaults".
// DELETE → soft-delete (active = false). Keeps historic bookings resolvable.
//          Blocks if the barber has future confirmed bookings — the caller
//          has to reassign them first.
// -----------------------------------------------------------------------------

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function loadOwned(clientId: string, id: string) {
  const [row] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.id, id), eq(barbers.clientId, clientId)));
  return row ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id } = await params;

  const row = await loadOwned(access.client.id, id);
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 });

  let body: {
    name?: unknown;
    photoUrl?: unknown;
    hours?: unknown;
    blockedDates?: unknown;
    displayOrder?: unknown;
    active?: unknown;
    // Perfil Booksy del empleado.
    bio?: unknown;
    role?: unknown;
    permissionLevel?: unknown;
    onlineBookable?: unknown;
    // Perfil de pago — Pro feature, validado abajo.
    salaryType?: unknown;
    salaryBaseCents?: unknown;
    commissionServicesPct?: unknown;
    commissionProductsPct?: unknown;
    chairRentCents?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return Response.json({ error: 'Nombre vacío.' }, { status: 400 });
    if (name.length > 80)
      return Response.json({ error: 'Máximo 80 caracteres.' }, { status: 400 });
    // Conflict with another active barber of same name → reject.
    const clash = await db
      .select()
      .from(barbers)
      .where(
        and(
          eq(barbers.clientId, access.client.id),
          eq(barbers.name, name),
          ne(barbers.id, id),
        ),
      );
    if (clash.length > 0) {
      return Response.json({ error: 'Ya existe un barbero con ese nombre.' }, { status: 409 });
    }
    patch.name = name;
  }

  if ('photoUrl' in body) {
    // Aceptar null (quitar foto) o URL http(s) válida.
    if (body.photoUrl === null || body.photoUrl === '') {
      patch.photoUrl = null;
    } else if (typeof body.photoUrl === 'string') {
      try {
        const u = new URL(body.photoUrl);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
          return Response.json({ error: 'URL inválida.' }, { status: 400 });
        }
        patch.photoUrl = u.toString();
      } catch {
        return Response.json({ error: 'URL inválida.' }, { status: 400 });
      }
    } else {
      return Response.json({ error: 'photoUrl debe ser string o null.' }, { status: 400 });
    }
  }

  if ('hours' in body) {
    // Accept null (inherit) or an object shaped like { "lunes": "10:00-20:00", ... }.
    if (body.hours === null) {
      patch.hours = null;
    } else if (body.hours && typeof body.hours === 'object' && !Array.isArray(body.hours)) {
      patch.hours = body.hours;
    } else {
      return Response.json({ error: 'hours debe ser objeto o null.' }, { status: 400 });
    }
  }

  if ('blockedDates' in body) {
    if (Array.isArray(body.blockedDates)) {
      const clean = body.blockedDates
        .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .slice(0, 200);
      patch.blockedDates = clean;
    } else {
      return Response.json({ error: 'blockedDates debe ser array de YYYY-MM-DD.' }, { status: 400 });
    }
  }

  if ('displayOrder' in body) {
    const n =
      typeof body.displayOrder === 'number'
        ? body.displayOrder
        : Number.parseInt(String(body.displayOrder), 10);
    if (!Number.isFinite(n) || n < 0 || n > 999)
      return Response.json({ error: 'displayOrder inválido.' }, { status: 400 });
    patch.displayOrder = Math.round(n);
  }

  if ('active' in body) {
    if (typeof body.active !== 'boolean')
      return Response.json({ error: 'active debe ser boolean.' }, { status: 400 });
    patch.active = body.active;
  }

  // -- Perfil Booksy del empleado (role / permissionLevel / onlineBookable
  //    / bio). Todos opcionales; defaults en schema cubren lo no enviado.
  if ('bio' in body) {
    if (body.bio === null || body.bio === '') {
      patch.bio = null;
    } else if (typeof body.bio === 'string') {
      patch.bio = body.bio.slice(0, 1000);
    } else {
      return Response.json({ error: 'bio debe ser string o null.' }, { status: 400 });
    }
  }

  if ('role' in body) {
    if (body.role === null || body.role === '') {
      patch.role = null;
    } else if (typeof body.role === 'string') {
      patch.role = body.role.trim().slice(0, 80);
    } else {
      return Response.json({ error: 'role debe ser string o null.' }, { status: 400 });
    }
  }

  if ('permissionLevel' in body) {
    if (body.permissionLevel === 'empleado' || body.permissionLevel === 'admin') {
      patch.permissionLevel = body.permissionLevel;
    } else {
      return Response.json(
        { error: "permissionLevel debe ser 'empleado' o 'admin'." },
        { status: 400 },
      );
    }
  }

  if ('onlineBookable' in body) {
    if (typeof body.onlineBookable !== 'boolean')
      return Response.json(
        { error: 'onlineBookable debe ser boolean.' },
        { status: 400 },
      );
    patch.onlineBookable = body.onlineBookable;
  }

  // -- Perfil de pago (Pro feature, gateado a nivel UI; aquí solo validamos
  //    forma). Si quieres bloqueo estricto por tier, gateamos arriba.
  if ('salaryType' in body) {
    if (body.salaryType === null) {
      patch.salaryType = null;
    } else if (body.salaryType === 'fijo' || body.salaryType === 'mixto' || body.salaryType === 'autonomo') {
      patch.salaryType = body.salaryType;
    } else {
      return Response.json({ error: 'salaryType inválido.' }, { status: 400 });
    }
  }
  for (const field of ['salaryBaseCents', 'chairRentCents'] as const) {
    if (field in body) {
      const v = body[field];
      const n = typeof v === 'number' ? Math.round(v) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_00) {
        return Response.json({ error: `${field} fuera de rango.` }, { status: 400 });
      }
      patch[field] = n;
    }
  }
  for (const field of ['commissionServicesPct', 'commissionProductsPct'] as const) {
    if (field in body) {
      const v = body[field];
      const n = typeof v === 'number' ? Math.round(v) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return Response.json({ error: `${field} debe ser 0-100.` }, { status: 400 });
      }
      patch[field] = n;
    }
  }

  await db.update(barbers).set(patch).where(eq(barbers.id, id));
  const [updated] = await db.select().from(barbers).where(eq(barbers.id, id));
  return Response.json({ barber: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { id } = await params;

  const row = await loadOwned(access.client.id, id);
  if (!row) return Response.json({ error: 'No existe.' }, { status: 404 });

  // Protect against removing a barber with future bookings — el caller las
  // reasigna (o cancela) antes. Una "reserva futura" es una cuyo inicio
  // aún no ha ocurrido: un booking de HOY a las 11:00 con ahora 18:30 ya
  // es pasada y NO bloquea. Comparamos fecha+hora completa.
  const todayStr = today();
  const nowStr = nowHHMM();
  const sameDayOrLater = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.barberId, id),
        gte(bookings.date, todayStr),
        eq(bookings.status, 'confirmed'),
      ),
    );
  const future = sameDayOrLater.filter((b) => {
    if (b.date > todayStr) return true;
    if (b.date < todayStr) return false;
    // mismo día → solo cuenta si la hora aún no ha llegado
    return b.time > nowStr;
  });
  if (future.length > 0) {
    return Response.json(
      {
        error: `No puedes eliminar a ${row.name}: tiene ${future.length} reserva(s) futura(s). Reasígnalas o cancélalas antes.`,
        blockingBookings: future.map((b) => ({
          id: b.id,
          date: b.date,
          time: b.time,
          service: b.service,
          duration: b.duration,
          customerName: b.customerName,
        })),
      },
      { status: 409 },
    );
  }

  // Also prevent leaving the shop with zero active barbers.
  const remaining = await db
    .select()
    .from(barbers)
    .where(
      and(
        eq(barbers.clientId, access.client.id),
        eq(barbers.active, true),
        ne(barbers.id, id),
      ),
    );
  if (remaining.length === 0) {
    return Response.json(
      { error: 'Debe quedar al menos un barbero activo.' },
      { status: 409 },
    );
  }

  await db
    .update(barbers)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(barbers.id, id));
  return Response.json({ ok: true });
}
