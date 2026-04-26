import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// PATCH /api/invoicing/config
//
// Body: {
//   invoicingEnabled: boolean,
//   fiscalName: string,
//   fiscalNif: string,
//   fiscalAddress: string,
//   fiscalCity: string,
//   fiscalPostalCode: string,
//   ivaRate: 0 | 4 | 10 | 21,
//   invoiceNumberPrefix: string,
//   invoiceNumberNext: number,
// }
//
// Endpoint dedicado para los datos fiscales y la config de numeración. Antes
// vivía dentro del server action `saveBusiness` de /dashboard/negocio. Lo
// extraemos para que `InvoicingSettings` viva en /dashboard/caja como
// componente self-contained.
//
// Reglas legales replicadas (igual que `saveBusiness`):
//   1. Activar invoicingEnabled requiere los 5 campos fiscales rellenos
//      (RD 1619/2012 art. 6 — emisor con nombre + NIF + dirección postal).
//      Si faltan, persistimos el toggle como false sin error duro — la UI
//      muestra warning.
//   2. ivaRate ∈ {0, 4, 10, 21}; cualquier otro fallback al actual.
//   3. invoiceNumberNext: si ya hay facturas emitidas, NO se puede rebobinar
//      (numeración correlativa es requisito legal). Conservamos el actual.
//      Si no hay facturas aún, aceptamos el valor enviado (mín 1).
//   4. invoiceNumberPrefix: free string trim, default '' (numeración pura).
// -----------------------------------------------------------------------------

interface Body {
  invoicingEnabled?: unknown
  fiscalName?: unknown
  fiscalNif?: unknown
  fiscalAddress?: unknown
  fiscalCity?: unknown
  fiscalPostalCode?: unknown
  ivaRate?: unknown
  invoiceNumberPrefix?: unknown
  invoiceNumberNext?: unknown
}

const VALID_IVA = [0, 4, 10, 21]

function str(v: unknown, max = 120): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

export async function PATCH(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const fiscalName = str(body.fiscalName, 200)
  const fiscalNif = str(body.fiscalNif, 20)
  const fiscalAddress = str(body.fiscalAddress, 250)
  const fiscalCity = str(body.fiscalCity, 100)
  const fiscalPostalCode = str(body.fiscalPostalCode, 20)
  const invoiceNumberPrefix = str(body.invoiceNumberPrefix, 30)

  // Datos completos? Necesario para activar invoicingEnabled.
  const fiscalDataComplete =
    fiscalName.length > 0 && fiscalNif.length > 0 && fiscalAddress.length > 0 &&
    fiscalCity.length > 0 && fiscalPostalCode.length > 0
  const invoicingEnabled = body.invoicingEnabled === true && fiscalDataComplete

  // IVA whitelist
  const ivaParsed = typeof body.ivaRate === 'number' ? body.ivaRate : Number.parseInt(String(body.ivaRate ?? ''), 10)
  const ivaRate = VALID_IVA.includes(ivaParsed) ? ivaParsed : client.ivaRate

  // Numeración: lock si ya hay facturas emitidas.
  const [countRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(eq(invoices.clientId, client.id))
  const hasEmittedInvoices = Number(countRow?.n ?? 0) > 0

  let invoiceNumberNext = client.invoiceNumberNext
  if (!hasEmittedInvoices) {
    const parsed = typeof body.invoiceNumberNext === 'number'
      ? body.invoiceNumberNext
      : Number.parseInt(String(body.invoiceNumberNext ?? ''), 10)
    if (Number.isFinite(parsed) && parsed >= 1) invoiceNumberNext = parsed
  }

  await db
    .update(clients)
    .set({
      invoicingEnabled,
      fiscalName: fiscalName || null,
      fiscalNif: fiscalNif || null,
      fiscalAddress: fiscalAddress || null,
      fiscalCity: fiscalCity || null,
      fiscalPostalCode: fiscalPostalCode || null,
      ivaRate,
      invoiceNumberPrefix,
      invoiceNumberNext,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, client.id))

  return Response.json({
    ok: true,
    invoicingEnabled,
    fiscalDataComplete,
    invoiceNumberNext,
  })
}
