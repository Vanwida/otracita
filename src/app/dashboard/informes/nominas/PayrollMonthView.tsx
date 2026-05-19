'use client'

import { useState } from 'react'
import { Coins } from 'lucide-react'
import MonthStepper from '../../_components/MonthStepper'
import Payroll from '../../finanzas/Payroll'
import {
  prevMonth,
  nextMonth,
  formatMonthLabel,
} from '@/lib/dashboard/month'

// -----------------------------------------------------------------------------
// PayrollMonthView — envoltorio cliente de la pestaña Nóminas que añade el
// selector de mes (prev/siguiente) que faltaba: la nómina vivía clavada al
// mes actual mientras el resto de Informes/Finanzas SÍ navega periodos. El
// dueño necesita revisar nóminas de meses pasados donde canónicamente viven.
//
// Mismo lenguaje visual y semántica de MES que FinanzasClient (mismo
// MonthStepper, mismos helpers `prevMonth`/`nextMonth` ahora compartidos en
// `@/lib/dashboard/month`). La query de servidor (computeMonthlyPayroll vía
// /api/finanzas/payroll) NO cambia: `Payroll` ya hace SWR por `month`.
// -----------------------------------------------------------------------------

interface Props {
  /** Mes inicial `YYYY-MM` resuelto en el servidor (query o mes Madrid). */
  initialMonth: string
}

export default function PayrollMonthView({ initialMonth }: Props) {
  const [month, setMonth] = useState(initialMonth)

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 font-semibold text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            <Coins className="h-4 w-4 text-brand" />
            Nóminas
          </h2>
          <p
            className="mt-0.5 text-ink-2"
            style={{ fontSize: 'var(--text-meta)' }}
          >
            Lo que cobra cada barbero, desde servicios facturados, productos,
            propinas y bonos. Plegado por barbero — click para el desglose
            línea por línea.
          </p>
        </div>
        <MonthStepper
          label={formatMonthLabel(month)}
          onPrev={() => setMonth(prevMonth(month))}
          onNext={() => setMonth(nextMonth(month))}
        />
      </div>
      <Payroll month={month} />
    </>
  )
}
