import type { NextRequest } from 'next/server';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import {
  generateManualInvoice,
  validateManualInvoiceInput,
  looksLikeValidNif,
  type ManualInvoiceInput,
} from '@/lib/invoicing';

// -----------------------------------------------------------------------------
// POST /api/invoices/create-manual
//
// Creates a one-off "walk-in" invoice that's not tied to any booking. Uses the
// same atomic numbering sequence as auto-generated invoices so the fiscal log
// stays strictly sequential regardless of origin.
//
// Body: ManualInvoiceInput (see src/lib/invoicing.ts)
// Response: { invoiceId, number }
// Errors:
//   400 invalid payload / validation errors
//   400 invoicing disabled on tenant
//   401/403/404 access guard failures
// -----------------------------------------------------------------------------

interface RawBody {
  issueDate?: string;
  customerName?: string;
  customerPhone?: string;
  customerNif?: string;
  customerAddress?: string;
  serviceName?: string;
  barberName?: string;
  priceInEuros?: number | string;
  notes?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  if (!access.client.invoicingEnabled) {
    return Response.json(
      {
        error:
          'La facturación no está activada para este negocio. Actívala en Ajustes → Facturación.',
      },
      { status: 400 },
    );
  }

  let raw: RawBody;
  try {
    raw = (await req.json()) as RawBody;
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Price can arrive as string (from forms); normalize to number before validation.
  const priceAsNumber =
    raw.priceInEuros == null || raw.priceInEuros === ''
      ? Number.NaN
      : Number(raw.priceInEuros);

  const candidate: Partial<ManualInvoiceInput> = {
    issueDate: raw.issueDate?.trim() || undefined,
    customerName: raw.customerName?.trim(),
    customerPhone: raw.customerPhone?.trim() || null,
    customerNif: raw.customerNif?.trim() || null,
    customerAddress: raw.customerAddress?.trim() || null,
    serviceName: raw.serviceName?.trim(),
    barberName: raw.barberName?.trim() || null,
    priceInEuros: priceAsNumber,
    notes: raw.notes?.trim() || null,
  };

  const errors = validateManualInvoiceInput(candidate);
  if (errors.length > 0) {
    return Response.json(
      { error: errors[0].message, errors },
      { status: 400 },
    );
  }

  // Soft NIF shape warning — we warn but don't block so gestores can still
  // accept edge-case identifiers (non-residents, etc).
  const nifWarning =
    candidate.customerNif && !looksLikeValidNif(candidate.customerNif)
      ? 'El NIF/CIF no tiene un formato habitual (se ha emitido igualmente).'
      : undefined;

  const result = await generateManualInvoice(access.client.id, {
    issueDate: candidate.issueDate,
    customerName: candidate.customerName!,
    customerPhone: candidate.customerPhone ?? null,
    customerNif: candidate.customerNif ?? null,
    customerAddress: candidate.customerAddress ?? null,
    serviceName: candidate.serviceName!,
    barberName: candidate.barberName ?? null,
    priceInEuros: Number(candidate.priceInEuros),
    notes: candidate.notes ?? null,
  });

  if (!result) {
    return Response.json(
      { error: 'No se pudo emitir la factura. Verifica la facturación del negocio.' },
      { status: 500 },
    );
  }

  return Response.json(
    {
      invoiceId: result.invoiceId,
      number: result.number,
      warning: nifWarning,
    },
    { status: 201 },
  );
}
