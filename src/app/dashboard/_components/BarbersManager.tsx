'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { upload } from '@vercel/blob/client'
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2, Calendar, Clock, X, Camera, User } from 'lucide-react'
import HoursEditor, { type HoursMap } from './HoursEditor'

// -----------------------------------------------------------------------------
// BarbersManager — CRUD UI for per-staff scheduling.
//
// Replaces the old name-only TeamEditor. Each barber is an expandable card:
//   · Inline name edit (saves on blur).
//   · Reorder ↑↓ to drive displayOrder (agenda column order, any-available
//     tie-breaking, bot list order).
//   · "Horario personalizado" toggle — OFF = inherit shop hours; ON = opens
//     the HoursEditor for this barber.
//   · "Días bloqueados personales" — chip list with add/remove (YYYY-MM-DD).
//   · Eliminar — soft-delete. Blocked by API if the barber has future
//     confirmed bookings, so the UI just surfaces the error cleanly.
//
// Uses SWR so other tabs / devices pick up changes within ~10s without a
// full page refresh. The component self-saves (PATCH) on each field change;
// no global "Save" button, which would be error-prone for per-row edits.
// -----------------------------------------------------------------------------

interface BarberRow {
  id: string
  clientId: string
  name: string
  photoUrl: string | null
  hours: HoursMap | null
  blockedDates: string[]
  displayOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<{ barbers: BarberRow[] }>)

export default function BarbersManager() {
  const { data, mutate, isLoading } = useSWR('/api/barbers', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  })

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const barbers = data?.barbers ?? []

  const addBarber = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/barbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErrorMsg(body?.error || 'No se pudo añadir.')
      } else {
        setNewName('')
        await mutate()
      }
    } finally {
      setCreating(false)
    }
  }

  const patchBarber = async (id: string, patch: Partial<BarberRow>) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/barbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body?.error || 'No se pudo guardar.')
      }
      await mutate()
    } finally {
      setBusyId(null)
    }
  }

  const deleteBarber = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return
    setBusyId(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/barbers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body?.error || 'No se pudo eliminar.')
      }
      await mutate()
    } finally {
      setBusyId(null)
    }
  }

  const move = async (id: string, direction: -1 | 1) => {
    const idx = barbers.findIndex((b) => b.id === id)
    if (idx < 0) return
    const other = barbers[idx + direction]
    if (!other) return
    const a = barbers[idx]
    // Swap displayOrders
    await Promise.all([
      patchBarber(a.id, { displayOrder: other.displayOrder }),
      patchBarber(other.id, { displayOrder: a.displayOrder }),
    ])
  }

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMsg}
        </div>
      )}

      {isLoading && <p className="text-xs text-ink-3">Cargando equipo…</p>}

      {!isLoading && barbers.length === 0 && (
        <p className="text-xs text-ink-3">Aún no has añadido a nadie. Añade al primer barbero abajo.</p>
      )}

      {barbers.map((barber, i) => (
        <BarberCard
          key={barber.id}
          barber={barber}
          expanded={expanded === barber.id}
          busy={busyId === barber.id}
          canMoveUp={i > 0}
          canMoveDown={i < barbers.length - 1}
          onToggle={() => setExpanded(expanded === barber.id ? null : barber.id)}
          onPatch={(patch) => patchBarber(barber.id, patch)}
          onDelete={() => deleteBarber(barber.id, barber.name)}
          onMoveUp={() => move(barber.id, -1)}
          onMoveDown={() => move(barber.id, 1)}
        />
      ))}

      <div className="flex gap-2 pt-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addBarber()
            }
          }}
          placeholder="Nombre del barbero / profesional"
          className="flex-1 bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none"
          disabled={creating}
        />
        <button
          type="button"
          onClick={addBarber}
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-brand hover:bg-brand-strong px-4 py-3 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60 inline-flex items-center gap-2"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Añadir
        </button>
      </div>
    </div>
  )
}

function BarberCard({
  barber,
  expanded,
  busy,
  canMoveUp,
  canMoveDown,
  onToggle,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  barber: BarberRow
  expanded: boolean
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onToggle: () => void
  onPatch: (patch: Partial<BarberRow>) => Promise<void>
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [nameDraft, setNameDraft] = useState(barber.name)
  const [blockedDraft, setBlockedDraft] = useState('')
  const [customHours, setCustomHours] = useState(barber.hours !== null)

  const onNameBlur = () => {
    const name = nameDraft.trim()
    if (name && name !== barber.name) onPatch({ name })
    else if (!name) setNameDraft(barber.name)
  }

  const addBlocked = () => {
    const date = blockedDraft.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    if (barber.blockedDates.includes(date)) return
    onPatch({ blockedDates: [...barber.blockedDates, date].sort() })
    setBlockedDraft('')
  }

  const removeBlocked = (date: string) => {
    onPatch({ blockedDates: barber.blockedDates.filter((d) => d !== date) })
  }

  const onCustomHoursToggle = (next: boolean) => {
    setCustomHours(next)
    if (!next) onPatch({ hours: null })
    // If turning ON, we wait for the HoursEditor's first change to PATCH — the
    // initial state mirrors defaults from HoursEditor itself.
  }

  // Re-using HoursEditor: it only exposes the current value via a hidden
  // input tied to a form. Here we wrap it with a listener via MutationObserver
  // — but simpler: we read its hidden input on a small debounce whenever
  // user edits. We accept the cost of one small adapter.
  const [hoursFormKey, setHoursFormKey] = useState(0)
  const onHoursChange = (next: HoursMap) => onPatch({ hours: next })

  return (
    <div className="border border-line rounded-xl bg-surface overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp || busy}
            className="text-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
            aria-label="Subir"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown || busy}
            className="text-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
            aria-label="Bajar"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="h-9 w-9 rounded-full overflow-hidden bg-overlay border border-line shrink-0 flex items-center justify-center transition-transform hover:scale-105"
          aria-label="Ver foto"
        >
          {barber.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={barber.photoUrl} alt={barber.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-display font-bold text-ink-2">
              {barber.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </button>

        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={onNameBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="flex-1 bg-transparent border-0 text-sm font-medium text-ink focus:outline-none focus:ring-0 px-0"
        />

        {barber.hours !== null && (
          <span className="text-[10px] uppercase tracking-wider text-brand font-semibold px-2 py-0.5 rounded-full bg-brand-softer border border-brand/20">
            Horario propio
          </span>
        )}
        {barber.blockedDates.length > 0 && (
          <span className="text-[10px] uppercase tracking-wider text-ink-2 font-semibold px-2 py-0.5 rounded-full bg-overlay border border-line">
            {barber.blockedDates.length} día{barber.blockedDates.length === 1 ? '' : 's'} bloqueado{barber.blockedDates.length === 1 ? '' : 's'}
          </span>
        )}

        <button
          type="button"
          onClick={onToggle}
          className="text-sm text-ink-2 hover:text-ink px-2 py-1 rounded hover:bg-overlay transition-colors"
        >
          {expanded ? 'Cerrar' : 'Editar'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-ink-3 hover:text-danger transition-colors p-1"
          aria-label={`Eliminar ${barber.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-line bg-overlay/50 p-4 space-y-5">
          {/* ── Foto ────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-ink">
              <Camera className="h-4 w-4 text-ink-2" />
              Foto
            </div>
            <BarberPhotoUpload
              url={barber.photoUrl}
              onChange={(next) => onPatch({ photoUrl: next })}
            />
          </div>

          {/* ── Hours ───────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Clock className="h-4 w-4 text-ink-2" />
                Horario
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={customHours}
                  onChange={(e) => onCustomHoursToggle(e.target.checked)}
                  className="h-4 w-4"
                />
                Horario personalizado
              </label>
            </div>
            {customHours ? (
              <BarberHoursEditor
                key={hoursFormKey}
                initial={barber.hours}
                onChange={onHoursChange}
                onReset={() => {
                  onPatch({ hours: null })
                  setCustomHours(false)
                  setHoursFormKey((k) => k + 1)
                }}
              />
            ) : (
              <p className="text-xs text-ink-3">
                Hereda el horario del negocio. Actívalo para configurar uno propio.
              </p>
            )}
          </div>

          {/* ── Blocked dates ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-ink">
              <Calendar className="h-4 w-4 text-ink-2" />
              Días bloqueados personales
            </div>
            <p className="text-xs text-ink-3 mb-2">
              Vacaciones, días libres, bajas. Se suman a los días bloqueados del negocio.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {barber.blockedDates.length === 0 && (
                <span className="text-xs text-ink-3">Sin días bloqueados.</span>
              )}
              {barber.blockedDates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-line px-2.5 py-1 text-xs"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => removeBlocked(d)}
                    className="text-ink-3 hover:text-danger"
                    aria-label={`Quitar ${d}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={blockedDraft}
                onChange={(e) => setBlockedDraft(e.target.value)}
                className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
              <button
                type="button"
                onClick={addBlocked}
                disabled={!blockedDraft || busy}
                className="rounded-lg bg-overlay border border-line px-3 py-2 text-sm text-ink hover:bg-canvas hover:border-line-strong disabled:opacity-50"
              >
                Añadir día
              </button>
            </div>
          </div>

          {busy && (
            <p className="text-xs text-ink-3 inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando…
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// BarberPhotoUpload — preview + upload/quitar de la foto del barbero.
// Usa el mismo handler /api/public-page/upload que logos/cover (client upload
// vía Vercel Blob). El URL resultante se guarda en barbers.photo_url.
// -----------------------------------------------------------------------------
function BarberPhotoUpload({
  url,
  onChange,
}: {
  url: string | null
  onChange: (next: string | null) => void | Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const ext = (file.type.split('/')[1] || 'bin').toLowerCase()
      const filename = `barber.${ext}`
      const blob = await upload(filename, file, {
        access: 'public',
        handleUploadUrl: '/api/public-page/upload',
        contentType: file.type,
      })
      await onChange(blob.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="relative h-20 w-20 rounded-lg overflow-hidden bg-overlay border border-line shrink-0 flex items-center justify-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Foto del barbero" className="h-full w-full object-cover" />
        ) : (
          <User className="h-8 w-8 text-ink-3" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink cursor-pointer transition-colors">
            <Camera className="h-3.5 w-3.5" />
            {url ? 'Reemplazar' : 'Subir foto'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPick(f)
                e.target.value = ''
              }}
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-3 hover:text-danger transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar
            </button>
          )}
        </div>
        <p className="text-xs text-ink-3 mt-1.5">
          Retrato del barbero. Cuadrada ideal, PNG/JPG/WEBP, máx. 3 MB. Aparece en
          la app al elegir &ldquo;con quién&rdquo;.
        </p>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// BarberHoursEditor — thin wrapper around HoursEditor in controlled mode.
// HoursEditor now exposes an onChange prop so we save per-barber directly.
// -----------------------------------------------------------------------------
function BarberHoursEditor({
  initial,
  onChange,
  onReset,
}: {
  initial: HoursMap | null
  onChange: (next: HoursMap) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-3">
      <HoursEditor initial={initial} onChange={onChange} />
      <button
        type="button"
        onClick={onReset}
        className="text-xs text-ink-3 hover:text-ink underline"
      >
        Volver al horario del negocio
      </button>
    </div>
  )
}
