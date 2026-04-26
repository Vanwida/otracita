import { db } from '@/db'
import { products } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// /api/products — CRUD básico de productos del barbero.
//
// GET   → lista productos activos del cliente, ordenados por display_order
// POST  → crea producto (price_cents > 0, stock_quantity opcional)
//
// Multi-tenancy: requireClientAccess. PATCH/DELETE de un producto concreto
// están en /api/products/[id].
//
// Validación: price_cents y stock_quantity se sanitizan antes de insertar.
// Cero confianza en el client.
// -----------------------------------------------------------------------------

interface CreateBody {
  name?: unknown
  description?: unknown
  imageUrl?: unknown
  priceCents?: unknown
  stockQuantity?: unknown
  displayOrder?: unknown
}

const MAX_PRICE_CENTS = 100_000_00 // 100k €
const MAX_STOCK = 99_999

function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return null
  if (n < min || n > max) return null
  return Math.floor(n)
}

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.clientId, client.id), eq(products.active, true)))
    .orderBy(asc(products.displayOrder), asc(products.createdAt))

  return Response.json({ products: rows })
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = str(body.name, 120)
  if (name.length === 0) {
    return Response.json({ error: 'Nombre requerido' }, { status: 400 })
  }

  const priceCents = intInRange(body.priceCents, 1, MAX_PRICE_CENTS)
  if (priceCents === null) {
    return Response.json({ error: 'Precio inválido (mín 0,01€, máx 100k€)' }, { status: 400 })
  }

  const description = str(body.description, 500) || null
  const imageUrl = str(body.imageUrl, 500) || null

  // stockQuantity opcional: si no viene o no parsea, queda null = ilimitado.
  let stockQuantity: number | null = null
  if (body.stockQuantity !== undefined && body.stockQuantity !== null && body.stockQuantity !== '') {
    const parsed = intInRange(body.stockQuantity, 0, MAX_STOCK)
    if (parsed === null) {
      return Response.json({ error: 'Stock inválido (0-99999, vacío para ilimitado)' }, { status: 400 })
    }
    stockQuantity = parsed
  }

  const displayOrder = intInRange(body.displayOrder, 0, 9999) ?? 0

  const [row] = await db
    .insert(products)
    .values({
      clientId: client.id,
      name,
      description,
      imageUrl,
      priceCents,
      stockQuantity,
      displayOrder,
    })
    .returning()

  return Response.json({ product: row }, { status: 201 })
}
