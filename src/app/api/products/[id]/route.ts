import { db } from '@/db'
import { products, productSales } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// /api/products/[id] — operaciones sobre un producto concreto.
//
// PATCH  → editar campos (name, description, image, price, stock, order, active)
// DELETE → soft-delete (active=false) si tiene ventas, hard-delete si no.
//          Mantenemos history de ventas por cumplimiento + para no romper
//          el desglose por barbero histórico.
//
// Multi-tenancy: validamos client_id en cada operación. Si product.client_id
// no coincide con el cliente del barbero autenticado → 404.
// -----------------------------------------------------------------------------

interface PatchBody {
  name?: unknown
  description?: unknown
  imageUrl?: unknown
  priceCents?: unknown
  stockQuantity?: unknown
  displayOrder?: unknown
  active?: unknown
}

const MAX_PRICE_CENTS = 100_000_00
const MAX_STOCK = 99_999

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  return v.trim().slice(0, max)
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return null
  if (n < min || n > max) return null
  return Math.floor(n)
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const { id } = await ctx.params
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Build patch dinámico — solo aplica los campos que vienen en el body.
  const patch: Partial<typeof products.$inferInsert> = { updatedAt: new Date() }

  const name = str(body.name, 120)
  if (name !== undefined) {
    if (name.length === 0) return Response.json({ error: 'Nombre vacío' }, { status: 400 })
    patch.name = name
  }

  if ('description' in body) {
    const d = str(body.description, 500)
    patch.description = d && d.length > 0 ? d : null
  }
  if ('imageUrl' in body) {
    const u = str(body.imageUrl, 500)
    patch.imageUrl = u && u.length > 0 ? u : null
  }

  if (body.priceCents !== undefined) {
    const p = intInRange(body.priceCents, 1, MAX_PRICE_CENTS)
    if (p === null) return Response.json({ error: 'Precio inválido' }, { status: 400 })
    patch.priceCents = p
  }

  if ('stockQuantity' in body) {
    if (body.stockQuantity === null || body.stockQuantity === '') {
      patch.stockQuantity = null
    } else {
      const s = intInRange(body.stockQuantity, 0, MAX_STOCK)
      if (s === null) return Response.json({ error: 'Stock inválido' }, { status: 400 })
      patch.stockQuantity = s
    }
  }

  if (body.displayOrder !== undefined) {
    const o = intInRange(body.displayOrder, 0, 9999)
    if (o === null) return Response.json({ error: 'Orden inválido' }, { status: 400 })
    patch.displayOrder = o
  }

  if (typeof body.active === 'boolean') {
    patch.active = body.active
  }

  const updated = await db
    .update(products)
    .set(patch)
    .where(and(eq(products.id, id), eq(products.clientId, client.id)))
    .returning()

  if (updated.length === 0) {
    return Response.json({ error: 'Producto no encontrado' }, { status: 404 })
  }

  return Response.json({ product: updated[0] })
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const { id } = await ctx.params
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  // Si tiene ventas históricas, soft-delete (active=false) para preservar
  // integridad referencial de product_sales y el desglose por barbero.
  // Si nunca se vendió, hard-delete OK.
  const [salesCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(productSales)
    .where(and(eq(productSales.productId, id), eq(productSales.clientId, client.id)))

  if (Number(salesCount?.n ?? 0) > 0) {
    const updated = await db
      .update(products)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.clientId, client.id)))
      .returning({ id: products.id })
    if (updated.length === 0) return Response.json({ error: 'Producto no encontrado' }, { status: 404 })
    return Response.json({ ok: true, mode: 'soft' })
  }

  const deleted = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.clientId, client.id)))
    .returning({ id: products.id })
  if (deleted.length === 0) return Response.json({ error: 'Producto no encontrado' }, { status: 404 })

  return Response.json({ ok: true, mode: 'hard' })
}
