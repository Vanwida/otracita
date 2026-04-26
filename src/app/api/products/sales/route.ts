import { db } from '@/db'
import { bookings, products, productSales } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/products/sales — registra una venta de producto.
//
// Body:
//   {
//     productId: string,
//     quantity: number (>= 1),
//     paymentMethod: 'cash' | 'card' | 'online',
//     bookingId?: string,         // si la venta está asociada a una cita
//     barberId?: string,          // quién vendió (atribución per-barbero)
//     customerPhone?: string,     // opcional; auto-fill si bookingId
//   }
//
// Lógica:
//   1. Multi-tenancy: requireClientAccess + product.client_id check.
//   2. Si bookingId presente, verificar que el booking pertenece al cliente
//      y auto-fill customerPhone + barberId desde el booking si no vinieron.
//   3. Si product.stock_quantity != null, decrementar atómicamente con
//      UPDATE ... WHERE stock_quantity >= quantity. Si afectó 0 filas →
//      stock insuficiente.
//   4. INSERT en product_sales con snapshot del unit_price_cents y total.
//   5. Devolver la sale para que el caller actualice UI.
//
// Sin transacción explícita porque las dos operaciones (UPDATE stock +
// INSERT sale) son independientes — si falla el INSERT después del UPDATE
// queda un decremento huérfano. Para MVP es aceptable; revisar si crece.
// -----------------------------------------------------------------------------

interface Body {
  productId?: unknown
  quantity?: unknown
  paymentMethod?: unknown
  bookingId?: unknown
  barberId?: unknown
  customerPhone?: unknown
}

const VALID_METHODS = ['cash', 'card', 'online']

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const productId = typeof body.productId === 'string' ? body.productId : ''
  if (!productId) return Response.json({ error: 'productId requerido' }, { status: 400 })

  const quantity = typeof body.quantity === 'number' ? body.quantity : Number.parseInt(String(body.quantity ?? ''), 10)
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
    return Response.json({ error: 'Cantidad inválida (1-99)' }, { status: 400 })
  }

  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : ''
  if (!VALID_METHODS.includes(paymentMethod)) {
    return Response.json({ error: 'Método de pago inválido' }, { status: 400 })
  }

  const bookingId = typeof body.bookingId === 'string' && body.bookingId.length > 0 ? body.bookingId : null
  let barberId = typeof body.barberId === 'string' && body.barberId.length > 0 ? body.barberId : null
  let customerPhone = typeof body.customerPhone === 'string' && body.customerPhone.length > 0 ? body.customerPhone : null

  // Verificar que el producto pertenece al cliente y está activo.
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.clientId, client.id), eq(products.active, true)))
  if (!product) return Response.json({ error: 'Producto no encontrado' }, { status: 404 })

  // Si bookingId, validar pertenencia y auto-fill datos faltantes.
  if (bookingId) {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)))
    if (!booking) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
    if (!barberId && booking.barberId) barberId = booking.barberId
    if (!customerPhone && booking.customerPhone) customerPhone = booking.customerPhone
  }

  // Stock atómico: si el producto trackea stock, decrementar con condición.
  if (product.stockQuantity !== null) {
    const decremented = await db
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} - ${quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, productId),
          eq(products.clientId, client.id),
          sql`${products.stockQuantity} >= ${quantity}`,
        ),
      )
      .returning({ id: products.id, stockQuantity: products.stockQuantity })

    if (decremented.length === 0) {
      return Response.json({ error: 'Stock insuficiente' }, { status: 409 })
    }
  }

  const unitPriceCents = product.priceCents
  const totalCents = unitPriceCents * quantity

  const [sale] = await db
    .insert(productSales)
    .values({
      clientId: client.id,
      productId,
      bookingId,
      barberId,
      quantity,
      unitPriceCents,
      totalCents,
      customerPhone,
      paymentMethod,
    })
    .returning()

  return Response.json({ sale }, { status: 201 })
}
