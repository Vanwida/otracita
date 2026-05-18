export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Banknote, ChevronRight } from 'lucide-react'
import AreaContent from '../../_components/AreaContent'
import CajaRegisters from '../../caja/CajaRegisters'
import CajaRollup from './CajaRollup'
import { loadVentasData } from '../_data'

// -----------------------------------------------------------------------------
// /dashboard/ventas/caja — pestaña CIERRE DE CAJA.
//
// Patrón Booksy "Cajas registradoras" (10.06.29): master-detail — lista de
// sesiones a la izquierda + panel de detalle acoplado a la derecha. El
// componente `CajaRegisters` ya implementa esa estructura de dos columnas;
// aquí solo se monta dentro del frame del área.
//
// LÓGICA DE SERVIDOR INTACTA: el histórico read-only lo pasa
// `loadVentasData` (mismo query que el caja/page.tsx original). Abrir/cerrar/
// apuntar siguen usando los mismos endpoints client-side dentro de
// CajaRegisters — no se toca nada.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function VentasCajaPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const d = await loadVentasData(rawPeriod)

  if (!d.client.cashRegisterEnabled) {
    return (
      <AreaContent scroll="fixed" maxWidth="5xl">
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md rounded-control border border-line bg-surface p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control border border-brand/20 bg-brand-softer">
              <Banknote className="h-5 w-5 text-brand" />
            </div>
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              La caja de efectivo está desactivada
            </h2>
            <p className="mt-2 text-[0.8125rem] text-ink-2">
              Actívala para abrir y cerrar caja cada día, cuadrar efectivo y
              datáfono, y llevar el histórico de sesiones.
            </p>
            <Link
              href="/dashboard/ventas/cobros"
              className="btn-primary mt-6"
            >
              Activar en Cobros
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AreaContent>
    )
  }

  // Resumen del periodo (CajaRollup) encima del master-detail de
  // CajaRegisters: el dueño ve de un vistazo cuánto cobró por método y si
  // se le descuadró, sin abrir cierre por cierre. CajaRegisters gestiona su
  // propio layout y scroll interno; ambos viven en la región scrollable.
  return (
    <AreaContent scroll="region" maxWidth="full">
      <CajaRollup
        clientId={d.client.id}
        periodStartIso={d.periodStartIso}
        periodLabel={d.periodLabel}
      />
      <CajaRegisters history={d.registerHistory} />
    </AreaContent>
  )
}
