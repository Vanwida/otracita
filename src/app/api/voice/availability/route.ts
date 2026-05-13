import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { barbers as barbersTable } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getAvailableSlotsFromDB } from '@/lib/availability';
import type { BarberConfig } from '@/lib/whatsapp/config';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { requireFeature } from '@/lib/billing/tier';

interface ServiceConfig {
  name: string;
  duration: number;
  price?: number;
}

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const gate = requireFeature(access.client, 'recepcionistaIA');
  if (gate) return gate;
  const { client } = access;

  let body: { date: string; service: string; barber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { date, service, barber } = body;

  if (!date || !service) {
    return NextResponse.json({ error: 'Missing date or service' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const services = (client.chatbotServices as ServiceConfig[]) || [];
  const matched = services.find(
    (s) => s.name.toLowerCase() === service.toLowerCase(),
  );
  const duration = matched?.duration ?? 30;

  const activeBarbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name));
  const barberConfigs: BarberConfig[] = activeBarbers.map((b) => ({
    id: b.id,
    name: b.name,
    hours: (b.hours as Record<string, string> | null) ?? null,
    blockedDates: (b.blockedDates as string[]) ?? [],
    displayOrder: b.displayOrder,
  }));

  // Resolve barber name to id for per-barber filtering; falls back to "any"
  // when the voice pipeline didn't capture a valid name.
  let barberId: string | null = null;
  if (barber && barber.trim()) {
    const match = barberConfigs.find(
      (b) => b.name.trim().toLowerCase() === barber.trim().toLowerCase(),
    );
    if (match) barberId = match.id;
  }

  try {
    const slots = await getAvailableSlotsFromDB({
      clientId: client.id,
      date,
      serviceDuration: duration,
      shopHours: (client.chatbotHours as Record<string, string> | null) ?? null,
      shopBlockedDates: (client.blockedDates as string[]) ?? [],
      barbers: barberConfigs,
      barberId,
      minLeadTimeMinutes: client.minLeadTimeMinutes,
      serviceBufferMinutes: client.serviceBufferMinutes,
      maxBookingHorizonDays: client.maxBookingHorizonDays,
      slotStepMinutes: client.slotStepMinutes,
    });
    return NextResponse.json({ slots: slots.slice(0, 8) });
  } catch (err) {
    console.error('Availability check error:', err);
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
  }
}
