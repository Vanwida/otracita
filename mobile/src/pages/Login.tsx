import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { redeemPin, ApiError } from '../lib/api'
import { saveSession } from '../lib/session'

interface Props {
  onAuthenticated: () => void
}

export function LoginPage({ onAuthenticated }: Props) {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!/^\d{6}$/.test(pin)) {
      setError('El PIN debe tener 6 dígitos')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const deviceLabel = navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Mobile'
      const res = await redeemPin(pin, deviceLabel)
      await saveSession(res.token, res.business)
      onAuthenticated()
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="h-full flex flex-col bg-canvas"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-sm mx-auto w-full">
        <h1 className="font-display text-3xl font-bold text-ink mb-2">otracita Cobros</h1>
        <p className="text-sm text-ink-3 text-center mb-8">
          Cobra con tu iPhone usando Tap to Pay
        </p>

        <input
          type="tel"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
            setPin(digits)
            setError(null)
          }}
          placeholder="000000"
          className="w-full h-16 text-center text-3xl tabular-nums tracking-[0.5em] font-bold bg-surface border border-line rounded-2xl outline-none focus:border-brand transition-colors"
          maxLength={6}
        />

        {error && (
          <p className="mt-3 text-sm text-danger text-center">{error}</p>
        )}

        <Button
          size="xl"
          className="mt-6 w-full"
          disabled={pin.length !== 6 || submitting}
          onClick={submit}
        >
          {submitting ? 'Conectando…' : 'Conectar'}
        </Button>

        <p className="mt-8 text-xs text-ink-3 text-center leading-relaxed">
          Genera tu PIN en{' '}
          <span className="font-semibold text-ink-2">otracita.es → Caja → Conectar app móvil</span>.
          Caduca en 10 minutos.
        </p>
      </div>
    </div>
  )
}
