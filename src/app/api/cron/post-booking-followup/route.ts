import { db } from '@/db';
import { bookings, clients } from '@/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { requireCron } from '@/lib/auth/require-cron';
import { sendRatingFollowup } from '@/lib/whatsapp/followup';

// -----------------------------------------------------------------------------
// GET /api/cron/post-booking-followup
//
// Scheduled cada 30 min (Vercel Pro). Para barberías con
// `ratings_enabled = true`, encuentra bookings donde:
//   · `status` in ('confirmed', 'completed') — nunca a no-show o cancelled
//   · `followup_sent_at` is null (idempotente — manda una vez)
//   · endsAt + client.followup_minutes_after ≤ now()
//   · endsAt > now() - 6h (ventana corta — el cron va frecuente, no necesitamos
//     barrer 24h hacia atrás; reduce el riesgo de mandar reseñas a citas viejas
//     si por algún motivo el cron estuvo caído un día)
//
// Filtramos por `ratings_enabled` (no tips_enabled): el barbero puede pedir
// reseñas sin tener Stripe Connect ni propinas. Si encima tiene tips
// activos, el flow de propina se inserta dentro del de rating cuando la
// nota es ≥ 4 (lógica en `handleFollowupReply`).
//
// Ships en **dry-run** por defecto (env FOLLOWUP_DRY_RUN). Flip a "false"
// en Vercel env cuando estemos listos para enviar de verdad.
//
// End-of-service se computa con `(date || ' ' || time)::timestamp + duration`
// en Europe/Madrid para alinear con el reloj local de la barbería.
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
        eq(clients.ratingsEnabled, true),
        isNull(bookings.followupSentAt),
        or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'completed')),
        // Ventana: [now - 6h, now]. El cron corre cada 30 min, no necesita
        // mirar 24h atrás. Limitar a 6h reduce el riesgo de mandar reseñas
        // a citas viejas si el cron estuvo caído un rato.
        sql`${triggerAt} <= now()`,
        sql`${triggerAt} > now() - interval '6 hours'`,
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
    const ok = await sendRatingFollowup(client, booking);
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
