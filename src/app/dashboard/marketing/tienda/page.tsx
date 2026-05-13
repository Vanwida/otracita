export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, products } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { ShoppingBag } from 'lucide-react'
import HubBreadcrumb from '@/app/dashboard/_components/HubBreadcrumb'
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
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <HubBreadcrumb current="Tienda de productos" parent={{ label: 'Crecer', href: '/dashboard/crecer' }} />
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
          <ShoppingBag className="h-7 w-7 text-brand" />
          Tienda de productos
        </h1>
        <p className="text-ink-2">
          Da de alta los productos que vendes. Al cobrar un corte, podrás añadir
          la venta desde la agenda con un click. Cada venta se atribuye al barbero
          que la registra para el desglose en Caja.
        </p>
      </header>

      <ProductsManager initial={initialProducts.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        imageUrl: p.imageUrl ?? '',
        priceCents: p.priceCents,
        stockQuantity: p.stockQuantity,
        displayOrder: p.displayOrder,
      }))} />
    </div>
  )
}
