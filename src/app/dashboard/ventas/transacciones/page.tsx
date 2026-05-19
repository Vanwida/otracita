export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { bookings, clients, products, productSales } from '@/db/schema'
import { and, desc, eq, ne } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AreaContent from '../../_components/AreaContent'
import DataTable, { type Column } from '../../_components/DataTable'

// -----------------------------------------------------------------------------
// /dashboard/ventas/transacciones — pestaña TRANSACCIONES (Booksy literal:
// la lista plana de TODAS las ventas, sin importar el método de pago).
//
// Es el "libro de ventas" que un barbero de Booksy busca para ver qué entró
// hoy. Agrega DOS fuentes ya existentes — NO crea concepto nuevo:
//   · bookings completadas (servicio cobrado — incluye walk-ins del TPV, que
//     son reservas sintéticas source='pos')
//   · product_sales (productos vendidos, atados o no a cita)
//
// Las dos se unifican en filas {fecha, concepto, quién, método, importe} y
// se ordenan por fecha desc. Mismo patrón de query que `_data.ts` (KPIs de
// Resumen) — no se reinventa el cálculo, solo se lista el detalle.
//
// Multi-tenant: client por sesión, nunca por request. La página no
// scrollea: DataTable gestiona su propio overflow dentro del frame.
// -----------------------------------------------------------------------------

type Method = 'cash' | 'card' | 'online' | null

interface LedgerRow {
  id: string
  soldAt: Date
  concept: string
  who: string | null
  method: Method
  amountCents: number
  kind: 'servicio' | 'producto'
}

const METHOD_LABEL: Record<'cash' | 'card' | 'online', string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  online: 'Online / Bizum',
}

function fmtEur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function VentasTransaccionesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Servicios cobrados — bookings completadas con precio. bookings solo
  // tiene createdAt (no updatedAt): para un walk-in del TPV crear y cobrar
  // es el mismo instante; para una cita normal es cuándo se reservó —
  // suficiente para ordenar el libro operativo. Tope 200 filas: es una
  // lista de trabajo, no un export (eso vive en Facturas).
  const bookingRows = await db
    .select({
      id: bookings.id,
      service: bookings.service,
      customerName: bookings.customerName,
      barber: bookings.barber,
      price: bookings.price,
      paymentMethod: bookings.paymentMethod,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.status, 'completed'),
        ne(bookings.price, 0),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(200)

  // Productos vendidos. join a products solo para el nombre snapshot.
  const productRows = await db
    .select({
      id: productSales.id,
      name: products.name,
      quantity: productSales.quantity,
      totalCents: productSales.totalCents,
      paymentMethod: productSales.paymentMethod,
      customerPhone: productSales.customerPhone,
      soldAt: productSales.soldAt,
    })
    .from(productSales)
    .leftJoin(products, eq(productSales.productId, products.id))
    .where(eq(productSales.clientId, client.id))
    .orderBy(desc(productSales.soldAt))
    .limit(200)

  const rows: LedgerRow[] = [
    ...bookingRows
      .filter((b) => b.price != null && b.price > 0)
      .map<LedgerRow>((b) => ({
        id: `b-${b.id}`,
        soldAt: b.createdAt,
        concept: b.service,
        who: b.customerName ?? b.barber ?? null,
        method: (b.paymentMethod as Method) ?? null,
        amountCents: Math.round((b.price ?? 0) * 100),
        kind: 'servicio',
      })),
    ...productRows.map<LedgerRow>((p) => ({
      id: `p-${p.id}`,
      soldAt: p.soldAt,
      concept:
        (p.name ?? 'Producto') + (p.quantity > 1 ? ` x${p.quantity}` : ''),
      who: null,
      method: (p.paymentMethod as Method) ?? null,
      amountCents: p.totalCents,
      kind: 'producto',
    })),
  ]
    .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime())
    .slice(0, 200)

  const totalCents = rows.reduce((acc, r) => acc + r.amountCents, 0)

  const columns: Column<LedgerRow>[] = [
    {
      key: 'when',
      header: 'Fecha',
      cell: (r) => (
        <span className="tabular-nums text-ink-2">{fmtDateTime(r.soldAt)}</span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'concept',
      header: 'Concepto',
      cell: (r) => (
        <div className="min-w-0">
          <span className="font-semibold text-ink">{r.concept}</span>
          {r.who && (
            <span className="ml-1.5 text-ink-3">· {r.who}</span>
          )}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Tipo',
      cell: (r) => (
        <span className="text-ink-2 capitalize">{r.kind}</span>
      ),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'method',
      header: 'Método',
      cell: (r) => (
        <span className="text-ink-2">
          {r.method ? METHOD_LABEL[r.method] : '—'}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="font-bold text-ink">{fmtEur(r.amountCents)}</span>
      ),
    },
  ]

  return (
    <AreaContent scroll="region" maxWidth="7xl">
      <div className="mb-4 flex items-baseline justify-between">
        <p
          className="text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Todas las ventas cobradas (servicios y productos), de cualquier
          método. Las últimas 200.
        </p>
        <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
          Total{' '}
          <span
            className="ml-1 tabular-nums text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            {fmtEur(totalCents)}
          </span>
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        ariaLabel="Libro de transacciones"
        emptyLabel="Todavía no has cobrado ninguna venta. Empieza en Nueva venta."
      />
    </AreaContent>
  )
}
