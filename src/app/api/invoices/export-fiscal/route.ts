import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { and, eq, gte, lt, asc } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { loadFiscalSummary, IRPF_B2B_DEFAULT_PCT } from '@/lib/fiscal/summary';
import { resolvePeriodSelection, toLocalIso } from '@/lib/dashboard/period';

// -----------------------------------------------------------------------------
// GET /api/invoices/export-fiscal?period=day|week|month|year|range|lifetime
//                              &date=YYYY-MM-DD   (day)
//                              &start=YYYY-MM-DD&end=YYYY-MM-DD  (range)
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
//
// Periodo: misma convención que el resto de Informes (StatsPeriodTabs +
// `resolvePeriodSelection`) — single source para que el CSV cuadre con lo
// que el barbero ve en pantalla.
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
  const now = new Date();
  const selection = resolvePeriodSelection(
    {
      period: url.searchParams.get('period') ?? undefined,
      date: url.searchParams.get('date') ?? undefined,
      start: url.searchParams.get('start') ?? undefined,
      end: url.searchParams.get('end') ?? undefined,
    },
    now,
    'month',
  );

  // Fallback para `endExclusiveIso`: lifetime no tiene tope superior natural.
  // Tope = mañana, igual que en `loadReportContext`, para que la query
  // `< endIso` siga acotando arriba e incluya hoy completo.
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const startIso = selection.periodStartIso ?? '0001-01-01';
  const endExclusiveIso = selection.periodEndIso ?? toLocalIso(tomorrow);
  const periodLabel = selection.periodLabel;

  // Clave estable para el nombre del fichero: incluye el periodo + las
  // fechas resueltas, para que el barbero pueda archivar varios CSV sin
  // pisarlos. Sin caracteres ambiguos (`:` no funciona en Windows).
  const periodKey =
    selection.period === 'lifetime'
      ? 'total'
      : selection.period === 'range'
        ? `${startIso}_${endExclusiveIso}`
        : `${selection.period}-${startIso}`;

  const summary = await loadFiscalSummary(
    access.client.id,
    startIso,
    endExclusiveIso,
  );

  // Detalle factura a factura (issued only).
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, access.client.id),
        gte(invoices.issueDate, startIso),
        lt(invoices.issueDate, endExclusiveIso),
        eq(invoices.status, 'issued'),
      ),
    )
    .orderBy(asc(invoices.issueDate), asc(invoices.number));

  const lines: string[] = [];

  // ── Cabecera del documento.
  lines.push(`Resumen fiscal · ${periodLabel}`);
  lines.push(`Cliente;${csvEscape(access.client.fiscalName ?? access.client.businessName)}`);
  lines.push(`Período;${startIso} → ${endExclusiveIso} (exclusive)`);
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
      'Content-Disposition': `attachment; filename="resumen-fiscal-${periodKey}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
