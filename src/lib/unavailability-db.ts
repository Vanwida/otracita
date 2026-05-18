import { db } from '@/db';
import { barberBreaks, barberBlocks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import type { BarberUnavailability } from '@/lib/unavailability';

// -----------------------------------------------------------------------------
// DB loader for unavailability. Split out from the pure `unavailability.ts` so
// that file stays free of `@/` imports and runs under `node --test` like the
// other pure-logic modules. The interval math + types live there; this file
// only fetches rows.
// -----------------------------------------------------------------------------

/**
 * Load every active barber's recurring breaks + the date's blocks for a shop
 * in TWO queries (mirrors how availability.ts loads the day's bookings in one
 * query rather than one-per-barber). Returns a map keyed by barberId; barbers
 * with no rows are simply absent ⇒ caller treats them as fully available, the
 * same behaviour as before this feature.
 */
export async function loadShopUnavailability(
  clientId: string,
  date: string,
): Promise<Map<string, BarberUnavailability>> {
  const [breakRows, blockRows] = await Promise.all([
    db.select().from(barberBreaks).where(eq(barberBreaks.clientId, clientId)),
    db
      .select()
      .from(barberBlocks)
      .where(and(eq(barberBlocks.clientId, clientId), eq(barberBlocks.date, date))),
  ]);

  const map = new Map<string, BarberUnavailability>();
  const ensure = (barberId: string): BarberUnavailability => {
    let entry = map.get(barberId);
    if (!entry) {
      entry = { breaks: [], blocks: [] };
      map.set(barberId, entry);
    }
    return entry;
  };

  for (const r of breakRows) {
    ensure(r.barberId).breaks.push({
      weekday: r.weekday,
      start: r.startTime,
      end: r.endTime,
    });
  }
  for (const r of blockRows) {
    ensure(r.barberId).blocks.push({
      start: r.startTime,
      end: r.endTime,
    });
  }

  return map;
}
