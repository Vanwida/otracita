import { clearAdminLockSession } from '@/lib/admin-lock/session'

// -----------------------------------------------------------------------------
// POST /api/admin-lock/lock
//
// Borra la cookie del admin-lock. Llamado desde:
//   · Botón "Cerrar gestión" manual del jefe.
//   · AdminLockHeartbeat tras 30 min inactividad.
//   · Visibility API si el tab estuvo oculto > 5 min.
//
// Sin auth previa: solo elimina la cookie que el navegador presenta — no
// hay nada que validar. Misma política que el /api/team-access/logout del
// modelo revertido.
// -----------------------------------------------------------------------------

export async function POST() {
  await clearAdminLockSession()
  return Response.json({ ok: true })
}
