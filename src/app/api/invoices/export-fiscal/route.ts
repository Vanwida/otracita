import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { and, eq, gte, lt, asc } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { parseFiscalPeriodKey } from '@/lib/fiscal/period';
import { loadFiscalSummary, IRPF_B2B_DEFAULT_PCT } from '@/lib/fiscal/summary';

// -----------------------------------------------------------------------------
// GET /api/invoices/export-fiscal?period=YYYY-Q1|YYYY
//
// Exporta el resumen fiscal del periodo (IVA por tipo + IRPF B2C/B2B +
// detalle factura a factura) en un CSV Excel-ES-friendly que el barbero
// reenvía a su gestor para presentar el Modelo 303 (IVA trimestral) o el
// 390 (resumen anual). Forma: BOM UTF-8 + separador `;` + decimal `,` +
// CRLF — mismas convenciones que el export mensual existente
// (`/api/invoices/export`).
//
// CONTENIDO:
//   · Bloque "RESUMEN IVA" agrupado por tipo IVA (21/10/4/0).
//   · Bloque "RESUMEN IRPF" agrupado por B2C/B2B (sin/con NIF).
//   · Bloque "DETALLE" con todas las facturas issued del periodo, ordenadas
//     por fecha de emisión + número (igual que el export mensual).
//
// Tenancy: vía `requireClientAccess`. Voided/rectified se excluyen — mismo
// criterio que el cómputo del resumen.
// -----------------------------------------------------------------------------

function formatEurosES(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const SEPARATOR = ';';
const LINE_SEPARATOR = '\r\n';
const BOM = '﻿';

export async function GET(req: NextRequest): Promise<Response> {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  const url = new URL(req.url);
  const period = parseFiscalPeriodKey(url.searchParams.get('period'));

  const summary = await loadFiscalSummary(
    access.client.id,
    period.startIso,
    period.endExclusiveIso,
  );

  // Detalle factura a factura (issued only).
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, access.client.id),
        gte(invoices.issueDate, period.startIso),
        lt(invoices.issueDate, period.endExclusiveIso),
        eq(invoices.status, 'issued'),
      ),
    )
    .orderBy(asc(invoices.issueDate), asc(invoices.number));

  const lines: string[] = [];

  // ── Cabecera del documento.
  lines.push(`Resumen fiscal · ${period.label}`);
  lines.push(`Cliente;${csvEscape(access.client.fiscalName ?? access.client.businessName)}`);
  lines.push(`Período;${period.startIso} → ${period.endExclusiveIso} (exclusive)`);
  lines.push('');

  // ── Bloque IVA.
  lines.push('RESUMEN IVA');
  lines.push(['Tipo IVA', 'Base imponible (€)', 'Cuota IVA (€)', 'Total (€)', 'Documentos'].join(SEPARATOR));
  for (const r of summary.ivaRows) {
    lines.push(
      [
        `${r.ratePct}%`,
        formatEurosES(r.baseCents),
        formatEurosES(r.ivaCents),
        formatEurosES(r.totalCents),
        r.count,
      ].join(SEPARATOR),
    );
  }
  lines.push(
    [
      'TOTAL',
      formatEurosES(summary.ivaTotals.baseCents),
      formatEurosES(summary.ivaTotals.ivaCents),
      formatEurosES(summary.ivaTotals.totalCents),
      summary.ivaTotals.count,
    ].join(SEPARATOR),
  );
  lines.push('');

  // ── Bloque IRPF (informativo).
  lines.push('RESUMEN IRPF');
  lines.push(['Concepto', 'Base (€)', `Retención potencial (€)`, 'Documentos'].join(SEPARATOR));
  for (const r of summary.irpfRows) {
    lines.push(
      [
        csvEscape(r.label),
        formatEurosES(r.baseCents),
        formatEurosES(r.potentialRetencionCents),
        r.count,
      ].join(SEPARATOR),
    );
  }
  lines.push(
    [
      'TOTAL',
      formatEurosES(summary.irpfTotals.baseCents),
      formatEurosES(summary.irpfTotals.potentialRetencionCents),
      summary.irpfTotals.count,
    ].join(SEPARATOR),
  );
  lines.push(
    `Nota;La retención IRPF (${IRPF_B2B_DEFAULT_PCT}%) la decide y la practica el cliente que recibe la factura. Aquí se muestra como referencia.`,
  );
  lines.push('');

  // ── Detalle.
  lines.push('DETALLE DE FACTURAS');
  lines.push(
    [
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
    ].join(SEPARATOR),
  );
  for (const row of rows) {
    lines.push(
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
    );
  }

  const body = BOM + lines.join(LINE_SEPARATOR) + LINE_SEPARATOR;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="resumen-fiscal-${period.key}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
