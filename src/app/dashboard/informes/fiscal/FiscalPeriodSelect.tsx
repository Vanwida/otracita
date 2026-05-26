'use client'

import DropdownMenu, { type DropdownOption } from '@/components/DropdownMenu'
import { fiscalPeriodOptions } from '@/lib/fiscal/period'

// -----------------------------------------------------------------------------
// FiscalPeriodSelect — selector URL-driven del periodo fiscal (trimestre /
// año) que alimenta la pestaña Fiscal. Mismo patrón que MonthSelect en
// /dashboard/facturas/FiltersBar: cada opción es un <Link> a la misma
// ruta con `?period=YYYY-Qn` o `?period=YYYY`, sin estado React.
//
// La lista de opciones se calcula en el cliente: año en curso (4
// trimestres + anual) + año anterior. Si el barbero necesita un trimestre
// más antiguo, edita la URL — caso raro tras 12 meses de uso.
// -----------------------------------------------------------------------------

interface Props {
  currentKey: string
  basePath: string
}

export default function FiscalPeriodSelect({ currentKey, basePath }: Props) {
  const options: DropdownOption[] = fiscalPeriodOptions().map((p) => ({
    value: p.key,
    label: p.label,
    href: `${basePath}?period=${p.key}`,
  }))

  return (
    <DropdownMenu
      label="Periodo fiscal"
      options={options}
      selected={currentKey}
      minWidth="11rem"
    />
  )
}
