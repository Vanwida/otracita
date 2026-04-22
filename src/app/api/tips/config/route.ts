import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// PATCH /api/tips/config
//
// Tenant-authenticated endpoint for the "Propinas y rating" panel on
// /dashboard/negocio?tab=cobros. Body shape:
//
//   { tipsEnabled: boolean,
//     tipsSuggestedCents: number[],   // 1-3 positive ints, each >= 100 (1€)
//     followupMinutesAfter: number }  // 15..240
//
// Validation is defensive — bad values fall back to known-good defaults so
// the barber's flow can't get bricked by UI bugs.
// -----------------------------------------------------------------------------

const DEFAULT_AMOUNTS = [200, 300, 500];
const MIN_CENT = 100;
const MAX_CENT = 10_000;
const MIN_DELAY = 15;
const MAX_DELAY = 240;

interface ConfigBody {
  tipsEnabled?: unknown;
  tipsSuggestedCents?: unknown;
  followupMinutesAfter?: unknown;
}

function sanitizeAmounts(input: unknown): number[] {
  if (!Array.isArray(input)) return DEFAULT_AMOUNTS;
  const cleaned = input
    .map((v) => (typeof v === 'number' ? Math.floor(v) : Number.parseInt(String(v), 10)))
    .filter((n) => Number.isInteger(n) && n >= MIN_CENT && n <= MAX_CENT)
    .slice(0, 3);
  return cleaned.length > 0 ? cleaned : DEFAULT_AMOUNTS;
}

function sanitizeDelay(input: unknown): number {
  const n = typeof input === 'number' ? input : Number.parseInt(String(input), 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(n)));
}

export async function PATCH(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  let body: ConfigBody;
  try {
    body = (await request.json()) as ConfigBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tipsEnabled = body.tipsEnabled === true;
  const tipsSuggestedCents = sanitizeAmounts(body.tipsSuggestedCents);
  const followupMinutesAfter = sanitizeDelay(body.followupMinutesAfter);

  await db
    .update(clients)
    .set({
      tipsEnabled,
      tipsSuggestedCents,
      followupMinutesAfter,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, access.client.id));

  return Response.json({
    ok: true,
    tipsEnabled,
    tipsSuggestedCents,
    followupMinutesAfter,
  });
}
