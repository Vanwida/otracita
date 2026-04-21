import type { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { eq, and, gte, lt, asc } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { LibroFacturasDocument } from '@/lib/pdf/libro-facturas';
import { monthRangeInclusive } from '@/lib/invoicing';

// -----------------------------------------------------------------------------
// GET /api/invoices/libro-pdf?month=YYYY-MM
//
// Streams a PDF "Libro de Facturas Emitidas" for the given month. This is the
// doc gestores attach to a Modelo 303 filing — sequential, complete, with the
// emisor's fiscal identity and per-line IVA breakdown.
//
// Runtime: Node. @react-pdf/renderer depends on Node streams/Buffer. Cold
// starts are measurable (~1-2s) since it ships fontkit + pdfkit — we accept
// that because this endpoint is invoked manually, not on hot paths.
// -----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMonthES(month: string): string {
  const [y, m] = month.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[idx] ?? m} ${y}`;
}

function formatTodayES(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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

  // Half-open [start, endExclusive) — day 1 of next month stays out. Voided
  // rows are excluded: the libro de facturas emitidas is the physical legal
  // record, annulled docs must not appear there.
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

  const element = (
    <LibroFacturasDocument
      period={formatMonthES(month)}
      generatedAt={formatTodayES()}
      emisor={{
        fiscalName: client.fiscalName || client.businessName,
        fiscalNif: client.fiscalNif,
        fiscalAddress: client.fiscalAddress,
        fiscalPostalCode: client.fiscalPostalCode,
        fiscalCity: client.fiscalCity,
      }}
      rows={rows.map((r) => ({
        number: r.number,
        issueDate: r.issueDate,
        customerName: r.customerName,
        customerNif: r.customerNif,
        subtotalCents: r.subtotalCents,
        ivaRate: r.ivaRate,
        ivaAmountCents: r.ivaAmountCents,
        totalCents: r.totalCents,
        type: r.type,
      }))}
    />
  );

  const buffer = await renderToBuffer(element);

  // renderToBuffer returns a Node Buffer which is an acceptable BodyInit in
  // Node runtime. Convert to Uint8Array for strict type compatibility.
  const body = new Uint8Array(buffer);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="libro-facturas-${month}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
