import { db } from '@/db'
import { bookings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { generateInvoiceFromBooking } from '@/lib/invoicing'

// -----------------------------------------------------------------------------
// POST /api/invoices/from-booking — emitir factura VeriFactu BAJO DEMANDA.
//
// Desde que cobrar dejó de declarar a Hacienda automáticamente, la factura
// fiscal se emite SOLO cuando el barbero lo pide explícitamente ("Generar
// factura", patrón Booksy recibo 10.01.18) — desde el recibo post-pago, la
// venta en Transacciones, o el cierre de caja.
//
// Reusa `generateInvoiceFromBooking` TAL CUAL (única fuente VeriFactu: hash
// encadenado + QR + invoice_items + idempotencia). Es idempotente: si la
// venta ya tiene factura, devuelve la existente con alreadyExisted=true en
// vez de duplicar. Aquí solo se añade el gate de autorización on-demand.
//
// Multi-tenancy (regla dura): el booking se resuelve y se verifica que
// pertenece al client autenticado ANTES de tocar nada. Nunca se acepta
// clientId del body.
//
// Body: { bookingId: string }
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, isAdmin } = access

  let body: { bookingId?: unknown }
  try {
    body = (await req.json()) as { bookingId?: unknown }
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const bookingId =
    typeof body.bookingId === 'string' && body.bookingId.length > 0
      ? body.bookingId
      : null
  if (!bookingId) {
    return Response.json({ error: 'Falta bookingId' }, { status: 400 })
  }

  // El booking debe existir y pertenecer al tenant autenticado.
  const [booking] = await db
    .select({ id: bookings.id, clientId: bookings.clientId, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)))
  if (!booking && !isAdmin) {
    return Response.json({ error: 'Venta no encontrada' }, { status: 404 })
  }

  // Solo se factura una venta cerrada. Si el barbero abre "Generar factura"
  // sobre algo que no se cobró, es un error de flujo, no una factura.
  if (booking && booking.status !== 'completed') {
    return Response.json(
      { error: 'Solo se puede facturar una venta ya cobrada.' },
      { status: 409 },
    )
  }

  if (!client.invoicingEnabled) {
    return Response.json(
      {
        error:
          'La facturación VeriFactu no está activada. Actívala en Ajustes → Pagos.',
      },
      { status: 409 },
    )
  }

  // generateInvoiceFromBooking es idempotente y hace sus propios guards
  // (emisor fiscal completo, booking no cancelado). Devuelve null si no se
  // pudo emitir por configuración incompleta.
  const result = await generateInvoiceFromBooking(bookingId)
  if (!result) {
    return Response.json(
      {
        error:
          'No se pudo emitir la factura. Revisa que tus datos fiscales (nombre, NIF, dirección) estén completos en Ajustes.',
      },
      { status: 422 },
    )
  }

  return Response.json(
    {
      invoiceId: result.invoiceId,
      number: result.number,
      alreadyExisted: result.alreadyExisted,
    },
    { status: result.alreadyExisted ? 200 : 201 },
  )
}
