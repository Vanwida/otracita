// -----------------------------------------------------------------------------
// Skeleton — placeholder del panel Finanzas mientras se carga el mes.
// Replica el ritmo del layout real (hero + 2×2 KPIs + action row +
// colapsables) para que el cambio de mes no haga "saltar" la página.
// -----------------------------------------------------------------------------

export default function FinanzasSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* Hero */}
      <div className="h-44 bg-overlay rounded-2xl" />
      {/* 2×2 KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-overlay rounded-xl" />
        <div className="h-24 bg-overlay rounded-xl" />
        <div className="h-24 bg-overlay rounded-xl" />
        <div className="h-24 bg-overlay rounded-xl" />
      </div>
      {/* Action row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="h-11 bg-overlay rounded-xl" />
        <div className="h-11 bg-overlay rounded-xl" />
        <div className="h-11 bg-overlay rounded-xl" />
      </div>
      {/* Collapsibles */}
      <div className="h-12 bg-overlay rounded-xl mt-4" />
      <div className="h-12 bg-overlay rounded-xl" />
      <div className="h-12 bg-overlay rounded-xl" />
    </div>
  )
}
