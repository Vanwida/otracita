import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { invoices } from '@/db/schema'
import { eq, and, gte, lte, asc } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/invoices/export?month=YYYY-MM
//
// CSV export of all invoices for the authenticated tenant in the given month,
// formatted for import into standard Spanish accounting tools (gestores) —
// comma-separated, euros with dot decimal (to match Excel ES settings use of
// period) — no wait, **comma decimal** is Excel-ES; tools like A3, Sage, Contasol
// all accept either — we use dot decimal which is the international standard
// and what CSV implies.
//
// Columns (in order): number,date,customer_name,customer_nif,service,barber,
//                     base_eur,iva_pct,iva_eur,total_eur,type
// -----------------------------------------------------------------------------

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2)
}

function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function monthRange(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const m = parseInt(match[2], 10) - 1
  if (m < 0 || m > 11) return null
  const start = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, m + 1, 1)).toISOString().slice(0, 10)
  return { start, end }
}

export async function GET(req: NextRequest): Promise<Response> {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const url = new URL(req.url)
  const month = url.searchParams.get('month')

  if (!month) {
    return Response.json({ error: 'Falta el parámetro `month` (YYYY-MM)' }, { status: 400 })
  }

  const range = monthRange(month)
  if (!range) {
    return Response.json({ error: 'Formato de mes inválido. Usa YYYY-MM.' }, { status: 400 })
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, access.client.id),
        gte(invoices.issueDate, range.start),
        lte(invoices.issueDate, range.end),
      ),
    )
    .orderBy(asc(invoices.issueDate), asc(invoices.number))

  const header = [
    'numero',
    'fecha',
    'cliente_nombre',
    'cliente_nif',
    'servicio',
    'barbero',
    'base_eur',
    'iva_pct',
    'iva_eur',
    'total_eur',
    'tipo',
  ].join(',')

  const lines = rows.map((row) => [
    csvEscape(row.number),
    csvEscape(row.issueDate),
    csvEscape(row.customerName),
    csvEscape(row.customerNif),
    csvEscape(row.serviceName),
    csvEscape(row.barberName),
    formatEuros(row.subtotalCents),
    row.ivaRate.toString(),
    formatEuros(row.ivaAmountCents),
    formatEuros(row.totalCents),
    csvEscape(row.type),
  ].join(','))

  const body = [header, ...lines].join('\n') + '\n'

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="facturas-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
