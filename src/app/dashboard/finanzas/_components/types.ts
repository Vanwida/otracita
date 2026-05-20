// -----------------------------------------------------------------------------
// finanzas/types — shapes públicos compartidos por FinanzasClient y su panel
// imprimible. Extraídos del cliente monolítico para que cada sub-componente
// pueda tipar sus props sin re-declarar.
//
// NO añadir lógica aquí — sólo types.
// -----------------------------------------------------------------------------

export type FinanzasSummary = {
  month: string
  ingresosCents: number
  manualIngresosCents: number
  /** Ingreso por venta de productos este mes (cents). Su comisión ya
   *  se descuenta vía nóminas — incluido en ingresos para que sea simétrico. */
  productsIngresosCents: number
  /** Propinas cobradas este mes (cents). Pasan al barbero vía nómina
   *  (coste ya contabilizado). Sin IVA (gratuidad). */
  tipsIngresosCents: number
  gastosVariablesCents: number
  costosFijosCents: number
  /** Coste del equipo este mes — auto-calculado desde el perfil de pago
   *  de cada barbero (ver /dashboard/equipo). Se suma a totalGastosCents
   *  y por tanto resta del beneficio. */
  nominasCents: number
  totalGastosCents: number
  ivaRepercutidoCents: number
  ivaSoportadoCents: number
  ivaAPagarCents: number
  beneficioBrutoCents: number
  retirosCents: number
  beneficioRealCents: number
  irpfEstimadoCents: number
  prevYearIngresosCents: number
}

export type ManualIncome = {
  id: string
  date: string
  amountCents: number
  notes: string | null
  createdAt: string
}

export type Expense = {
  id: string
  date: string
  amountCents: number
  category: string
  notes: string | null
  createdAt: string
}

export type FixedCost = {
  id: string
  name: string
  amountCents: number
  category: string
  activeFrom: string
  active: boolean
  sortOrder: number
}

export type Withdrawal = {
  id: string
  date: string
  amountCents: number
  notes: string | null
  createdAt: string
}

export type ExpenseCategory =
  | 'productos'
  | 'suministros'
  | 'publicidad'
  | 'personal'
  | 'nomina'
  | 'otro'
