import { db } from '@/db'
import { bookings, customers, ratings, tips } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/customers/export
//
// Exporta el listado completo de clientes de la barbería autenticada como
// CSV (UTF-8 con BOM para que Excel español lea bien acentos y €).
//
// Misma SQL que /dashboard/clientes pero sin filtros de UI — siempre
// exporta TODOS los clientes del tenant. Si en el futuro quieres
// exportar respetando filtros, pasa los searchParams aquí.
//
// Multi-tenancy: requireClientAccess garantiza que solo se devuelven
// filas con client_id = current barbería.
// -----------------------------------------------------------------------------

const SEPARATOR = ';' // Excel ES espera ;
const LINE_SEPARATOR = '\r\n'

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(SEPARATOR) || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

interface Row {
  name: string | null
  phone: string
  total_bookings: number | null
  no_shows: number | null
  reputation: string | null
  last_booking_at: Date | null
  spent_cents: number | string
  completed_count: number
  tips_cents: number | string
  rating_count: number
  avg_rating: number | null
}

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const result = await db.execute(sql`
    SELECT
      c.name, c.phone, c.total_bookings, c.no_shows, c.reputation, c.last_booking_at,
      COALESCE(b.spent_cents, 0)::bigint AS spent_cents,
      COALESCE(b.completed_count, 0)::int AS completed_count,
      COALESCE(t.tips_cents, 0)::bigint AS tips_cents,
      COALESCE(r.rating_count, 0)::int AS rating_count,
      r.avg_rating
    FROM ${customers} c
    LEFT JOIN (
      SELECT customer_phone,
             SUM(price_cents) AS spent_cents,
             COUNT(*) AS completed_count
      FROM ${bookings}
      WHERE client_id = ${client.id} AND status = 'completed'
      GROUP BY customer_phone
    ) b ON b.customer_phone = c.phone
    LEFT JOIN (
      SELECT customer_phone, SUM(amount_cents) AS tips_cents
      FROM ${tips}
      WHERE client_id = ${client.id} AND status = 'paid'
      GROUP BY customer_phone
    ) t ON t.customer_phone = c.phone
    LEFT JOIN (
      SELECT customer_phone, COUNT(*) AS rating_count, AVG(rating)::float AS avg_rating
      FROM ${ratings}
      WHERE client_id = ${client.id}
      GROUP BY customer_phone
    ) r ON r.customer_phone = c.phone
    WHERE c.client_id = ${client.id}
    ORDER BY c.last_booking_at DESC NULLS LAST
  `)

  const rows = (result as unknown as { rows: Row[] }).rows

  const HEADERS = [
    'Nombre',
    'Teléfono',
    'Visitas',
    'No-shows',
    'Servicios completados',
    'Gastado (€)',
    'Propinas (€)',
    'Reseñas',
    'Nota media',
    'Última visita',
    'Reputación',
  ]

  const lines = rows.map((r) => {
    const spentEur = (Number(r.spent_cents) / 100).toFixed(2)
    const tipsEur = (Number(r.tips_cents) / 100).toFixed(2)
    const lastVisit = r.last_booking_at
      ? new Date(r.last_booking_at).toISOString().slice(0, 10)
      : ''
    const avg = r.avg_rating !== null ? Number(r.avg_rating).toFixed(2) : ''
    return [
      csvEscape(r.name ?? ''),
      csvEscape(r.phone),
      csvEscape(r.total_bookings ?? 0),
      csvEscape(r.no_shows ?? 0),
      csvEscape(r.completed_count),
      csvEscape(spentEur),
      csvEscape(tipsEur),
      csvEscape(r.rating_count),
      csvEscape(avg),
      csvEscape(lastVisit),
      csvEscape(r.reputation ?? 'good'),
    ].join(SEPARATOR)
  })

  // BOM UTF-8 para Excel ES.
  const BOM = '﻿'
  const body = BOM + [HEADERS.map(csvEscape).join(SEPARATOR), ...lines].join(LINE_SEPARATOR) + LINE_SEPARATOR

  const today = new Date().toISOString().slice(0, 10)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
