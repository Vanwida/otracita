import type { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/db';
import { invoices, tips } from '@/db/schema';
import { eq, and, gte, lt, asc } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { monthRangeInclusive } from '@/lib/invoicing';

// -----------------------------------------------------------------------------
// GET /api/invoices/export-xlsx?month=YYYY-MM
//
// Native Excel export — two sheets:
//   - "Resumen": emisor fiscal data + monthly totals (at a glance for the gestor)
//   - "Facturas": full tabular data with live SUM formulas at the bottom,
//     so the gestor can delete/insert rows and totals recalculate automatically.
//
// Why alongside the CSV? The CSV survives ancient Excel and opens cleanly in
// Excel ES, but:
//  - Cannot carry formulas -> totals go stale after edits.
//  - Cannot style headers / set column formats -> numbers render as text.
//  - Cannot have multiple sheets -> emisor + data must be in one flat table.
// XLSX fixes all of these. Both coexist; the barber picks based on habit.
//
// Node runtime is required — exceljs relies on Node streams / Buffer.
// -----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── brand overlay color (matches --color-overlay in globals.css) ──────────
const HEADER_FILL_ARGB = 'FFF0EBE3';
const HEADER_FONT_ARGB = 'FF2A1D14';
const TOTALS_FILL_ARGB = 'FFF4E3D4'; // brand-softer
const BORDER_ARGB = 'FFE8DDD0';

// Column formats (Spanish accounting)
const CURRENCY_FORMAT = '#,##0.00 "€"';
const PERCENT_FORMAT = '0"%"';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMonthES(month: string): string {
  const [y, m] = month.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[idx] ?? m} ${y}`;
}

/**
 * Widen every column to fit its longest value. exceljs doesn't auto-size, so
 * we approximate: 1.1x the character width of the longest cell (cap at 60).
 */
function autoFitColumns(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      let text = '';
      if (value == null) text = '';
      else if (typeof value === 'object' && 'richText' in value) {
        text = value.richText.map((r) => r.text).join('');
      } else if (typeof value === 'object' && 'formula' in value) {
        text = String((value as { result?: unknown }).result ?? '');
      } else {
        text = String(value);
      }
      if (text.length > maxLen) maxLen = text.length;
    });
    col.width = Math.min(Math.ceil(maxLen * 1.1) + 2, 60);
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  const url = new URL(req.url);
  const month = url.searchParams.get('month');

  if (!month) {
    return Response.json(
      { error: 'Falta el parámetro `month` (YYYY-MM)' },
      { status: 400 },
    );
  }

  const range = monthRangeInclusive(month);
  if (!range) {
    return Response.json(
      { error: 'Formato de mes inválido. Usa YYYY-MM.' },
      { status: 400 },
    );
  }

  // Half-open [start, endExclusive) to keep day 1 of next month out of the
  // totals. Voided rows are excluded entirely — they were annulled, the
  // gestor must never file them as part of Modelo 303.
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, access.client.id),
        gte(invoices.issueDate, range.start),
        lt(invoices.issueDate, range.endExclusive),
        eq(invoices.status, 'issued'),
      ),
    )
    .orderBy(asc(invoices.issueDate), asc(invoices.number));

  const client = access.client;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'otracita';
  workbook.created = new Date();

  // ── Sheet 1: Resumen ─────────────────────────────────────────────────────
  const resumen = workbook.addWorksheet('Resumen');

  // Emisor block
  resumen.addRow(['Libro de facturas emitidas']);
  resumen.getCell('A1').font = { size: 16, bold: true, name: 'Calibri' };
  resumen.addRow([]);
  resumen.addRow(['Periodo', formatMonthES(month)]);
  resumen.addRow(['Generado', new Date().toLocaleDateString('es-ES')]);
  resumen.addRow([]);
  resumen.addRow(['Datos del emisor']);
  resumen.getCell('A6').font = { bold: true };
  resumen.addRow(['Nombre fiscal', client.fiscalName || client.businessName || '']);
  resumen.addRow(['NIF/CIF', client.fiscalNif || '']);
  resumen.addRow(['Dirección', client.fiscalAddress || '']);
  resumen.addRow([
    'Código postal / ciudad',
    [client.fiscalPostalCode, client.fiscalCity].filter(Boolean).join(' '),
  ]);
  resumen.addRow(['IVA aplicado', `${client.ivaRate}%`]);
  resumen.addRow([]);

  // Totales block
  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      subtotal: acc.subtotal + r.subtotalCents,
      iva: acc.iva + r.ivaAmountCents,
      total: acc.total + r.totalCents,
    }),
    { count: 0, subtotal: 0, iva: 0, total: 0 },
  );

  resumen.addRow(['Totales del mes']);
  resumen.getCell('A13').font = { bold: true };
  resumen.addRow(['Documentos emitidos', totals.count]);
  const baseRow = resumen.addRow(['Base imponible (€)', totals.subtotal / 100]);
  baseRow.getCell(2).numFmt = CURRENCY_FORMAT;
  const ivaRow = resumen.addRow(['Cuota IVA (€)', totals.iva / 100]);
  ivaRow.getCell(2).numFmt = CURRENCY_FORMAT;
  const totalRow = resumen.addRow(['Total (€)', totals.total / 100]);
  totalRow.getCell(2).numFmt = CURRENCY_FORMAT;
  totalRow.font = { bold: true };

  resumen.getColumn(1).width = 28;
  resumen.getColumn(2).width = 34;

  // ── Sheet 2: Facturas (tabular + live SUM) ───────────────────────────────
  const facturas = workbook.addWorksheet('Facturas');

  // Column definitions (keys used when adding rows)
  facturas.columns = [
    { header: 'Nº Factura', key: 'number' },
    { header: 'Fecha', key: 'issueDate' },
    { header: 'Cliente', key: 'customerName' },
    { header: 'NIF/CIF', key: 'customerNif' },
    { header: 'Concepto', key: 'serviceName' },
    { header: 'Profesional', key: 'barberName' },
    { header: 'Base imponible (€)', key: 'subtotal' },
    { header: '% IVA', key: 'ivaRate' },
    { header: 'Cuota IVA (€)', key: 'ivaAmount' },
    { header: 'Total (€)', key: 'total' },
    { header: 'Tipo', key: 'type' },
  ];

  // Header styling — header is row 1 because addRow with columns config
  // already populates it.
  const headerRow = facturas.getRow(1);
  headerRow.font = { bold: true, color: { argb: HEADER_FONT_ARGB } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL_ARGB },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BORDER_ARGB } },
    };
  });

  // Data rows
  rows.forEach((row) => {
    const r = facturas.addRow({
      number: row.number,
      issueDate: row.issueDate,
      customerName: row.customerName || '',
      customerNif: row.customerNif || '',
      serviceName: row.serviceName,
      barberName: row.barberName || '',
      subtotal: row.subtotalCents / 100,
      ivaRate: row.ivaRate,
      ivaAmount: row.ivaAmountCents / 100,
      total: row.totalCents / 100,
      type: row.type === 'invoice' ? 'Factura' : 'Ticket',
    });
    r.getCell('subtotal').numFmt = CURRENCY_FORMAT;
    r.getCell('ivaRate').numFmt = PERCENT_FORMAT;
    r.getCell('ivaAmount').numFmt = CURRENCY_FORMAT;
    r.getCell('total').numFmt = CURRENCY_FORMAT;
  });

  // Totals row with SUM formulas — use actual column letters from exceljs
  // so the references stay correct even if column order is ever shuffled.
  const firstDataRow = 2;
  const lastDataRow = rows.length + 1; // header is row 1
  const subtotalCol = facturas.getColumn('subtotal').letter;
  const ivaAmountCol = facturas.getColumn('ivaAmount').letter;
  const totalCol = facturas.getColumn('total').letter;

  const totalsExcelRow = facturas.addRow({
    number: 'TOTALES',
    subtotal:
      lastDataRow >= firstDataRow
        ? { formula: `SUM(${subtotalCol}${firstDataRow}:${subtotalCol}${lastDataRow})` }
        : 0,
    ivaAmount:
      lastDataRow >= firstDataRow
        ? { formula: `SUM(${ivaAmountCol}${firstDataRow}:${ivaAmountCol}${lastDataRow})` }
        : 0,
    total:
      lastDataRow >= firstDataRow
        ? { formula: `SUM(${totalCol}${firstDataRow}:${totalCol}${lastDataRow})` }
        : 0,
  });
  totalsExcelRow.font = { bold: true };
  totalsExcelRow.eachCell((cell, colNum) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: TOTALS_FILL_ARGB },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER_ARGB } },
    };
    // Re-apply currency format on the numeric totals columns (they're formulas).
    const key = facturas.columns[colNum - 1]?.key;
    if (key === 'subtotal' || key === 'ivaAmount' || key === 'total') {
      cell.numFmt = CURRENCY_FORMAT;
    }
  });

  autoFitColumns(facturas);

  // Freeze header row for long lists.
  facturas.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Sheet 3: Propinas ────────────────────────────────────────────────────
  // Tips are fiscally INCOME (renta) but NOT invoiced — they're kept in a
  // separate sheet so the gestor sees them for IRPF without mixing them
  // into Modelo 303 (IVA) records. Only status='paid' counts; rating_only
  // entries are social data, not accounting.
  const tipsRangeStart = new Date(`${range.start}T00:00:00Z`);
  const tipsRangeEnd = new Date(`${range.endExclusive}T00:00:00Z`);
  const tipRows = await db
    .select()
    .from(tips)
    .where(
      and(
        eq(tips.clientId, access.client.id),
        eq(tips.status, 'paid'),
        gte(tips.paidAt, tipsRangeStart),
        lt(tips.paidAt, tipsRangeEnd),
      ),
    )
    .orderBy(asc(tips.paidAt));

  const propinas = workbook.addWorksheet('Propinas');
  propinas.addRow(['Propinas recibidas — no facturables (liberalidad)']);
  propinas.getCell('A1').font = { italic: true, color: { argb: '00888888' } };
  propinas.addRow([]);
  propinas.columns = [
    { header: 'Fecha', key: 'paidAt' },
    { header: 'Barbero', key: 'barberName' },
    { header: 'Importe (€)', key: 'amount' },
    { header: 'Valoración (1-5)', key: 'rating' },
    { header: 'Ref. Stripe', key: 'ref' },
  ];
  // Re-apply after .columns overwrites the first header row
  const tipsHeader = propinas.getRow(3);
  tipsHeader.values = ['Fecha', 'Barbero', 'Importe (€)', 'Valoración (1-5)', 'Ref. Stripe'];
  tipsHeader.font = { bold: true, color: { argb: HEADER_FONT_ARGB } };
  tipsHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
    cell.border = { bottom: { style: 'thin', color: { argb: BORDER_ARGB } } };
  });

  tipRows.forEach((t) => {
    const r = propinas.addRow({
      paidAt: t.paidAt ? t.paidAt.toISOString().slice(0, 10) : '',
      barberName: t.barberName || '',
      amount: t.amountCents / 100,
      rating: t.rating ?? '',
      ref: t.stripeChargeId || t.stripePaymentIntentId || '',
    });
    r.getCell('amount').numFmt = CURRENCY_FORMAT;
  });

  // Totals
  const propinasTotal = tipRows.reduce((acc, t) => acc + t.amountCents, 0);
  const tipsTotalRow = propinas.addRow({
    paidAt: 'TOTAL',
    amount: propinasTotal / 100,
  });
  tipsTotalRow.font = { bold: true };
  tipsTotalRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTALS_FILL_ARGB } };
    cell.border = { top: { style: 'thin', color: { argb: BORDER_ARGB } } };
    const key = propinas.columns[colNum - 1]?.key;
    if (key === 'amount') cell.numFmt = CURRENCY_FORMAT;
  });
  autoFitColumns(propinas);
  propinas.views = [{ state: 'frozen', ySplit: 3 }];

  // Also reflect tips total in Resumen, separated from facturas so the
  // gestor can see at a glance.
  if (tipRows.length > 0) {
    resumen.addRow([]);
    resumen.addRow(['Propinas (no facturables)']);
    resumen.getCell(`A${resumen.rowCount}`).font = { bold: true };
    const rcRow = resumen.addRow(['Propinas recibidas', tipRows.length]);
    void rcRow;
    const pRow = resumen.addRow(['Total propinas (€)', propinasTotal / 100]);
    pRow.getCell(2).numFmt = CURRENCY_FORMAT;
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="facturas-${month}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
