'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Shield } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import { TEAM_AREA_LABELS, type TeamAreaKey } from '@/lib/team-auth/areas'

interface InitialState {
  enabled: boolean
  hasPin: boolean
  pinUpdatedAt: string | null
  allowedAreas: TeamAreaKey[]
}

interface Props {
  publicSlug: string | null
  initial: InitialState
  availableAreas: readonly TeamAreaKey[]
}

// -----------------------------------------------------------------------------
// TeamAccessCard — config UI del modo equipo (un PIN compartido + áreas
// permitidas). Sin scroll vertical: card única en grid 2-col en desktop,
// stack compacto en móvil. El PIN solo se muestra UNA vez tras
// generarlo/cambiarlo — después la card indica "PIN configurado · cambiar".
// -----------------------------------------------------------------------------

export default function TeamAccessCard({ publicSlug, initial, availableAreas }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [hasPin, setHasPin] = useState(initial.hasPin)
  const [pinUpdatedAt, setPinUpdatedAt] = useState<string | null>(initial.pinUpdatedAt)
  const [allowed, setAllowed] = useState<Set<TeamAreaKey>>(new Set(initial.allowedAreas))

  const [revealedPin, setRevealedPin] = useState<string | null>(null)
  const [pinVisible, setPinVisible] = useState(true)
  const [customPin, setCustomPin] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const loginUrl = useMemo(() => {
    if (!publicSlug) return null
    if (typeof window === 'undefined') return `/equipo/${publicSlug}/login`
    return `${window.location.origin}/equipo/${publicSlug}/login`
  }, [publicSlug])

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), FEEDBACK_MS.saved)
  }

  function patchConfig(payload: {
    teamAccessEnabled?: boolean
    teamAllowedAreas?: TeamAreaKey[]
  }) {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fetch('/api/team-access/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo guardar')
          return
        }
        flashSaved()
      } catch {
        setError('Error de red')
      }
    })
  }

  function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    patchConfig({ teamAccessEnabled: next })
  }

  function toggleArea(key: TeamAreaKey) {
    const next = new Set(allowed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setAllowed(next)
    patchConfig({ teamAllowedAreas: Array.from(next) })
  }

  function generatePin(mode: 'random' | 'custom') {
    setError(null)
    const body: Record<string, unknown> =
      mode === 'random' ? { generate: true, length: 6 } : { pin: customPin }
    if (mode === 'custom' && !/^\d{4,6}$/.test(customPin)) {
      setError('El PIN debe ser de 4 a 6 dígitos.')
      return
    }
    startTransition(async () => {
      try {
        const r = await fetch('/api/team-access/pin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo generar el PIN')
          return
        }
        const data = (await r.json()) as { pin: string }
        setRevealedPin(data.pin)
        setPinVisible(true)
        setHasPin(true)
        setPinUpdatedAt(new Date().toISOString())
        setCustomPin('')
        setCustomMode(false)
        flashSaved()
      } catch {
        setError('Error de red')
      }
    })
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), FEEDBACK_MS.copied)
    } catch {
      setError('No se pudo copiar')
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Card principal — toggle + PIN */}
      <section className="rounded-control border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
              enabled ? 'bg-brand-softer text-brand-strong' : 'bg-overlay text-ink-3'
            }`}
          >
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">Acceso del equipo</h2>
                <p className="mt-1 max-w-prose text-sm text-ink-2">
                  Tu equipo entra al panel con un PIN compartido. Tú decides qué áreas ven.
                  Sin login individual, sin trazabilidad por barbero.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleEnabled}
                disabled={pending}
                role="switch"
                aria-checked={enabled}
                aria-label="Permitir acceso al equipo con PIN"
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                  enabled ? 'bg-brand' : 'bg-line'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {enabled && (
              <div className="mt-5 space-y-4">
                <div className="rounded-control border border-line bg-canvas p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <KeyRound className="h-4 w-4 text-ink-2" />
                    PIN compartido
                  </div>

                  {revealedPin ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-control border border-brand-soft bg-brand-softer px-3 py-2 font-mono text-lg tracking-[0.4em] text-brand-strong">
                          {pinVisible ? revealedPin : '•'.repeat(revealedPin.length)}
                        </code>
                        <button
                          type="button"
                          onClick={() => setPinVisible(!pinVisible)}
                          className="rounded-control border border-line bg-surface p-2 text-ink-2 hover:bg-overlay"
                          aria-label={pinVisible ? 'Ocultar PIN' : 'Mostrar PIN'}
                        >
                          {pinVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => copy(revealedPin)}
                          className="rounded-control border border-line bg-surface p-2 text-ink-2 hover:bg-overlay"
                          aria-label="Copiar PIN"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-success" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-ink-3">
                        Cópialo y compártelo con tu equipo. Por seguridad, no podrás volver a verlo.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-ink-2">
                        {hasPin ? (
                          <>
                            <span className="inline-flex h-2 w-2 rounded-full bg-success" />
                            <span>
                              PIN configurado
                              {pinUpdatedAt && (
                                <span className="ml-1 text-ink-3">
                                  · {formatDate(pinUpdatedAt)}
                                </span>
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex h-2 w-2 rounded-full bg-warning" />
                            <span>Sin PIN — genera uno para que el equipo pueda entrar.</span>
                          </>
                        )}
                      </div>

                      {customMode ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={6}
                            value={customPin}
                            onChange={(e) =>
                              setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            placeholder="4-6 dígitos"
                            className="flex-1 rounded-control border border-line bg-surface px-3 py-2 font-mono tracking-widest text-ink outline-none focus:border-brand"
                          />
                          <button
                            type="button"
                            onClick={() => generatePin('custom')}
                            disabled={pending || !customPin}
                            className="rounded-control bg-ink px-3 py-2 text-sm font-medium text-canvas disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomMode(false)
                              setCustomPin('')
                            }}
                            className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-2"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => generatePin('random')}
                            disabled={pending}
                            className="rounded-control bg-ink px-3 py-2 text-sm font-medium text-canvas disabled:opacity-50"
                          >
                            {hasPin ? 'Generar nuevo' : 'Generar PIN'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomMode(true)}
                            disabled={pending}
                            className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-overlay"
                          >
                            Escribir uno
                          </button>
                        </div>
                      )}

                      <p className="text-xs text-ink-3">
                        Si se va alguien del equipo, regenera el PIN.
                      </p>
                    </div>
                  )}
                </div>

                {loginUrl && hasPin && (
                  <div className="rounded-control border border-line bg-canvas p-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
                      Enlace para el equipo
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-control border border-line bg-surface px-3 py-2 text-xs text-ink-2">
                        {loginUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(loginUrl)}
                        className="rounded-control border border-line bg-surface p-2 text-ink-2 hover:bg-overlay"
                        aria-label="Copiar enlace"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Card áreas — checkboxes de qué ve el equipo */}
      <section className="rounded-control border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">Áreas visibles para el equipo</h3>
        <p className="mt-1 text-sm text-ink-2">
          Marca lo que quieras que vea tu equipo cuando entre con el PIN.
        </p>

        <div className="mt-4 space-y-2">
          {availableAreas.map((key) => {
            const isOn = allowed.has(key)
            const isLocked = !enabled
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-canvas px-4 py-3 transition-colors ${
                  isLocked ? 'opacity-50' : 'hover:border-brand-soft'
                }`}
              >
                <span className="text-sm font-medium text-ink">{TEAM_AREA_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggleArea(key)}
                  disabled={isLocked || pending}
                  className="h-4 w-4 rounded border-line accent-[var(--color-brand)]"
                />
              </label>
            )
          })}
        </div>

        <p className="mt-4 text-xs text-ink-3">
          Lo sensible (facturas, nóminas, comisiones, Stripe) se oculta aunque actives un área.
        </p>
      </section>

      {(error || saved) && (
        <div className="md:col-span-2">
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="inline-flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" />
              Guardado
            </p>
          )}
        </div>
      )}
    </div>
  )
}
