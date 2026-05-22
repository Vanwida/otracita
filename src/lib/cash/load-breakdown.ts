import { db } from '@/db'
import {
  barbers,
  bookings,
  cashMovements,
  payments,
  productSales,
} from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import {
  buildMovementBreakdown,
  type MovementBreakdown,
  type MovementForBreakdown,
  type MovementListItem,
  type PaymentMethodDetail,
  type PaymentMethodDetailRow,
} from './breakdown'
import {
  isIncoming,
  type MovementKind,
  type PaymentMethod,
} from './compute'

// -----------------------------------------------------------------------------
// loadBreakdownForSession — carga los movimientos de una sesión con el
// `barberId` ya resuelto y devuelve el desglose completo + el mapping de
// nombres legibles. Es la capa "impura" sobre `breakdown.ts`.
//
// Resolución de barbero (orden de prioridad):
//   1. cash_movements.barber_id directo (tip_cash, manuales, app móvil)
//   2. bookings.barber_id cuando referenceType='booking' (los booking
//      movements no almacenan barberId hoy — ver record-movement.ts)
//   3. product_sales.barber_id cuando referenceType='product_sale'
//   4. NULL → fila "Sin asignar"
//
// Devuelve además el listado enriquecido de movimientos (con hora, nombre
// barbero, label de referencia) y la granularidad fina de payments.method
// (card_physical / bizum / card_online / mixed) cuando aplica.
// -----------------------------------------------------------------------------

interface MovementRow {
  id: string
  kind: MovementKind
  method: PaymentMethod
  amountCents: number
  barberId: string | null
  createdAt: string
  notes: string | null
  referenceType: 'booking' | 'product_sale' | null
  referenceId: string | null
  referenceLabel: string | null
}

interface PaymentDetailRow {
  method: string | null
  totalCents: number
  count: number
}

export async function loadBreakdownForSession(
  clientId: string,
  sessionId: string,
): Promise<MovementBreakdown> {
  // SQL raw para resolver el barber_id con COALESCE de tres fuentes + el
  // label legible de la referencia (nombre del cliente para bookings,
  // nombre del producto para product_sales). Drizzle no expresa esto
  // cómodamente con builders. Parametrizamos por clientId+sessionId para
  // garantizar aislamiento multi-tenant (defensa en profundidad sobre
  // requireClientAccess que ya pasó el caller).
  const result = await db.execute(sql`
    SELECT
      cm.id::text AS id,
      cm.kind,
      cm.method,
      cm.amount_cents AS "amountCents",
      cm.created_at AS "createdAt",
      cm.notes,
      cm.reference_type AS "referenceType",
      cm.reference_id::text AS "referenceId",
      COALESCE(
        cm.barber_id::text,
        (SELECT bk.barber_id::text FROM ${bookings} bk
           WHERE bk.id = cm.reference_id
             AND cm.reference_type = 'booking'
             AND bk.barber_id IS NOT NULL),
        (SELECT ps.barber_id::text FROM ${productSales} ps
           WHERE ps.id = cm.reference_id
             AND cm.reference_type = 'product_sale'
             AND ps.barber_id IS NOT NULL)
      ) AS "barberId",
      CASE
        WHEN cm.reference_type = 'booking' THEN (
          SELECT COALESCE(bk.customer_name, bk.customer_phone)
            FROM ${bookings} bk WHERE bk.id = cm.reference_id
        )
        WHEN cm.reference_type = 'product_sale' THEN (
          SELECT p.name FROM ${productSales} ps
            LEFT JOIN products p ON p.id = ps.product_id
           WHERE ps.id = cm.reference_id
        )
        ELSE NULL
      END AS "referenceLabel"
    FROM ${cashMovements} cm
    WHERE cm.client_id = ${clientId}
      AND cm.session_id = ${sessionId}
    ORDER BY cm.created_at ASC
  `)
  const rows = (result as unknown as { rows: MovementRow[] }).rows

  // Mapping id → nombre. Cargamos TODOS los barberos del cliente (no sólo
  // activos) porque un cierre puede mencionar a un barbero ya desactivado,
  // y queremos enseñar el nombre — no el uuid.
  const allBarbers = await db
    .select({ id: barbers.id, name: barbers.name })
    .from(barbers)
    .where(eq(barbers.clientId, clientId))
  const nameById = new Map(allBarbers.map((b) => [b.id, b.name]))

  // Granularidad fina sobre payments.method para bookings cobrados en esta
  // sesión. Sólo cuenta pagos `succeeded`/null status válidos (descartamos
  // pending/failed para no inflar el cuadre).
  const paymentDetailResult = await db.execute(sql`
    SELECT
      COALESCE(p.method, 'unknown') AS method,
      SUM(p.amount_cents)::bigint AS "totalCents",
      COUNT(*)::int AS count
    FROM ${payments} p
    WHERE p.client_id = ${clientId}
      AND p.status = 'succeeded'
      AND p.booking_id IN (
        SELECT cm.reference_id FROM ${cashMovements} cm
        WHERE cm.session_id = ${sessionId}
          AND cm.reference_type = 'booking'
          AND cm.reference_id IS NOT NULL
      )
    GROUP BY COALESCE(p.method, 'unknown')
  `)
  const paymentDetailRows = (
    paymentDetailResult as unknown as { rows: PaymentDetailRow[] }
  ).rows

  const validDetailMethods: ReadonlySet<PaymentMethodDetail> = new Set([
    'cash',
    'card_physical',
    'bizum',
    'card_online',
    'mixed',
    'unknown',
  ])

  const byPaymentDetail: PaymentMethodDetailRow[] = paymentDetailRows
    .map<PaymentMethodDetailRow>((r) => {
      const m = (r.method ?? 'unknown') as PaymentMethodDetail
      const safe: PaymentMethodDetail = validDetailMethods.has(m) ? m : 'unknown'
      return {
        method: safe,
        totalCents: Number(r.totalCents),
        count: Number(r.count),
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)

  const enriched: MovementForBreakdown[] = rows.map((r) => ({
    kind: r.kind,
    method: r.method,
    amountCents: Number(r.amountCents),
    barberId: r.barberId,
  }))

  const movementList: MovementListItem[] = rows.map((r) => {
    const amountCents = Number(r.amountCents)
    const signed = isIncoming(r.kind) ? amountCents : -amountCents
    return {
      id: r.id,
      kind: r.kind,
      method: r.method,
      amountCents,
      signedAmountCents: signed,
      barberId: r.barberId,
      barberName: r.barberId ? nameById.get(r.barberId) ?? null : null,
      createdAt: new Date(r.createdAt).toISOString(),
      notes: r.notes,
      referenceType: r.referenceType,
      referenceId: r.referenceId,
      referenceLabel: r.referenceLabel,
    }
  })

  return buildMovementBreakdown(enriched, nameById, movementList, byPaymentDetail)
}
