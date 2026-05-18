export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, products } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import ProductsManager from './ProductsManager'

// -----------------------------------------------------------------------------
// /dashboard/marketing/tienda — gestión de productos que la barbería vende.
//
// Modelo MANUAL: el barbero registra cada venta desde la agenda al cobrar
// (commit 3 añade el modal). Aquí solo se gestiona el catálogo: alta,
// edición, foto, precio, stock.
//
// Tienda online en /b/[slug] queda fuera de scope inicial — vendrá si los
// datos justifican la inversión.
// -----------------------------------------------------------------------------

export default async function TiendaPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Cargamos los productos activos directos en server-side. ProductsManager
  // gestiona el state local + llamadas a la API para CUD.
  const initialProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.clientId, client.id), eq(products.active, true)))
    .orderBy(asc(products.displayOrder), asc(products.createdAt))

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
        <p
          className="text-ink-2 mb-4"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Da de alta los productos que vendes. Al cobrar un corte, podrás
          añadir la venta desde la agenda con un click. Cada venta se atribuye
          al barbero que la registra para el desglose en Ventas.
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
    </AreaShell>
  )
}
