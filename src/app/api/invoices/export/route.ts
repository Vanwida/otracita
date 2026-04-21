import type { NextRequest } from 'next/server'
import { db } from '@/db'
import { invoices } from '@/db/schema'
import { eq, and, gte, lte, asc } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/invoices/export?month=YYYY-MM
//
// Exports the tenant's monthly invoices as an Excel-ES-friendly CSV so the
// barber can double-click the file, open it in Excel, and forward it to their
// gestor with zero manual column-splitting.
//
// Format decisions:
//   - Separator: `;` (not `,`) — Excel ES opens semicolon CSVs natively without
//     an import wizard. A comma-separated CSV loads into a single column.
//   - Decimal: `,` (not `.`) — Spanish locale convention; matches Excel ES.
//   - UTF-8 BOM: prefixed so accented characters ("Peluquería", "Corte básico")
//     render correctly in Excel — without the BOM Excel treats it as Windows-1252.
//   - Headers: Spanish accounting terminology ("Nº Factura", "Base imponible")
//     rather than the API-style `base_eur` / `iva_pct` — gestores read these.
//   - Trailing TOTALES row: sum of base, IVA and total so the gestor doesn't
//     have to write a SUM formula just to reconcile.
// -----------------------------------------------------------------------------

/** Euros in Spanish format: "1234,56" (no thousands separator to avoid CSV ambiguity). */
function formatEurosES(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

/**
 * Escape a value for a semicolon-separated CSV. Excel-ES quirks:
 *  - If the value contains `;`, `"`, or a newline, wrap in double quotes and
 *    escape inner quotes by doubling them.
 *  - Newlines inside a quoted field are allowed — Excel handles them.
 */
function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
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

const HEADERS = [
  'Nº Factura',
  'Fecha',
  'Cliente',
  'NIF/CIF',
  'Concepto',
  'Profesional',
  'Base imponible (€)',
  '% IVA',
  'Cuota IVA (€)',
  'Total (€)',
  'Tipo',
] as const

const SEPARATOR = ';'
const LINE_SEPARATOR = '\r\n' // Windows CRLF — Excel ES prefers this on import

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

  const dataRows = rows.map((row) =>
    [
      csvEscape(row.number),
      csvEscape(row.issueDate),
      csvEscape(row.customerName),
      csvEscape(row.customerNif),
      csvEscape(row.serviceName),
      csvEscape(row.barberName),
      formatEurosES(row.subtotalCents),
      row.ivaRate.toString(),
      formatEurosES(row.ivaAmountCents),
      formatEurosES(row.totalCents),
      csvEscape(row.type === 'invoice' ? 'Factura' : 'Ticket'),
    ].join(SEPARATOR),
  )

  // Totals row — leave first six columns empty so the SUM aligns under the
  // numeric columns when you scroll right in Excel.
  const totals = rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotalCents,
      iva: acc.iva + r.ivaAmountCents,
      total: acc.total + r.totalCents,
    }),
    { subtotal: 0, iva: 0, total: 0 },
  )

  const totalsRow = [
    'TOTALES',
    '',
    '',
    '',
    '',
    '',
    formatEurosES(totals.subtotal),
    '',
    formatEurosES(totals.iva),
    formatEurosES(totals.total),
    '',
  ].join(SEPARATOR)

  const headerRow = HEADERS.map(csvEscape).join(SEPARATOR)

  // UTF-8 BOM — critical for accents in Excel ES
  const BOM = '\uFEFF'

  const body =
    BOM +
    [headerRow, ...dataRows, '', totalsRow].join(LINE_SEPARATOR) +
    LINE_SEPARATOR

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="facturas-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
