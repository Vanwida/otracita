// -----------------------------------------------------------------------------
// dashboard-chat tools — whitelist solo lectura de consultas al tenant.
//
// El chat del dashboard (Raúl) puede invocar estas funciones vía function-calling
// del LLM (OpenRouter / deepseek-v4-pro). Cada handler:
//
//   · Recibe `clientId` resuelto del session por el endpoint — NUNCA del LLM.
//     El LLM solo decide QUÉ herramienta invocar, no PARA QUIÉN.
//   · Hace una consulta drizzle simple con WHERE clientId = $clientId.
//   · Devuelve JSON serializable. Si la consulta da 0 filas, devuelve el array
//     vacío + un flag `empty` para que el LLM pueda redactar el "no hay nada".
//   · Nunca lanza — atrapa errores y devuelve `{ error }` para no romper el
//     turno del chat.
//
// Nivel A (V1): solo READ. Si en V2 se añaden mutaciones, irán en otro fichero
// (`actions.ts`) con auditoría y confirm-step en el front.
// -----------------------------------------------------------------------------

import { db } from '@/db';
import {
  bookings,
  customers,
  tips,
  payments,
  products,
} from '@/db/schema';
import { and, eq, gte, lte, isNull, desc, sql } from 'drizzle-orm';
import { getTodayDate } from '@/lib/google-calendar';
import { BUSINESS_TIMEZONE } from '@/lib/time';

// -----------------------------------------------------------------------------
// Tool registry — schemas pasados al LLM (OpenAI/OpenRouter function calling).
// Cualquier tool nueva se añade aquí y en el `dispatchTool` de abajo.
// -----------------------------------------------------------------------------

export const TOOL_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'getBookingsToday',
      description:
        'Lista las citas confirmadas o completadas para HOY (hora Europe/Madrid) del negocio. Útil para "qué tengo hoy", "cuántas citas hay", "cuándo viene Marta".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getRevenueThisWeek',
      description:
        'Suma de ingresos cobrados (payments succeeded) en la semana en curso (lunes a hoy). Devuelve euros totales y desglose por método de pago.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTopClients',
      description:
        'Top N clientes por número de citas completadas este año. Útil para "quiénes son mis mejores clientes".',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Cuántos clientes devolver (max 20).',
            default: 5,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getInactiveClients',
      description:
        'Clientes que NO han venido en los últimos N días pero que tienen historial. Útil para campañas de re-engagement, recordatorios, "quién no viene".',
      parameters: {
        type: 'object',
        properties: {
          daysSince: {
            type: 'number',
            description: 'Mínimo de días desde la última cita.',
            default: 60,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getPendingCardTips',
      description:
        'Propinas cobradas con tarjeta (Stripe) que todavía NO han sido liquidadas al barbero (paid_out_at IS NULL). Agrupado por barbero. Útil para "cuánto le debo al equipo en propinas".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getNoShowsThisMonth',
      description:
        'Lista de no-shows registrados este mes (estado = no_show). Útil para "cuántas planchas llevo este mes".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getProductStockLow',
      description:
        'Productos activos con stock <= threshold. Útil para reposición. Productos con stock NULL (ilimitado) no entran.',
      parameters: {
        type: 'object',
        properties: {
          threshold: {
            type: 'number',
            description: 'Umbral de unidades.',
            default: 5,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getWeeklyNarrativeSummary',
      description:
        'Resumen completo de la semana en curso: citas, ingresos, no-shows, top servicios, clientes nuevos. Útil para responder "cómo va la semana".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getPaymentsByMethod',
      description:
        'Desglose REAL de cobros por método (cash, card_physical, bizum, card_online) en un periodo. Úsalo SIEMPRE que el usuario pregunte "cuántos pagos en efectivo / con tarjeta / con bizum", "cuántos cobros card han sido hoy", etc. NO inventes — si esta tool devuelve 0, dilo claro.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week', 'month'],
            description:
              'Ventana temporal. today=hoy, week=lunes a hoy, month=día 1 a hoy. Por defecto today.',
            default: 'today',
          },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

// -----------------------------------------------------------------------------
// Helpers privados de fecha. Mantenemos todo en Europe/Madrid porque el dueño
// del negocio razona en wall-clock, no en UTC.
// -----------------------------------------------------------------------------

/** Devuelve `YYYY-MM-DD` del lunes de la semana en curso (Europe/Madrid). */
function getMondayYMD(): string {
  const today = new Date();
  // getDay() devuelve 0=Dom..6=Sab pero en local-server (UTC). Trabajamos en
  // Madrid para que "esta semana" coincida con lo que ve el barbero.
  const madridStr = today.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE });
  const madrid = new Date(madridStr);
  const day = madrid.getDay(); // 0..6
  const diff = (day + 6) % 7; // días que han pasado desde el lunes
  madrid.setDate(madrid.getDate() - diff);
  // toLocaleDateString en-CA → YYYY-MM-DD
  return madrid.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

/** Devuelve `YYYY-MM-DD` del día 1 del mes en curso (Europe/Madrid). */
function getFirstDayOfMonthYMD(): string {
  const today = getTodayDate(); // YYYY-MM-DD
  return `${today.slice(0, 7)}-01`;
}

/** Devuelve `YYYY-MM-DD` del 1 de enero del año en curso. */
function getFirstDayOfYearYMD(): string {
  const today = getTodayDate();
  return `${today.slice(0, 4)}-01-01`;
}

/** Convierte céntimos → "12,34 €" (formato español). */
function formatEuros(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

// -----------------------------------------------------------------------------
// Tools — implementación
// -----------------------------------------------------------------------------

export async function getBookingsToday(clientId: string) {
  const today = getTodayDate();
  const rows = await db
    .select({
      id: bookings.id,
      time: bookings.time,
      service: bookings.service,
      barber: bookings.barber,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      status: bookings.status,
      duration: bookings.duration,
      priceEuros: bookings.price,
    })
    .from(bookings)
    .where(and(eq(bookings.clientId, clientId), eq(bookings.date, today)))
    .orderBy(bookings.time);

  return {
    date: today,
    total: rows.length,
    bookings: rows,
  };
}

export async function getRevenueThisWeek(clientId: string) {
  const monday = getMondayYMD();
  // payments.paidAt es timestamp con tz. Filtramos en SQL casteando a fecha
  // Madrid para que el corte semanal coincida con el wall-clock.
  const rows = await db
    .select({
      method: payments.method,
      amountCents: payments.amountCents,
    })
    .from(payments)
    .where(
      and(
        eq(payments.clientId, clientId),
        eq(payments.status, 'succeeded'),
        sql`(${payments.paidAt} AT TIME ZONE ${BUSINESS_TIMEZONE})::date >= ${monday}::date`,
      ),
    );

  let totalCents = 0;
  const byMethod: Record<string, number> = {};
  for (const r of rows) {
    totalCents += r.amountCents;
    const key = r.method ?? 'card_online';
    byMethod[key] = (byMethod[key] ?? 0) + r.amountCents;
  }

  return {
    weekStart: monday,
    totalEuros: totalCents / 100,
    totalFormatted: formatEuros(totalCents),
    paymentsCount: rows.length,
    byMethod: Object.fromEntries(
      Object.entries(byMethod).map(([k, v]) => [k, v / 100]),
    ),
  };
}

export async function getTopClients(clientId: string, limit = 5) {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const yearStart = getFirstDayOfYearYMD();

  // Agrupar por (customerPhone) — el campo estable para identificar al cliente
  // dentro del tenant. customers.totalBookings es global histórico; aquí
  // queremos el año en curso, así que contamos sobre bookings completadas.
  const rows = await db
    .select({
      customerPhone: bookings.customerPhone,
      customerName: bookings.customerName,
      visitsThisYear: sql<number>`COUNT(*)::int`,
      totalRevenueEuros: sql<number>`COALESCE(SUM(${bookings.price}), 0)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.status, 'completed'),
        gte(bookings.date, yearStart),
      ),
    )
    .groupBy(bookings.customerPhone, bookings.customerName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(safeLimit);

  return {
    yearStart,
    clients: rows,
  };
}

export async function getInactiveClients(clientId: string, daysSince = 60) {
  const safeDays = Math.max(7, Math.min(365, Math.floor(daysSince)));
  const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      lastBookingAt: customers.lastBookingAt,
      totalBookings: customers.totalBookings,
    })
    .from(customers)
    .where(
      and(
        eq(customers.clientId, clientId),
        // tiene historial — al menos una cita pasada
        sql`${customers.totalBookings} >= 1`,
        // su última cita fue antes del cutoff
        lte(customers.lastBookingAt, cutoff),
      ),
    )
    .orderBy(desc(customers.totalBookings))
    .limit(20);

  return {
    daysSince: safeDays,
    cutoffDate: cutoff.toISOString().slice(0, 10),
    total: rows.length,
    clients: rows.map((r) => ({
      ...r,
      daysSinceLast: r.lastBookingAt
        ? Math.floor((Date.now() - r.lastBookingAt.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    })),
  };
}

export async function getPendingCardTips(clientId: string) {
  // Card tips = método tarjeta (Stripe) ya cobradas (status paid) pero todavía
  // sin liquidar al barbero (paid_out_at IS NULL). Coincide con el filtro
  // del motor de payroll (ver monthly.ts).
  const rows = await db
    .select({
      barberName: tips.barberName,
      amountCents: tips.amountCents,
    })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, clientId),
        eq(tips.status, 'paid'),
        eq(tips.paymentMethod, 'card'),
        isNull(tips.paidOutAt),
      ),
    );

  const byBarber: Record<string, number> = {};
  let totalCents = 0;
  for (const r of rows) {
    const key = r.barberName ?? 'Sin asignar';
    byBarber[key] = (byBarber[key] ?? 0) + r.amountCents;
    totalCents += r.amountCents;
  }

  return {
    totalEuros: totalCents / 100,
    totalFormatted: formatEuros(totalCents),
    pendingCount: rows.length,
    byBarber: Object.entries(byBarber).map(([barber, cents]) => ({
      barber,
      euros: cents / 100,
      formatted: formatEuros(cents),
    })),
  };
}

export async function getNoShowsThisMonth(clientId: string) {
  const monthStart = getFirstDayOfMonthYMD();
  const today = getTodayDate();
  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      time: bookings.time,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      service: bookings.service,
      barber: bookings.barber,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.status, 'no_show'),
        gte(bookings.date, monthStart),
        lte(bookings.date, today),
      ),
    )
    .orderBy(desc(bookings.date));

  return {
    monthStart,
    total: rows.length,
    bookings: rows,
  };
}

export async function getProductStockLow(clientId: string, threshold = 5) {
  const safeThreshold = Math.max(0, Math.min(100, Math.floor(threshold)));
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      stockQuantity: products.stockQuantity,
      priceCents: products.priceCents,
    })
    .from(products)
    .where(
      and(
        eq(products.clientId, clientId),
        eq(products.active, true),
        // null stock = ilimitado/no trackeado → fuera
        lte(products.stockQuantity, safeThreshold),
      ),
    )
    .orderBy(products.stockQuantity);

  return {
    threshold: safeThreshold,
    total: rows.length,
    products: rows.map((r) => ({
      id: r.id,
      name: r.name,
      stock: r.stockQuantity,
      priceEuros: r.priceCents / 100,
    })),
  };
}

/**
 * Desglose REAL de cobros por método (`payments.method`) en el periodo
 * indicado. Añadido para tapar la alucinación detectada el 2026-05-22:
 * el modelo respondía "los X pagos han sido en efectivo" sin tener
 * acceso a esta info — porque la tool simplemente no existía.
 *
 * Whitelist de `method` viva en payments: cash | card_physical | bizum |
 * card_online. Las filas legacy con method NULL se cuentan como
 * `card_online` (origen Stripe Checkout — única forma de cobro online
 * antes del split-payment).
 */
export async function getPaymentsByMethod(
  clientId: string,
  period: 'today' | 'week' | 'month' = 'today',
) {
  let fromYMD: string;
  if (period === 'today') fromYMD = getTodayDate();
  else if (period === 'week') fromYMD = getMondayYMD();
  else fromYMD = getFirstDayOfMonthYMD();

  const rows = await db
    .select({
      method: payments.method,
      amountCents: payments.amountCents,
    })
    .from(payments)
    .where(
      and(
        eq(payments.clientId, clientId),
        eq(payments.status, 'succeeded'),
        sql`(${payments.paidAt} AT TIME ZONE ${BUSINESS_TIMEZONE})::date >= ${fromYMD}::date`,
      ),
    );

  // Buckets fijos para que el LLM SIEMPRE vea las 4 categorías (aunque
  // alguna sea 0). Si en un futuro entra un método nuevo lo añadiremos
  // explícito — el `_other` evita que se pierda silenciosamente.
  const buckets: Record<string, { count: number; totalCents: number }> = {
    cash: { count: 0, totalCents: 0 },
    card_physical: { count: 0, totalCents: 0 },
    bizum: { count: 0, totalCents: 0 },
    card_online: { count: 0, totalCents: 0 },
    _other: { count: 0, totalCents: 0 },
  };

  for (const r of rows) {
    const key = r.method ?? 'card_online'; // legacy NULL → Stripe Checkout
    const bucket = buckets[key] ?? buckets._other;
    bucket.count += 1;
    bucket.totalCents += r.amountCents;
  }

  const totalCount = rows.length;
  const totalCents = rows.reduce((acc, r) => acc + r.amountCents, 0);

  return {
    period,
    periodStart: fromYMD,
    total: {
      count: totalCount,
      totalEuros: totalCents / 100,
      totalFormatted: formatEuros(totalCents),
    },
    byMethod: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [
        k,
        {
          count: v.count,
          totalEuros: v.totalCents / 100,
          totalFormatted: formatEuros(v.totalCents),
        },
      ]),
    ),
  };
}

export async function getWeeklyNarrativeSummary(clientId: string) {
  const monday = getMondayYMD();
  const today = getTodayDate();

  // Citas de la semana
  const weekBookings = await db
    .select({
      status: bookings.status,
      service: bookings.service,
      customerPhone: bookings.customerPhone,
      priceEuros: bookings.price,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        gte(bookings.date, monday),
        lte(bookings.date, today),
      ),
    );

  const totalBookings = weekBookings.length;
  let completed = 0;
  let noShows = 0;
  let cancelled = 0;
  const serviceCount: Record<string, number> = {};
  const phones = new Set<string>();

  for (const b of weekBookings) {
    phones.add(b.customerPhone);
    if (b.status === 'completed') completed++;
    else if (b.status === 'no_show') noShows++;
    else if (b.status === 'cancelled') cancelled++;
    serviceCount[b.service] = (serviceCount[b.service] ?? 0) + 1;
  }

  // Ingresos
  const revenue = await getRevenueThisWeek(clientId);

  // Top 3 servicios
  const topServices = Object.entries(serviceCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([service, count]) => ({ service, count }));

  // Clientes nuevos (creados esta semana)
  const newCustomersRow = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(customers)
    .where(
      and(
        eq(customers.clientId, clientId),
        gte(customers.createdAt, new Date(`${monday}T00:00:00`)),
      ),
    );
  const newCustomers = newCustomersRow[0]?.c ?? 0;

  return {
    weekStart: monday,
    weekEnd: today,
    bookings: {
      total: totalBookings,
      completed,
      noShows,
      cancelled,
      uniqueCustomers: phones.size,
    },
    revenue: {
      totalEuros: revenue.totalEuros,
      totalFormatted: revenue.totalFormatted,
      paymentsCount: revenue.paymentsCount,
    },
    topServices,
    newCustomers,
  };
}

// -----------------------------------------------------------------------------
// Dispatch — el endpoint llama aquí con el nombre que devolvió el LLM.
// El switch es exhaustivo; cualquier nombre desconocido → error explícito.
// -----------------------------------------------------------------------------

export type ToolName =
  | 'getBookingsToday'
  | 'getRevenueThisWeek'
  | 'getTopClients'
  | 'getInactiveClients'
  | 'getPendingCardTips'
  | 'getNoShowsThisMonth'
  | 'getProductStockLow'
  | 'getWeeklyNarrativeSummary'
  | 'getPaymentsByMethod';

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  clientId: string,
): Promise<unknown> {
  try {
    switch (name as ToolName) {
      case 'getBookingsToday':
        return await getBookingsToday(clientId);
      case 'getRevenueThisWeek':
        return await getRevenueThisWeek(clientId);
      case 'getTopClients':
        return await getTopClients(clientId, Number(args.limit ?? 5));
      case 'getInactiveClients':
        return await getInactiveClients(clientId, Number(args.daysSince ?? 60));
      case 'getPendingCardTips':
        return await getPendingCardTips(clientId);
      case 'getNoShowsThisMonth':
        return await getNoShowsThisMonth(clientId);
      case 'getProductStockLow':
        return await getProductStockLow(clientId, Number(args.threshold ?? 5));
      case 'getWeeklyNarrativeSummary':
        return await getWeeklyNarrativeSummary(clientId);
      case 'getPaymentsByMethod': {
        const raw = String(args.period ?? 'today');
        const period: 'today' | 'week' | 'month' =
          raw === 'week' || raw === 'month' ? raw : 'today';
        return await getPaymentsByMethod(clientId, period);
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[dashboard-chat] tool ${name} failed:`, err);
    return {
      error: 'tool_execution_failed',
      detail: err instanceof Error ? err.message : 'unknown',
    };
  }
}
