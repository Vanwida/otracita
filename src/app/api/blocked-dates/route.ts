import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const { data: session } = await auth.getSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email));

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
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

  return NextResponse.json({ ok: true, blockedDates: updated });
}
