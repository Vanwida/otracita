import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leads } from '@/db/schema';

/**
 * Public POST /api/leads — entrada de leads desde la web pública.
 *
 * Validación mínima en el servidor (los clientes pueden y van a enviar
 * basura). No requiere auth (es un formulario público). El admin valida
 * después en /admin/leads y descarta spam vía status='lost'.
 *
 * Body esperado (JSON):
 *   { name, businessName?, phone, email?, message?, source? }
 *
 * Source válidas: website | whatsapp | referral | instagram | other.
 * Cualquier otra se normaliza a 'website'.
 */

const ALLOWED_SOURCES = ['website', 'whatsapp', 'referral', 'instagram', 'other'] as const;

const MAX_LEN = {
  name: 120,
  businessName: 160,
  phone: 40,
  email: 200,
  message: 4000,
  source: 32,
};

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t.length === 0 ? null : t;
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = trimOrNull(payload.name, MAX_LEN.name);
  const phone = trimOrNull(payload.phone, MAX_LEN.phone);
  if (!name) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: 'phone_required' }, { status: 400 });
  }

  const rawSource = trimOrNull(payload.source, MAX_LEN.source) ?? 'website';
  const source = (ALLOWED_SOURCES as readonly string[]).includes(rawSource) ? rawSource : 'website';

  const businessName = trimOrNull(payload.businessName, MAX_LEN.businessName);
  const email = trimOrNull(payload.email, MAX_LEN.email);
  const message = trimOrNull(payload.message, MAX_LEN.message);

  // Email no obligatorio, pero si viene debe parecer un email. No bloqueamos
  // por regex compleja: descartar manualmente en admin si entra basura.
  if (email && !email.includes('@')) {
    return NextResponse.json({ error: 'email_invalid' }, { status: 400 });
  }

  await db.insert(leads).values({
    name,
    phone,
    businessName,
    email,
    message,
    source,
    status: 'new',
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
