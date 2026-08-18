export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Banknote, ChevronRight } from 'lucide-react'
import AreaContent from '../../_components/AreaContent'
import CajaRegisters from '../../caja/CajaRegisters'
import CajaRollup from './CajaRollup'
import EmptyState from '../../_components/EmptyState'
import { loadVentasData } from '../_data'

// -----------------------------------------------------------------------------
// /dashboard/ventas/caja — pestaña CAJA (cierre y cuadre).
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
  searchParams: Promise<{ period?: string; date?: string; start?: string; end?: string }>
}

export default async function VentasCajaPage({ searchParams }: PageProps) {
  const params = await searchParams
  const d = await loadVentasData(params)

  if (!d.client.cashRegisterEnabled) {
    return (
      <AreaContent scroll="fixed" maxWidth="5xl">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Banknote}
            tone="brand"
            title="La caja de efectivo está desactivada"
            description="Actívala para abrir y cerrar caja cada día, cuadrar efectivo y datáfono, y llevar el histórico de sesiones."
            action={
              <Link href="/dashboard/ajustes/pagos" className="btn-primary">
                Activar en Ajustes → Pagos
                <ChevronRight className="h-4 w-4" />
              </Link>
            }
          />
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

      {/* Única puerta al detalle por día (ex-pestaña "Resumen"). Salió del
          nav en U-13 —era la cuarta pestaña que hablaba del mismo dinero—
          pero la vista sigue siendo útil: el mismo informe de cierre para
          CUALQUIER día, no solo la sesión abierta. */}
      <Link
        href="/dashboard/ventas/resumen"
        className="mt-3 flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-2.5 text-[0.8125rem] transition-colors hover:border-brand"
      >
        <span className="text-ink-2">
          <span className="font-semibold text-ink">Ver el detalle de otro día</span>{' '}
          — cierre completo de cualquier fecha, aunque no abrieras caja.
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
      </Link>

      <CajaRegisters history={d.registerHistory} />
    </AreaContent>
  )
}
