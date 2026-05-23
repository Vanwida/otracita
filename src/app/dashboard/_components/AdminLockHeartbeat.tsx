'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

// -----------------------------------------------------------------------------
// AdminLockHeartbeat — vigila inactividad y visibilidad para autobloquear el
// dashboard tras 30 min sin actividad o cuando el tab estuvo oculto > 5 min.
//
// Montado en src/app/dashboard/layout.tsx (root del dashboard) para que esté
// SIEMPRE activo mientras el jefe navega. NO consulta admin-lock-config ni
// renderiza nada — solo dispara POST /api/admin-lock/lock + router.refresh()
// (esto último fuerza a los page guards a re-evaluar y volver a mostrar el
// overlay PIN en áreas marcadas como sensibles).
//
// Eventos que cuentan como "actividad":
//   · mousemove (desktop), touchstart (iPad), keydown.
//   · click (defensivo — algunos navegadores no disparan mousemove al tap).
//
// Estrategia "passive listeners + throttle":
//   El handler solo guarda el timestamp en una ref (sin re-render). Un
//   setInterval cada 30s comprueba el delta. Esto evita ~100 handlers por
//   segundo en una sesión activa.
// -----------------------------------------------------------------------------

const IDLE_LOCK_MS = 30 * 60 * 1000 // 30 minutos
const HIDDEN_LOCK_MS = 5 * 60 * 1000 // 5 minutos de tab oculto → lock
const CHECK_INTERVAL_MS = 30 * 1000 // chequear cada 30s

export default function AdminLockHeartbeat() {
  const router = useRouter()
  const lastActivityRef = React.useRef<number>(Date.now())
  const hiddenSinceRef = React.useRef<number | null>(null)
  const lockedRef = React.useRef(false)

  React.useEffect(() => {
    function markActive() {
      lastActivityRef.current = Date.now()
      // Si volvió actividad tras un lock previo, permitimos reincidir
      // (puede que el usuario haya desbloqueado de nuevo).
      lockedRef.current = false
    }

    async function fireLock(reason: 'idle' | 'hidden') {
      if (lockedRef.current) return
      lockedRef.current = true
      try {
        await fetch('/api/admin-lock/lock', { method: 'POST' })
      } catch {
        // Silencio — el siguiente check reintenta si sigue inactivo.
        lockedRef.current = false
        return
      }
      // Reset contadores y forzamos al servidor a re-evaluar guards.
      lastActivityRef.current = Date.now()
      hiddenSinceRef.current = null
      router.refresh()
      // Una sola anotación: no hacemos log de "reason" en prod por ruido.
      void reason
    }

    function check() {
      const now = Date.now()
      if (now - lastActivityRef.current >= IDLE_LOCK_MS) {
        fireLock('idle')
        return
      }
      if (hiddenSinceRef.current !== null) {
        if (now - hiddenSinceRef.current >= HIDDEN_LOCK_MS) {
          fireLock('hidden')
        }
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        // Volvió a foreground — si pasaron más de 5 min ocultos, fire ya.
        if (hiddenSinceRef.current !== null) {
          const delta = Date.now() - hiddenSinceRef.current
          hiddenSinceRef.current = null
          if (delta >= HIDDEN_LOCK_MS) {
            fireLock('hidden')
            return
          }
        }
        markActive()
      }
    }

    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('mousemove', markActive, opts)
    window.addEventListener('touchstart', markActive, opts)
    window.addEventListener('keydown', markActive)
    window.addEventListener('click', markActive)
    document.addEventListener('visibilitychange', onVisibility)

    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      window.removeEventListener('mousemove', markActive)
      window.removeEventListener('touchstart', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('click', markActive)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(intervalId)
    }
  }, [router])

  return null
}
