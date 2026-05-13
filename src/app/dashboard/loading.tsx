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
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="h-8 w-48 bg-overlay rounded-lg mb-3" />
        <div className="h-4 w-80 bg-overlay/60 rounded" />
      </div>
      {/* Card grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-32 bg-overlay rounded-2xl" />
        <div className="h-32 bg-overlay rounded-2xl" />
        <div className="h-32 bg-overlay rounded-2xl" />
        <div className="h-32 bg-overlay rounded-2xl" />
      </div>
    </div>
  )
}
