import PageShell from '../_components/PageShell'
import SubTabs from '../_components/SubTabs'

// -----------------------------------------------------------------------------
// Layout del hub Equipo — chrome compartido por las 3 sub-rutas:
//
//   /dashboard/equipo            → Empleados (ruta índice, pestaña por defecto)
//   /dashboard/equipo/turnos     → Turnos    (shell; lo llena WS-B)
//   /dashboard/equipo/comisiones → Comisiones (shell; lo llena WS-F)
//
// Sustituye la nav de anclas (#barberos, #bonos…) de la antigua página
// monolítica por pestañas reales con rutas anidadas (decisión de Alex):
// deep-link y botón atrás del navegador funcionan. El título + la barra
// de pestañas viven aquí (estables al cambiar de tab, sin reflow); cada
// page.tsx hija solo aporta su contenido.
// -----------------------------------------------------------------------------

export default function EquipoLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell
      title="Equipo"
      subtitle="Quién está, cómo cobra y qué tiene activo este mes."
      subTabs={<SubTabs hub="equipo" />}
    >
      {children}
    </PageShell>
  )
}
