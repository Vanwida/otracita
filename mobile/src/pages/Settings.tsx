import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { getMe, logout, type MeResponse } from '../lib/api'
import { clearSession, getBusinessInfo } from '../lib/session'

interface Props {
  onLoggedOut: () => void
}

export function SettingsPage({ onLoggedOut }: Props) {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const cached = await getBusinessInfo()
      if (cached) setBusinessName(cached.name)
      try {
        const fresh = await getMe()
        setMe(fresh)
        setBusinessName(fresh.business.name)
      } catch {
        /* offline ok */
      }
    })()
  }, [])

  async function handleLogout() {
    if (!confirm('¿Cerrar sesión en este dispositivo?')) return
    setBusy(true)
    try {
      await logout().catch(() => null)
    } finally {
      await clearSession()
      onLoggedOut()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-full bg-canvas" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-10 w-10 rounded-full bg-surface border border-line flex items-center justify-center text-ink-2 active:bg-overlay"
        >
          <span className="text-lg">←</span>
        </button>
        <h1 className="text-lg font-semibold text-ink">Ajustes</h1>
      </header>

      <section className="mx-5 mb-4 rounded-2xl bg-surface border border-line p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-1">Negocio</p>
        <p className="text-base font-semibold text-ink">{businessName ?? '—'}</p>
      </section>

      {me && (
        <section className="mx-5 mb-4 rounded-2xl bg-surface border border-line p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-2">SumUp</p>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between">
              <span className="text-ink-2">Cuenta conectada</span>
              <span className={me.capabilities.sumupConnected ? 'text-success' : 'text-ink-3'}>
                {me.capabilities.sumupConnected ? 'Sí' : 'No'}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-2">Reader pareado</span>
              <span className={me.capabilities.sumupReaderPaired ? 'text-success' : 'text-ink-3'}>
                {me.capabilities.sumupReaderPaired
                  ? me.capabilities.sumupReaderName ?? 'Sí'
                  : 'No'}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-2">Caja activa</span>
              <span className={me.capabilities.cashRegisterEnabled ? 'text-success' : 'text-ink-3'}>
                {me.capabilities.cashRegisterEnabled ? 'Sí' : 'No'}
              </span>
            </li>
          </ul>
        </section>
      )}

      <div className="px-5 mt-8">
        <Button variant="danger" size="lg" className="w-full" disabled={busy} onClick={handleLogout}>
          Cerrar sesión
        </Button>
        <p className="text-[11px] text-ink-3 text-center mt-4">otracita Cobros · v0.1.0</p>
      </div>
    </div>
  )
}
