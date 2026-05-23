import * as React from 'react'
import { isAreaLocked } from '@/lib/admin-lock/guard'
import { ADMIN_LOCKABLE_AREA_LABELS, type AdminLockableAreaKey } from '@/lib/admin-lock/areas'
import AdminLockOverlay from './AdminLockOverlay'

// -----------------------------------------------------------------------------
// <AdminLockedArea areaKey="..."> — wrapper SERVER de cualquier área marcada
// como sensible por el jefe. Si el área está bloqueada para esta sesión
// admin (PIN no metido o cookie expirada), renderiza el overlay con el
// candado + input PIN en lugar del contenido.
//
// Patrón:
//
//   export default async function InformesPage() {
//     return (
//       <AdminLockedArea areaKey="informes">
//         <RealContent />
//       </AdminLockedArea>
//     )
//   }
//
// La página padre SIGUE renderizando el AreaShell/breadcrumbs antes — el
// candado solo cubre el contenido principal. El barbero entiende DÓNDE
// está pero ve "necesitas el PIN del jefe para entrar aquí".
// -----------------------------------------------------------------------------

interface Props {
  areaKey: AdminLockableAreaKey
  children: React.ReactNode
}

export default async function AdminLockedArea({ areaKey, children }: Props) {
  const state = await isAreaLocked(areaKey)
  if (!state.locked) return <>{children}</>

  return (
    <AdminLockOverlay
      areaKey={areaKey}
      areaLabel={ADMIN_LOCKABLE_AREA_LABELS[areaKey]}
    />
  )
}
