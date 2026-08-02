'use client'

import { useEffect, useState } from 'react'
import { Loader2, MapPin, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

// -----------------------------------------------------------------------------
// GoogleLocationList — fetch + selección de la ficha de Google Business
// Profile de este tenant, para cuentas de Google con varias locations (cadena
// multi-local). Sin chasis propio (ni card ni SlideOver) — el consumidor
// decide el contenedor:
//   · GoogleReviewsSection lo pinta INLINE dentro de la card cuando el
//     tenant tiene tokens pero todavía no ha elegido location (justo tras
//     el callback OAuth con reason=multiple-locations, o al volver más
//     tarde sin haber terminado de elegir).
//   · GoogleReviewsSection lo pinta dentro de un SlideOver cuando el
//     barbero, ya conectado, pulsa "Cambiar ubicación" — acción de edición
//     sobre un ajuste ya hecho.
//
// Se elige por TÍTULO ("Private Studio Barcelona"), nunca por el path
// técnico ("accounts/123/locations/456") — un humano no puede confirmar que
// es su barbería mirando un número.
//
// GET /api/google-business/oauth/locations y POST .../locations/select
// hacen el trabajo real (incluida la revalidación server-side de que el
// path pertenece a la cuenta del tenant — ver esas routes). Este componente
// solo pinta el estado y reacciona a sus respuestas.
// -----------------------------------------------------------------------------

interface LocationOption {
  path: string
  title: string
}

interface Props {
  /** Se llama tras un POST .../select exitoso — el padre cierra/refresca. */
  onSelected: (title: string) => void
  /** El refresh_token está revocado (ya limpiado server-side por la route) —
   *  el padre debe apuntar de vuelta al botón "Conectar". */
  onReconnectRequired: () => void
}

// Google reutiliza en silencio la sesión ya abierta en el navegador al
// pulsar "Conectar Google" — casi siempre el Gmail personal del barbero, no
// la cuenta que gestiona la ficha de su barbería en Google Maps. Cuando eso
// pasa, la cuenta autorizada no tiene ninguna "account" de Business Profile
// (`no_accounts`, 502 de la route) o la tiene pero sin ninguna location
// (200 con `locations: []`) — mismo síntoma para el barbero en los dos
// casos, así que comparten exactamente el mismo mensaje y la misma salida.
const WRONG_ACCOUNT_HINT =
  'Puede que hayas iniciado sesión con una cuenta de Google distinta a la que gestiona tu barbería en Google Maps.'

function errorMessage(code: unknown): string {
  switch (code) {
    case 'not_connected':
      return 'Tu cuenta de Google no está conectada.'
    case 'no_accounts':
      return `No encontramos ninguna ficha de empresa en esta cuenta de Google. ${WRONG_ACCOUNT_HINT}`
    case 'google_api_error':
      return 'Google no respondió. Inténtalo de nuevo en unos minutos.'
    case 'invalid_location':
      return 'Esa ficha no pertenece a tu cuenta de Google.'
    case 'network':
      return 'Error de red.'
    default:
      return 'No se pudo cargar la lista de fichas de Google.'
  }
}

/** Reintenta el connect forzando el selector de cuenta de Google — el
 *  core agent cambió authorize URL para que, viniendo de aquí, Google
 *  pregunte qué cuenta usar en vez de reutilizar la sesión abierta. */
function retryWithAccountChooser() {
  window.location.href = '/api/google-business/oauth/start'
}

function RetryAccountButton() {
  return (
    <button
      type="button"
      onClick={retryWithAccountChooser}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      Probar con otra cuenta
    </button>
  )
}

export default function GoogleLocationList({ onSelected, onReconnectRequired }: Props) {
  const [locations, setLocations] = useState<LocationOption[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [selectingPath, setSelectingPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErrorCode(null)
    fetch('/api/google-business/oauth/locations')
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          locations?: LocationOption[]
          error?: string
        }
        if (cancelled) return
        if (r.status === 409 && d.error === 'reconnect_required') {
          onReconnectRequired()
          return
        }
        if (!r.ok) {
          setErrorCode(d.error ?? 'unknown')
          return
        }
        setLocations(d.locations ?? [])
      })
      .catch(() => {
        if (!cancelled) setErrorCode('network')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // onSelected/onReconnectRequired: los consumidores los pasan memoizados
    // con useCallback (identidad estable) precisamente para que este efecto
    // se dispare solo al montar, no en cada re-render del padre.
  }, [onReconnectRequired])

  async function select(loc: LocationOption) {
    setSelectingPath(loc.path)
    setErrorCode(null)
    try {
      const r = await fetch('/api/google-business/oauth/locations/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationPath: loc.path }),
      })
      const d = (await r.json().catch(() => ({}))) as { title?: string; error?: string }
      if (r.status === 409 && d.error === 'reconnect_required') {
        onReconnectRequired()
        return
      }
      if (!r.ok) {
        const code = d.error ?? 'unknown'
        setErrorCode(code)
        toast.error(errorMessage(code))
        return
      }
      onSelected(d.title ?? loc.title)
    } catch {
      setErrorCode('network')
      toast.error(errorMessage('network'))
    } finally {
      setSelectingPath(null)
    }
  }

  if (loading) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Cargando fichas de Google…
      </p>
    )
  }

  if (errorCode) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-danger">{errorMessage(errorCode)}</p>
        {errorCode === 'no_accounts' && <RetryAccountButton />}
      </div>
    )
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-3">
          No encontramos ninguna ficha de empresa en esta cuenta de Google.{' '}
          {WRONG_ACCOUNT_HINT}
        </p>
        <RetryAccountButton />
      </div>
    )
  }

  return (
    <ul className="space-y-1.5">
      {locations.map((loc) => (
        <li key={loc.path}>
          <button
            type="button"
            onClick={() => select(loc)}
            disabled={selectingPath !== null}
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{loc.title}</span>
            {selectingPath === loc.path && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-3" aria-hidden="true" />
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
