import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { client } = access;

  let body: { action: 'add' | 'remove'; date: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, date } = body;

  if (!action || !date) {
    return NextResponse.json({ error: 'Missing action or date' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const current: string[] = (client.blockedDates as string[]) || [];

  let updated: string[];
  if (action === 'add') {
    if (current.includes(date)) {
      return NextResponse.json({ error: 'Date already blocked' }, { status: 409 });
    }
    updated = [...current, date].sort();
  } else {
    updated = current.filter(d => d !== date);
  }

  await db
    .update(clients)
    .set({ blockedDates: updated, updatedAt: new Date() })
    .where(eq(clients.id, client.id));

  // Los días bloqueados se renderizan en la PWA pública (date picker oculta
  // esas fechas). Sin revalidate, el cliente podría seguir viendo una fecha
  // ya bloqueada como disponible hasta el siguiente full reload.
  const { revalidatePath } = await import('next/cache');
  if (client.publicSlug) {
    revalidatePath(`/${client.publicSlug}`);
  }
  revalidatePath('/[slug]', 'page');

  return NextResponse.json({ ok: true, blockedDates: updated });
}
