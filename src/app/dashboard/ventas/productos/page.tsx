export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, products } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaContent from '../../_components/AreaContent'
import ProductsManager from '../../marketing/tienda/ProductsManager'

// -----------------------------------------------------------------------------
// /dashboard/ventas/productos — pestaña PRODUCTOS del área Ventas.
//
// Catálogo de productos que la barbería vende en mostrador (champú, ceras…).
// Antes vivía en /dashboard/marketing/tienda — conceptualmente es venta, no
// marketing, así que su sitio estándar es Ventas (las ventas se atribuyen al
// barbero y aparecen en el Resumen de Ventas como upsells).
//
// LÓGICA DE SERVIDOR INTACTA: query EXACTA del antiguo marketing/tienda
// (products activos por client.id, displayOrder asc). ProductsManager
// gestiona el CUD contra los mismos endpoints. Solo cambia dónde se monta.
// -----------------------------------------------------------------------------

export default async function VentasProductosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const initialProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.clientId, client.id), eq(products.active, true)))
    .orderBy(asc(products.displayOrder), asc(products.createdAt))

  return (
    <AreaContent scroll="region" maxWidth="5xl">
      <p
        className="mb-4 text-ink-2"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        Da de alta los productos que vendes. Al cobrar un corte, añades la
        venta desde la agenda con un click. Cada venta se atribuye al barbero
        que la registra y aparece en el Resumen de Ventas.
      </p>

      <ProductsManager
        initial={initialProducts.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? '',
          imageUrl: p.imageUrl ?? '',
          priceCents: p.priceCents,
          stockQuantity: p.stockQuantity,
          displayOrder: p.displayOrder,
        }))}
      />
    </AreaContent>
  )
}
