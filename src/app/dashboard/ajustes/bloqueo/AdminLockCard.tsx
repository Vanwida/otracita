'use client'

import * as React from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Lock, Loader2 } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import {
  ADMIN_LOCKABLE_AREA_LABELS,
  type AdminLockableAreaKey,
} from '@/lib/admin-lock/areas'

interface InitialState {
  lockEnabled: boolean
  hasPin: boolean
  pinUpdatedAt: string | null
  adminLockedAreas: AdminLockableAreaKey[]
}

interface Props {
  initial: InitialState
  availableAreas: readonly AdminLockableAreaKey[]
}

// -----------------------------------------------------------------------------
// AdminLockCard — UI de configuración del bloqueo con PIN del jefe.
//
// Dos cards: toggle + PIN; lista de áreas a bloquear (multi-select). Sin
// scroll vertical en desktop (grid 2-col). El PIN solo se muestra UNA vez
// al generarlo/cambiarlo (no se vuelve a exponer).
// -----------------------------------------------------------------------------

export default function AdminLockCard({ initial, availableAreas }: Props) {
  const [lockEnabled, setLockEnabled] = React.useState(initial.lockEnabled)
  const [hasPin, setHasPin] = React.useState(initial.hasPin)
  const [pinUpdatedAt, setPinUpdatedAt] = React.useState<string | null>(
    initial.pinUpdatedAt,
  )
  const [locked, setLocked] = React.useState<Set<AdminLockableAreaKey>>(
    new Set(initial.adminLockedAreas),
  )

  const [revealedPin, setRevealedPin] = React.useState<string | null>(null)
  const [pinVisible, setPinVisible] = React.useState(true)
  const [customPin, setCustomPin] = React.useState('')
  const [customMode, setCustomMode] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), FEEDBACK_MS.saved)
  }

  function patchConfig(payload: {
    lockEnabled?: boolean
    adminLockedAreas?: AdminLockableAreaKey[]
  }) {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fetch('/api/admin-lock/config', {
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
    const next = !lockEnabled
    setLockEnabled(next)
    patchConfig({ lockEnabled: next })
  }

  function toggleArea(key: AdminLockableAreaKey) {
    const next = new Set(locked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setLocked(next)
    patchConfig({ adminLockedAreas: Array.from(next) })
  }

  function generatePinReq(mode: 'random' | 'custom') {
    setError(null)
    if (mode === 'custom' && !/^\d{4,6}$/.test(customPin)) {
      setError('El PIN debe ser de 4 a 6 dígitos.')
      return
    }
    const body: Record<string, unknown> =
      mode === 'random' ? { generate: true, length: 6 } : { pin: customPin }
    startTransition(async () => {
      try {
        const r = await fetch('/api/admin-lock/pin', {
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
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
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
              lockEnabled ? 'bg-brand-softer text-brand-strong' : 'bg-overlay text-ink-3'
            }`}
          >
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">
                  Bloqueo con PIN del jefe
                </h2>
                <p className="mt-1 max-w-prose text-sm text-ink-2">
                  Las áreas marcadas pedirán tu PIN cuando alguien (incluido tú)
                  las abra. Tras 30 minutos de inactividad se vuelven a bloquear
                  solas.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleEnabled}
                disabled={pending}
                role="switch"
                aria-checked={lockEnabled}
                aria-label="Activar bloqueo con PIN del jefe"
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                  lockEnabled ? 'bg-brand' : 'bg-line'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    lockEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {lockEnabled && (
              <div className="mt-5 space-y-4">
                <div className="rounded-control border border-line bg-canvas p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <KeyRound className="h-4 w-4 text-ink-2" aria-hidden="true" />
                    PIN del jefe
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
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => copy(revealedPin)}
                          className="rounded-control border border-line bg-surface p-2 text-ink-2 hover:bg-overlay"
                          aria-label="Copiar PIN"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-success" aria-hidden="true" />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-ink-3">
                        Apúntalo. Por seguridad, no podrás volver a verlo.
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
                            <span>Sin PIN — genera uno para poder bloquear áreas.</span>
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
                            onClick={() => generatePinReq('custom')}
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
                            onClick={() => generatePinReq('random')}
                            disabled={pending}
                            className="rounded-control bg-ink px-3 py-2 text-sm font-medium text-canvas disabled:opacity-50"
                          >
                            {pending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                            {hasPin ? 'Regenerar' : 'Generar PIN'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomMode(true)}
                            disabled={pending}
                            className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-overlay"
                          >
                            Elegir uno
                          </button>
                        </div>
                      )}

                      <p className="text-xs text-ink-3">
                        Si alguien del equipo se lo aprende, regenera el PIN.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Card áreas — multi-select de qué se bloquea */}
      <section className="rounded-control border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">Áreas a bloquear</h3>
        <p className="mt-1 text-sm text-ink-2">
          Marca lo que NO quieras que vea el equipo sin tu PIN.
        </p>

        <div className="mt-4 space-y-2">
          {availableAreas.map((key) => {
            const isOn = locked.has(key)
            const isLocked = !lockEnabled || !hasPin
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-canvas px-4 py-3 transition-colors ${
                  isLocked ? 'opacity-50' : 'hover:border-brand-soft'
                }`}
              >
                <span className="text-sm font-medium text-ink">
                  {ADMIN_LOCKABLE_AREA_LABELS[key]}
                </span>
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
          Si una área no aparece aquí, no se puede bloquear con PIN.
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
              <Check className="h-4 w-4" aria-hidden="true" />
              Guardado
            </p>
          )}
        </div>
      )}
    </div>
  )
}
