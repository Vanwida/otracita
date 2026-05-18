import AreaShell from '../_components/AreaShell'

// -----------------------------------------------------------------------------
// Layout del área Equipo — chrome compartido por las pestañas:
//
//   /dashboard/equipo            → Empleados  (ruta índice, por defecto)
//   /dashboard/equipo/turnos     → Turnos
//   /dashboard/equipo/comisiones → Comisiones
//   /dashboard/equipo/bonos      → Bonos      (catálogo + progreso del mes)
//   /dashboard/equipo/nominas    → Nóminas    (computadas del mes)
//
// Patrón Booksy "Empleados / Turnos / Recursos / Comisiones" (10.17.08):
// rail de iconos + BARRA DE PESTAÑAS, cada pestaña cabe en pantalla, la
// página NO scrollea. Antes el índice apilaba Barberos+Bonos+Progreso+
// Nóminas en una sola página larga (justo el anti-patrón) — ahora cada
// bloque es su pestaña. Migrado de PageShell+SubTabs a AreaShell (shell
// canónico, consistencia por construcción). Contenido/queries intactos.
// -----------------------------------------------------------------------------

export default function EquipoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AreaShell area="equipo">{children}</AreaShell>
}
