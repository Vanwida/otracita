import { db } from '@/db';
import { sql } from 'drizzle-orm';
import {
  requireManagerPermission,
  managerPermissionErrorResponse,
} from '@/lib/manager-permissions/guard';
import { bookings, productSales, tips } from '@/db/schema';
import { BUSINESS_TIMEZONE } from '@/lib/time';

// -----------------------------------------------------------------------------
// GET /api/yo/finanzas?period=day|week|month
//
// Devuelve ingresos brutos del LOCAL para el periodo solicitado. Gated por
// `view_finances` — operator puro no llega aquí (403). Un manager con
// `view_finances` ve las cifras globales del local (sin desglose por
// barbero — para eso está `/api/yo/equipo` con `view_commissions`).
//
// Composición de "ingresos brutos":
//   · bookings completados — sumamos `price * 100` (foot-gun: bookings.price
//     está en EUROS, todo lo demás en cents).
//   · product_sales no internas (`consumption_kind IS NULL`).
//   · propinas cash entregadas (`tips.payment_method='cash'`).
//
// Devolvemos un mini-histórico (últimos 7 días) para la gráfica simple
// junto al headline.
// -----------------------------------------------------------------------------

function todayInBusinessTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekMondayISO(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function startOfMonthISO(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 7)}-01`;
}

type Period = 'day' | 'week' | 'month';

interface DayTotals {
  date: string;
  bookingsCents: number;
  productsCents: number;
  tipsCashCents: number;
  totalCents: number;
}

async function totalsForRange(
  clientId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<DayTotals[]> {
  const bookingsResult = await db.execute(sql`
    SELECT b.date AS date, COALESCE(SUM(b.price * 100), 0)::bigint AS cents
    FROM ${bookings} b
    WHERE b.client_id = ${clientId}
      AND b.status = 'completed'
      AND b.date >= ${rangeStart}
      AND b.date <= ${rangeEnd}
    GROUP BY b.date
  `);
  const bookingRows = (
    bookingsResult as unknown as { rows: { date: string; cents: string | number }[] }
  ).rows;

  const productResult = await db.execute(sql`
    SELECT (ps.sold_at AT TIME ZONE 'Europe/Madrid')::date AS date,
           COALESCE(SUM(ps.total_cents), 0)::bigint AS cents
    FROM ${productSales} ps
    WHERE ps.client_id = ${clientId}
      AND ps.consumption_kind IS NULL
      AND (ps.sold_at AT TIME ZONE 'Europe/Madrid')::date >= ${rangeStart}::date
      AND (ps.sold_at AT TIME ZONE 'Europe/Madrid')::date <= ${rangeEnd}::date
    GROUP BY (ps.sold_at AT TIME ZONE 'Europe/Madrid')::date
  `);
  const productRows = (
    productResult as unknown as { rows: { date: string; cents: string | number }[] }
  ).rows;

  const tipResult = await db.execute(sql`
    SELECT (t.paid_at AT TIME ZONE 'Europe/Madrid')::date AS date,
           COALESCE(SUM(t.amount_cents), 0)::bigint AS cents
    FROM ${tips} t
    WHERE t.client_id = ${clientId}
      AND t.status = 'paid'
      AND t.payment_method = 'cash'
      AND (t.paid_at AT TIME ZONE 'Europe/Madrid')::date >= ${rangeStart}::date
      AND (t.paid_at AT TIME ZONE 'Europe/Madrid')::date <= ${rangeEnd}::date
    GROUP BY (t.paid_at AT TIME ZONE 'Europe/Madrid')::date
  `);
  const tipRows = (
    tipResult as unknown as { rows: { date: string; cents: string | number }[] }
  ).rows;

  const map = new Map<string, DayTotals>();
  const ensure = (date: string) => {
    let row = map.get(date);
    if (!row) {
      row = {
        date,
        bookingsCents: 0,
        productsCents: 0,
        tipsCashCents: 0,
        totalCents: 0,
      };
      map.set(date, row);
    }
    return row;
  };

  for (const r of bookingRows) {
    ensure(r.date).bookingsCents = Number(r.cents);
  }
  for (const r of productRows) {
    ensure(r.date).productsCents = Number(r.cents);
  }
  for (const r of tipRows) {
    ensure(r.date).tipsCashCents = Number(r.cents);
  }
  for (const row of map.values()) {
    row.totalCents = row.bookingsCents + row.productsCents + row.tipsCashCents;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(req: Request) {
  const access = await requireManagerPermission(req, 'view_finances');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client } = access;

  const url = new URL(req.url);
  const periodRaw = url.searchParams.get('period');
  const period: Period =
    periodRaw === 'week' || periodRaw === 'month' ? periodRaw : 'day';

  const today = todayInBusinessTz();
  let rangeStart: string;
  let rangeEnd: string;
  if (period === 'day') {
    rangeStart = today;
    rangeEnd = today;
  } else if (period === 'week') {
    rangeStart = startOfWeekMondayISO(today);
    rangeEnd = today;
  } else {
    rangeStart = startOfMonthISO(today);
    rangeEnd = today;
  }

  const days = await totalsForRange(client.id, rangeStart, rangeEnd);

  // Histórico (últimos 7 días incluyendo hoy) — siempre, para gráfica.
  const histStart = addDays(today, -6);
  const history = await totalsForRange(client.id, histStart, today);
  // Asegurar que aparezcan los 7 días aunque no haya datos.
  const hist7: DayTotals[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const existing = history.find((h) => h.date === d);
    hist7.push(
      existing ?? {
        date: d,
        bookingsCents: 0,
        productsCents: 0,
        tipsCashCents: 0,
        totalCents: 0,
      },
    );
  }

  const totals = days.reduce(
    (acc, d) => {
      acc.bookingsCents += d.bookingsCents;
      acc.productsCents += d.productsCents;
      acc.tipsCashCents += d.tipsCashCents;
      acc.totalCents += d.totalCents;
      return acc;
    },
    { bookingsCents: 0, productsCents: 0, tipsCashCents: 0, totalCents: 0 },
  );

  return Response.json({
    period,
    range: { start: rangeStart, end: rangeEnd },
    totals,
    history: hist7,
  });
}
