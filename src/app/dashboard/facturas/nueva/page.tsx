export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { ChevronLeft, Receipt } from 'lucide-react'
import ManualInvoiceForm from './ManualInvoiceForm'

// -----------------------------------------------------------------------------
// /dashboard/facturas/nueva — manual invoice / walk-in flow.
//
// Lets the barber emit a ticket/factura for a customer who didn't come through
// a booking (walk-in, cash handoff, etc). Reuses the same atomic numbering
// sequence as booking-driven invoices so the fiscal log remains sequential.
// -----------------------------------------------------------------------------

interface ChatbotService { name: string; duration?: number; price?: number }
interface BooksyBarber { name: string }

export default async function NuevaFacturaPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!client.invoicingEnabled) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="bg-surface border border-line rounded-2xl p-8 md:p-12 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-softer border border-brand/20 flex items-center justify-center">
            <Receipt className="h-6 w-6 text-brand" />
          </div>
          <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-page-title)' }}>Activa la facturación</h2>
          <p className="mt-2 text-ink-2 max-w-md mx-auto">
            Para emitir tickets y facturas necesitas activar primero la facturación en tus ajustes.
          </p>
          <Link
            href="/dashboard/caja"
            className="btn-primary mt-6"
          >
            Activar facturación
          </Link>
        </div>
      </div>
    )
  }

  // Pre-populate service suggestions from the client's configured services.
  const services: ChatbotService[] = Array.isArray(client.chatbotServices)
    ? (client.chatbotServices as ChatbotService[])
    : []
  const barbers: BooksyBarber[] = Array.isArray(client.booksyServices)
    ? (client.booksyServices as BooksyBarber[])
    : []

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link
        href="/dashboard/facturas"
        className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver a facturas
      </Link>

      <div className="mt-4">
        <h1
          className="font-semibold text-ink leading-tight"
          style={{ fontSize: 'var(--text-page-title)' }}
        >
          Nueva factura
        </h1>
        <p className="mt-2 text-ink-2">
          Emite un ticket o factura para un walk-in o pago directo. Se añadirá a tu libro del mes
          con el siguiente número correlativo.
        </p>
      </div>

      <div className="mt-6">
        <ManualInvoiceForm
          suggestedServices={services}
          suggestedBarbers={barbers}
          ivaRate={client.ivaRate}
        />
      </div>
    </div>
  )
}
