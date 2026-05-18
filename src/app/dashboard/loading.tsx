// -----------------------------------------------------------------------------
// Skeleton genérico para todas las rutas /dashboard/* mientras Next.js
// resuelve el server component. Mantiene el chrome del layout estable
// (sidebar + top-bar móvil) y muestra una banda + cards placeholder.
//
// No replica exactamente el contenido de cada página — la idea es comunicar
// "estoy cargando" sin saltos visuales bruscos. El usuario ve forma de
// página, no un blank flash.
// -----------------------------------------------------------------------------

export default function DashboardLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas animate-pulse">
      {/* Header compacto fijo — mismo esqueleto que el header real
          viewport-locked (shrink-0), evita salto al resolver. */}
      <header
        className="shrink-0 border-b border-line bg-canvas px-[var(--space-page)]"
        style={{ paddingTop: 'var(--space-card)', paddingBottom: 'var(--space-card)' }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="h-5 w-44 bg-overlay rounded-md" />
          <div className="h-3 w-72 bg-overlay/60 rounded mt-1.5" />
        </div>
      </header>
      {/* Cuerpo scrolleable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto" style={{ padding: 'var(--space-page)' }}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-28 bg-overlay rounded-control" />
            <div className="h-28 bg-overlay rounded-control" />
            <div className="h-28 bg-overlay rounded-control" />
            <div className="h-28 bg-overlay rounded-control" />
          </div>
        </div>
      </div>
    </div>
  )
}
