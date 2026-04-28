import { db } from '@/db'
import { cashSessions, bookings, productSales } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/cash/open — abre una nueva sesión de caja para el cliente.
//
// Body: { openingCents: number (>= 0) }
//
// Reglas:
//   · El cliente debe tener `cashRegisterEnabled = true`.
//   · No puede haber otra sesión abierta — el UNIQUE partial idx
//     `cash_sessions_one_open_per_client` ya lo garantiza a nivel DB; aquí
//     devolvemos un 409 amistoso si choca.
//   · `opening_cents` puede ser 0 (algunos locales no dejan cambio).
//
// Backfill automático de movimientos del día:
//   Cuando el barbero abre caja a media mañana (no nada más empezar),
//   los servicios completados ANTES de la apertura ya tienen método de
//   pago grabado pero no han generado cash_movement (no había sesión).
//   Para que el cuadre del día sea completo, al abrir caja importamos:
//
//     · bookings WHERE status='completed' AND date=today AND
//       payment_method IS NOT NULL AND ningún movement los enlaza
//     · product_sales WHERE sold_at::date=today AND ningún movement
//       los enlaza
//
//   Esto cierra el foot-gun de "abrí caja tarde y me faltan ingresos".
// -----------------------------------------------------------------------------

interface Body {
  openingCents?: unknown
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, user } = access

  if (!client.cashRegisterEnabled) {
    return Response.json(
      { error: 'La caja efectivo no está activa para este negocio.' },
      { status: 403 },
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const openingCents =
    typeof body.openingCents === 'number'
      ? body.openingCents
      : Number.parseInt(String(body.openingCents ?? ''), 10)
  if (!Number.isFinite(openingCents) || openingCents < 0 || openingCents > 1_000_000) {
    return Response.json(
      { error: 'Importe de apertura inválido (0 – 10.000 €)' },
      { status: 400 },
    )
  }

  try {
    const [session] = await db
      .insert(cashSessions)
      .values({
        clientId: client.id,
        openingCents,
        openedByEmail: user.email,
      })
      .returning()

    const backfilled = await backfillTodayMovements(client.id, session.id)

    return Response.json({ session, backfilled }, { status: 201 })
  } catch (err) {
    // UNIQUE partial idx (closed_at IS NULL) → ya hay una sesión abierta.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('cash_sessions_one_open_per_client')) {
      return Response.json(
        { error: 'Ya hay una sesión de caja abierta. Ciérrala antes de abrir otra.' },
        { status: 409 },
      )
    }
    console.error('[cash/open] insert failed:', err)
    return Response.json({ error: 'No se pudo abrir la caja' }, { status: 500 })
  }
}

/**
 * Importa al cash_movements de la sesión recién abierta:
 *   1. Bookings completed de HOY con payment_method seteado y sin
 *      movement enlazado (servicios cerrados antes de abrir caja).
 *   2. Product sales de HOY sin movement enlazado.
 *
 * Idempotente vía LEFT JOIN + IS NULL: si ya existe un movement con
 * (reference_type, reference_id) matching, no duplica. Devuelve cuántas
 * filas insertó por categoría para que la UI lo informe al barbero.
 */
async function backfillTodayMovements(
  clientId: string,
  sessionId: string,
): Promise<{ bookings: number; productSales: number; sumup: number }> {
  // Today en Madrid (YYYY-MM-DD) — bookings.date guarda string en este
  // formato. Usamos ::date casts en SQL crudo porque el join contra
  // cash_movements es inverso.
  const todayMadrid = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Madrid',
  })

  // 1. Backfill bookings
  const insertedBookings = await db.execute(sql`
    INSERT INTO cash_movements
      (client_id, session_id, kind, method, amount_cents, reference_type, reference_id, notes, created_at)
    SELECT
      ${clientId}::uuid,
      ${sessionId}::uuid,
      'booking',
      b.payment_method,
      b.price * 100,
      'booking',
      b.id,
      'Importado al abrir caja (cita completada antes de la apertura).',
      now()
    FROM ${bookings} b
    WHERE b.client_id = ${clientId}
      AND b.status = 'completed'
      AND b.date = ${todayMadrid}
      AND b.payment_method IS NOT NULL
      AND b.price IS NOT NULL
      AND b.price > 0
      AND NOT EXISTS (
        SELECT 1 FROM cash_movements m
        WHERE m.reference_type = 'booking' AND m.reference_id = b.id
      )
    RETURNING id
  `)

  // 2. Backfill product sales
  const insertedSales = await db.execute(sql`
    INSERT INTO cash_movements
      (client_id, session_id, kind, method, amount_cents, reference_type, reference_id, notes, created_at)
    SELECT
      ${clientId}::uuid,
      ${sessionId}::uuid,
      'product_sale',
      ps.payment_method,
      ps.total_cents,
      'product_sale',
      ps.id,
      'Importado al abrir caja (venta antes de la apertura).',
      now()
    FROM ${productSales} ps
    WHERE ps.client_id = ${clientId}
      AND (ps.sold_at AT TIME ZONE 'Europe/Madrid')::date = ${todayMadrid}::date
      AND NOT EXISTS (
        SELECT 1 FROM cash_movements m
        WHERE m.reference_type = 'product_sale' AND m.reference_id = ps.id
      )
    RETURNING id
  `)

  // 3. Backfill SumUp pending transactions del día (ventas con datáfono
  //    procesadas mientras no había sesión de caja abierta). Marcamos las
  //    pending como imported_at = now() para no re-importar. UNIQUE en
  //    sumup_transaction_id de cash_movements bloquea duplicados aunque
  //    falle el flag.
  const insertedSumup = await db.execute(sql`
    WITH inserted AS (
      INSERT INTO cash_movements
        (client_id, session_id, kind, method, amount_cents, sumup_transaction_id, notes, created_at)
      SELECT
        ${clientId}::uuid,
        ${sessionId}::uuid,
        CASE WHEN spt.status = 'REFUNDED' THEN 'refund' ELSE 'booking' END,
        'card',
        spt.amount_cents,
        spt.sumup_transaction_id,
        'Importado al abrir caja desde SumUp pending.',
        spt.transaction_timestamp
      FROM sumup_pending_transactions spt
      WHERE spt.client_id = ${clientId}
        AND spt.imported_at IS NULL
        AND (spt.transaction_timestamp AT TIME ZONE 'Europe/Madrid')::date = ${todayMadrid}::date
        AND spt.currency = 'EUR'
      ON CONFLICT (sumup_transaction_id) DO NOTHING
      RETURNING sumup_transaction_id
    )
    UPDATE sumup_pending_transactions
    SET imported_at = now()
    WHERE sumup_transaction_id IN (SELECT sumup_transaction_id FROM inserted)
    RETURNING id
  `)

  // drizzle execute con sql crudo devuelve { rows } — usamos rows.length.
  const bookingsCount = (insertedBookings as unknown as { rows: unknown[] }).rows?.length ?? 0
  const salesCount = (insertedSales as unknown as { rows: unknown[] }).rows?.length ?? 0
  const sumupCount = (insertedSumup as unknown as { rows: unknown[] }).rows?.length ?? 0

  return { bookings: bookingsCount, productSales: salesCount, sumup: sumupCount }
}
