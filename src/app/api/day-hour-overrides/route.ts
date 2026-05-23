import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { clientDayHourOverrides } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { loadAllShopOverrides } from '@/lib/shop-day-overrides';

// -----------------------------------------------------------------------------
// /api/day-hour-overrides — excepciones del horario del LOCAL por fecha
// concreta (#60). Complementa el horario semanal recurrente
// (`clients.chatbotHours`) con overrides puntuales: "el martes 28 abro 9-22
// en vez de 10-20" o "cierro el 1 de mayo".
//
// GET    → lista todos los overrides del local ordenados por fecha asc.
// POST   → upsert (clientId, date) — un solo registro por fecha, si ya
//          existe se actualiza el rango y la nota. Body:
//            { date: 'YYYY-MM-DD', hours: 'HH:MM-HH:MM' | 'Cerrado', note?: string|null }
// DELETE → elimina por fecha (vuelve a regir el recurrente). Body:
//            { date: 'YYYY-MM-DD' }
//
// Tras cada mutación se revalida `/[slug]` para que la PWA pública
// refleje el cambio sin esperar al siguiente deploy.
// -----------------------------------------------------------------------------

const TIME_RANGE_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidHoursValue(value: string): boolean {
  if (value === 'Cerrado') return true;
  if (!TIME_RANGE_RE.test(value)) return false;
  // Aseguramos start < end. Sin esto un dueño podría meter "20:00-10:00" y
  // el motor parsearia rangos negativos.
  const [a, b] = value.split('-');
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return ah * 60 + am < bh * 60 + bm;
}

async function revalidateSlug(publicSlug: string | null) {
  const { revalidatePath } = await import('next/cache');
  if (publicSlug) revalidatePath(`/${publicSlug}`);
  revalidatePath('/[slug]', 'page');
}

export async function GET(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const rows = await loadAllShopOverrides(access.client.id);
  return NextResponse.json({ overrides: rows });
}

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  let body: { date?: unknown; hours?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const hours = typeof body.hours === 'string' ? body.hours.trim() : '';
  const note =
    typeof body.note === 'string'
      ? body.note.trim().slice(0, 200) || null
      : body.note === null
        ? null
        : null;

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date inválido (YYYY-MM-DD).' }, { status: 400 });
  }
  if (!isValidHoursValue(hours)) {
    return NextResponse.json(
      { error: 'hours inválido. Usa "HH:MM-HH:MM" (start < end) o "Cerrado".' },
      { status: 400 },
    );
  }

  // Upsert: hay UNIQUE (client_id, date) — si ya existe, actualizamos.
  const existing = await db
    .select()
    .from(clientDayHourOverrides)
    .where(
      and(
        eq(clientDayHourOverrides.clientId, access.client.id),
        eq(clientDayHourOverrides.date, date),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(clientDayHourOverrides)
      .set({ hours, note, updatedAt: new Date() })
      .where(eq(clientDayHourOverrides.id, existing[0].id));
  } else {
    await db.insert(clientDayHourOverrides).values({
      clientId: access.client.id,
      date,
      hours,
      note,
    });
  }

  await revalidateSlug(access.client.publicSlug);

  const overrides = await loadAllShopOverrides(access.client.id);
  return NextResponse.json({ ok: true, overrides });
}

export async function DELETE(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  let body: { date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date inválido (YYYY-MM-DD).' }, { status: 400 });
  }

  await db
    .delete(clientDayHourOverrides)
    .where(
      and(
        eq(clientDayHourOverrides.clientId, access.client.id),
        eq(clientDayHourOverrides.date, date),
      ),
    );

  await revalidateSlug(access.client.publicSlug);

  const overrides = await loadAllShopOverrides(access.client.id);
  return NextResponse.json({ ok: true, overrides });
}
