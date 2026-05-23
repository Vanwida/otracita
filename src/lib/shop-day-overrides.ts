import { db } from '@/db';
import { clientDayHourOverrides } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import type { DayHourOverrides } from '@/lib/availability-hours';

// -----------------------------------------------------------------------------
// Loader DB para los overrides puntuales del horario del local (tabla
// `client_day_hour_overrides`). Se separa de `availability.ts` para no
// pegar imports `@/db` en código pure-logic — mismo patrón que
// `unavailability-db.ts` para los breaks/blocks de barbero.
//
// El consumidor habitual carga UN único día (la fecha de la reserva que
// está consultando) — devolvemos un mapa { [YYYY-MM-DD]: "HH:MM-HH:MM" |
// "Cerrado" } con UNA entrada (o cero). El formato es `DayHourOverrides`
// para que el motor de availability lo consuma sin transformación.
//
// `loadShopOverridesForDate` está pensado para el flujo de reserva. Para
// la UI del editor (lista de todos los overrides existentes) usar el
// endpoint `/api/day-hour-overrides` que devuelve el array completo.
// -----------------------------------------------------------------------------

/**
 * Devuelve el override del local para `date` (si existe) en formato
 * `DayHourOverrides`. Mapa vacío ⇒ no hay override y el motor cae al
 * recurrente — comportamiento idéntico al pre-feature.
 */
export async function loadShopOverridesForDate(
  clientId: string,
  date: string,
): Promise<DayHourOverrides> {
  const rows = await db
    .select()
    .from(clientDayHourOverrides)
    .where(
      and(
        eq(clientDayHourOverrides.clientId, clientId),
        eq(clientDayHourOverrides.date, date),
      ),
    );
  const out: DayHourOverrides = {};
  for (const r of rows) {
    out[r.date] = r.hours;
  }
  return out;
}

/**
 * Devuelve TODOS los overrides de un local (para listas/editor de admin).
 * Ordenados por fecha asc para que el rendering sea estable.
 */
export async function loadAllShopOverrides(
  clientId: string,
): Promise<Array<{
  id: string;
  date: string;
  hours: string;
  note: string | null;
}>> {
  const rows = await db
    .select()
    .from(clientDayHourOverrides)
    .where(eq(clientDayHourOverrides.clientId, clientId));
  return rows
    .map((r) => ({ id: r.id, date: r.date, hours: r.hours, note: r.note }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
