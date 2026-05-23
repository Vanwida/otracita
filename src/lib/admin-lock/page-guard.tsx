import * as React from 'react'
import { isAreaLocked } from './guard'
import { ADMIN_LOCKABLE_AREA_LABELS, type AdminLockableAreaKey } from './areas'
import AdminLockOverlay from '@/app/dashboard/_components/AdminLockOverlay'

// -----------------------------------------------------------------------------
// renderAdminLockGuard — helper para páginas server-component que quieran
// hacer el check de admin-lock ANTES de queries costosas.
//
// Uso típico (early bail-out):
//
//   const locked = await renderAdminLockGuard('informes')
//   if (locked) return locked
//
// Si el área está bloqueada devuelve el JSX del overlay (página entera
// reemplazada). Si no, devuelve null y la página sigue su curso.
//
// Por qué no usar <AdminLockedArea>: éste evalúa los children eager —
// las queries del page se ejecutan igual. Con este helper, el page hace
// `if (locked) return locked` ANTES de cualquier SELECT/computación.
// -----------------------------------------------------------------------------

export async function renderAdminLockGuard(
  areaKey: AdminLockableAreaKey,
): Promise<React.ReactNode | null> {
  const state = await isAreaLocked(areaKey)
  if (!state.locked) return null
  return (
    <AdminLockOverlay
      areaKey={areaKey}
      areaLabel={ADMIN_LOCKABLE_AREA_LABELS[areaKey]}
    />
  )
}
