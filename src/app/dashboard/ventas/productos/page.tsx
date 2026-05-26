export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { barbers, clients, products, productSales } from '@/db/schema'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaContent from '../../_components/AreaContent'
import ProductsManager from '../../marketing/tienda/ProductsManager'
import RegistrarConsumoButton from './RegistrarConsumoButton'
import BarberConsumptionSummary from './BarberConsumptionSummary'

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

  // Task #89 — consumo interno por barbero del MES en curso. Agrupamos por
  // barberId (NULL → "Sin asignar" para registros pre-existentes). El coste
  // estimado usa `cost_price_cents` si está configurado, si no `price_cents`
  // (mismo fallback conservador que el motor de P&L — ver schema productos).
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const consumptionRows = await db
    .select({
      barberId: productSales.barberId,
      barberName: barbers.name,
      qty: sql<number>`COALESCE(SUM(${productSales.quantity}), 0)::int`,
      costCents: sql<number>`
        COALESCE(
          SUM(${productSales.quantity} * COALESCE(${products.costPriceCents}, ${products.priceCents})),
          0
        )::bigint
      `,
    })
    .from(productSales)
    .innerJoin(products, eq(products.id, productSales.productId))
    .leftJoin(barbers, eq(barbers.id, productSales.barberId))
    .where(
      and(
        eq(productSales.clientId, client.id),
        eq(productSales.consumptionKind, 'internal'),
        gte(productSales.soldAt, monthStart),
      ),
    )
    .groupBy(productSales.barberId, barbers.name)

  // Total de unidades para detectar el caso "sin datos" sin un count aparte.
  const totalUnits = consumptionRows.reduce((acc, r) => acc + Number(r.qty), 0)

  // También listamos qué porcentaje aporta cada uno — útil para el control de
  // gasto (detectar el outlier que despilfarra). Si total=0, deja % en null.
  const summary = consumptionRows
    .map((r) => ({
      barberId: r.barberId,
      barberName: r.barberName,
      qty: Number(r.qty),
      costCents: Number(r.costCents),
      pct: totalUnits > 0 ? Number(r.qty) / totalUnits : null,
    }))
    // Orden desc por qty: el que más gasta primero (señal de "mira a éste").
    // Tie-break por nombre asc para estabilidad visual entre renders.
    .sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty
      return (a.barberName ?? 'zzz').localeCompare(b.barberName ?? 'zzz')
    })

  // Filas con barberId IS NULL (legacy del FK lógico) cuentan también, pero
  // se etiquetan "Sin asignar" en el componente para no falsear la lectura.
  // Con onDelete: 'set null', un futuro borrado-duro de barber también
  // caería en "Sin asignar" — edge raro (el flow es soft-delete via active).

  return (
    <AreaContent scroll="region" maxWidth="5xl">
      {/* Toolbar superior: copy explicativo + acción "Registrar consumo".
          La acción "Añadir producto" vive dentro de ProductsManager (junto
          al recuento "X productos"); ésta vive ARRIBA porque no es CRUD del
          catálogo sino una operación de stock que el barbero hace varias
          veces al día. Mobile-first: el botón salta debajo del copy. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p
          className="text-ink-2 max-w-2xl"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Da de alta los productos que vendes. Al cobrar un corte, añades la
          venta desde la agenda con un click. Cada venta se atribuye al
          barbero que la registra y aparece en el Resumen de Ventas.
        </p>
        <RegistrarConsumoButton />
      </div>

      <BarberConsumptionSummary rows={summary} />

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
