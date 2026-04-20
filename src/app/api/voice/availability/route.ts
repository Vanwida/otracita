import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlotsFromDB } from '@/lib/availability';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

interface ServiceConfig {
  name: string;
  duration: number;
  price?: number;
}

// chatbotHours is stored as { "lunes": "09:00-20:00", "sabado": "Cerrado", ... }
const DAY_NAMES: Record<number, string> = {
  0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miercoles',
  4: 'jueves', 5: 'viernes', 6: 'sabado',
};

function getHoursForDate(
  date: string,
  chatbotHours: Record<string, string> | null
): { start: string; end: string } | null {
  if (!chatbotHours) return null;
  const d = new Date(`${date}T12:00:00+02:00`);
  const dayName = DAY_NAMES[d.getDay()];
  const val = chatbotHours[dayName];
  if (!val || val.toLowerCase() === 'cerrado') return null;
  const parts = val.split('-');
  if (parts.length !== 2) return null;
  return { start: parts[0].trim(), end: parts[1].trim() };
}

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
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
    s => s.name.toLowerCase() === service.toLowerCase()
  );
  const duration = matched?.duration ?? 30;

  const hours = getHoursForDate(date, client.chatbotHours as Record<string, string> | null);
  if (!hours) {
    // Day is closed or hours not configured
    return NextResponse.json({ slots: [] });
  }

  const blockedDates = (client.blockedDates as string[]) || [];

  try {
    const slots = await getAvailableSlotsFromDB(
      client.id,
      date,
      duration,
      hours,
      barber,
      blockedDates
    );
    return NextResponse.json({ slots: slots.slice(0, 8) });
  } catch (err) {
    console.error('Availability check error:', err);
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
  }
}
