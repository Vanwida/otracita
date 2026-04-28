import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/Login'
import { HomePage } from './pages/Home'
import { CheckoutPage } from './pages/Checkout'
import { SettingsPage } from './pages/Settings'
import { getSessionToken } from './lib/session'
import { getMe } from './lib/api'

// -----------------------------------------------------------------------------
// App — bootstrap.
//
// Al arrancar:
//   1. Lee token del Preferences
//   2. Si hay token, valida con /api/app/mobile/me
//   3. Si válido → Home. Si no → Login (limpia token automáticamente)
// -----------------------------------------------------------------------------

type BootState = 'loading' | 'authenticated' | 'unauthenticated'

export function App() {
  const [boot, setBoot] = useState<BootState>('loading')

  useEffect(() => {
    void (async () => {
      const token = await getSessionToken()
      if (!token) {
        setBoot('unauthenticated')
        return
      }
      try {
        await getMe()
        setBoot('authenticated')
      } catch {
        // 401 ya limpia la sesión vía api.ts
        setBoot('unauthenticated')
      }
    })()
  }, [])

  if (boot === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-canvas">
        <div className="text-ink-3 text-sm">Cargando…</div>
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage onAuthenticated={() => setBoot('authenticated')} />} />
        <Route
          path="/"
          element={
            boot === 'authenticated' ? (
              <HomePage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/checkout"
          element={
            boot === 'authenticated' ? (
              <CheckoutPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            boot === 'authenticated' ? (
              <SettingsPage onLoggedOut={() => setBoot('unauthenticated')} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
