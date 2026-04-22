import { db } from '@/db';
import { bookings, clients } from '@/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { requireCron } from '@/lib/auth/require-cron';
import { sendRatingMessage } from '@/lib/whatsapp/followup';

// -----------------------------------------------------------------------------
// GET /api/cron/post-booking-followup
//
// Scheduled DAILY at 21:00 Europe/Madrid (Vercel Hobby plan limit — Pro
// would allow hourly or every-10-min for near-real-time followups). For
// barbershops with `tips_enabled = true`, finds bookings where:
//   · `status` is confirmed/completed (never send on cancel/no-show)
//   · `followup_sent_at` is null (idempotent — send once)
//   · booking's end-of-service + client.followup_minutes_after ≤ now()
//   · booking's end-of-service > now() - 24h (window covers one full day
//     of services since the cron only runs once every 24h).
//
// Ships in **dry-run** by default (env FOLLOWUP_DRY_RUN). Flip to "false"
// in Vercel env when ready to start sending real messages.
//
// End-of-service is computed from `(date || ' ' || time)::timestamp + duration`
// in Europe/Madrid so we align with the barbershop's local clock.
// -----------------------------------------------------------------------------

const DRY_RUN = process.env.FOLLOWUP_DRY_RUN !== 'false'; // default ON until flipped

export async function GET(request: Request) {
  const unauth = requireCron(request);
  if (unauth) return unauth;

  const MAX_BATCH = 100;

  // Compose endsAt in SQL to avoid pulling all bookings to JS. We cast
  // date+time as a naive timestamp and interpret it in Madrid time — this
  // matches how the barbershop experiences the booking.
  const endsAtMadrid = sql<string>`((${bookings.date} || ' ' || ${bookings.time})::timestamp AT TIME ZONE 'Europe/Madrid') + (${bookings.duration} || ' minutes')::interval`;
  const triggerAt = sql<string>`${endsAtMadrid} + (${clients.followupMinutesAfter} || ' minutes')::interval`;

  const candidates = await db
    .select({
      booking: bookings,
      client: clients,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        eq(clients.tipsEnabled, true),
        isNull(bookings.followupSentAt),
        or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'completed')),
        // Window: [now - 24h, now]. The upper bound ensures the service
        // actually ended + followup delay elapsed; the lower bound avoids
        // resuscitating days-old bookings.
        sql`${triggerAt} <= now()`,
        sql`${triggerAt} > now() - interval '24 hours'`,
      ),
    )
    .limit(MAX_BATCH);

  if (DRY_RUN) {
    console.log(
      `[cron/post-booking-followup] DRY RUN — ${candidates.length} candidate(s)`,
      candidates.map(({ booking }) => ({
        bookingId: booking.id,
        phone: booking.customerPhone,
      })),
    );
    return Response.json({
      dryRun: true,
      candidateCount: candidates.length,
    });
  }

  let sent = 0;
  let failed = 0;
  for (const { booking, client } of candidates) {
    const ok = await sendRatingMessage(client, booking);
    if (ok) sent++;
    else failed++;
  }

  return Response.json({
    dryRun: false,
    candidateCount: candidates.length,
    sent,
    failed,
  });
}
