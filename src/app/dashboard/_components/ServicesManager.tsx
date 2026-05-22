'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Clock, Euro, Star } from 'lucide-react'
import {
  SERVICE_COLOR_TOKENS,
  SERVICE_COLOR_CLASSES,
  SERVICE_COLOR_LABELS,
  DEFAULT_SERVICE_COLOR,
  isServiceColorToken,
  normalizeServiceColor,
  type ServiceColorToken,
} from '@/lib/service-colors'

// -----------------------------------------------------------------------------
// ServicesManager — CRUD de servicios del barbero.
//
// Cada servicio: nombre, duración, precio, descripción (opcional), un flag
// `featured` que el barbero activa para que el servicio aparezca destacado
// en la home pública (/b/[slug] muestra 2-3 destacados) y un `colorToken`
// del catálogo `src/lib/service-colors.ts` que la agenda (#33) usará para
// pintar el bloque de la cita.
//
// Los servicios se guardan como JSON en `clients.chatbotServices`, así que
// añadir campos aquí no requiere migración — el shape de runtime se extiende
// libremente y los consumidores leen con defaults.
//
// Estructura del form (modo add / edit comparten layout):
//   1. Nombre (full width)               ← grupo prioritario
//   2. Duración + Precio (2 cols)        ← grupo prioritario
//   3. Color del bloque (8 chips)        ← nuevo, condiciona la agenda
//   4. Preview en vivo del bloque        ← cierra el loop visual
//   5. Descripción (opcional)            ← secundario
//   6. Destacar en home                  ← secundario
// El layout escala a 1 columna en móvil (la única break es el grid 2×).
// -----------------------------------------------------------------------------

interface Service {
  name: string
  duration: number | string
  price: number | string
  description?: string
  featured?: boolean
  colorToken?: ServiceColorToken
}

interface Props {
  initial: Service[]
}

const EMPTY: Service = {
  name: '',
  duration: 30,
  price: 0,
  description: '',
  featured: false,
  colorToken: DEFAULT_SERVICE_COLOR,
}
const MAX_FEATURED = 3
const DURATION_STEP = 5

/** Sanea un service entrante (puede venir del jsonb sin colorToken). */
function withDefaults(s: Service): Service {
  return {
    description: '',
    featured: false,
    ...s,
    colorToken: isServiceColorToken(s.colorToken) ? s.colorToken : DEFAULT_SERVICE_COLOR,
  }
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

/**
 * Chip de color del picker. 44×44px (WCAG 2.5.5 target-size) en su zona
 * activa, con el círculo de color centrado.
 */
function ColorChip({
  token,
  selected,
  onSelect,
}: {
  token: ServiceColorToken
  selected: boolean
  onSelect: (t: ServiceColorToken) => void
}) {
  const c = SERVICE_COLOR_CLASSES[token]
  const label = SERVICE_COLOR_LABELS[token]
  return (
    <button
      type="button"
      onClick={() => onSelect(token)}
      aria-label={`Color ${label}`}
      aria-pressed={selected}
      title={label}
      className={`relative h-11 w-11 rounded-full flex items-center justify-center transition-all ${
        selected
          ? `${c.bg} ring-2 ${c.ring} ring-offset-2 ring-offset-surface scale-105`
          : `${c.bg} ring-1 ring-line hover:ring-line-strong`
      }`}
    >
      {selected && <Check className={`h-4 w-4 ${c.ink}`} strokeWidth={2.5} />}
    </button>
  )
}

/**
 * Mini-vista del bloque de cita como se verá en la agenda — feedback en
 * vivo para que el barbero entienda lo que está eligiendo sin tener que
 * navegar a la agenda.
 */
function ServicePreview({
  name,
  duration,
  colorToken,
}: {
  name: string
  duration: number | string
  colorToken: ServiceColorToken
}) {
  const c = SERVICE_COLOR_CLASSES[colorToken]
  const displayName = name.trim() || 'Nombre del servicio'
  const displayDuration = duration || 0
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-ink-3 uppercase tracking-wide">Así se verá en la agenda</p>
      <div
        className={`${c.bg} ${c.ink} border-l-[3px] ${c.border} rounded-r-md px-2.5 py-1.5 max-w-xs`}
      >
        <p className="text-[13px] font-semibold leading-tight truncate">{displayName}</p>
        <p className="text-[11px] opacity-80 leading-tight mt-0.5">{displayDuration} min</p>
      </div>
    </div>
  )
}

/**
 * Form compartido por add/edit. Mantener un único componente evita drift
 * entre ambos modos (que es exactamente lo que pasaba antes).
 */
function ServiceDraftForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saveLabel,
  featuredCount,
  emphasized,
}: {
  draft: Service
  setDraft: (updater: (d: Service) => Service) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
  featuredCount: number
  emphasized?: boolean
}) {
  const color: ServiceColorToken = normalizeServiceColor(draft.colorToken)
  const featuredLockedOut = !draft.featured && featuredCount >= MAX_FEATURED
  const canSave = draft.name.trim().length > 0 && Number(draft.price) >= 0 && Number(draft.duration) >= 5

  return (
    <div
      className={`bg-surface border rounded-xl p-4 space-y-4 ${
        emphasized ? 'border-brand/30' : 'border-line'
      }`}
    >
      {/* ── Grupo prioritario: nombre, duración, precio ────────────────── */}
      <div className="space-y-3">
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Nombre del servicio (ej. Corte de pelo)"
          className="w-full bg-surface border border-line rounded-lg px-3 py-2.5 text-sm text-ink focus:border-brand outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
            <input
              type="number"
              inputMode="numeric"
              value={draft.duration}
              onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value }))}
              placeholder="30"
              min={5}
              step={DURATION_STEP}
              className="w-full bg-surface border border-line rounded-lg pl-8 pr-10 py-2.5 text-sm text-ink focus:border-brand outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">min</span>
          </div>
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
            <input
              type="number"
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              placeholder="0"
              min={0}
              step="0.5"
              className="w-full bg-surface border border-line rounded-lg pl-8 py-2.5 text-sm text-ink focus:border-brand outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Color picker ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs text-ink-2 font-medium">Color del bloque en la agenda</p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_COLOR_TOKENS.map((t) => (
            <ColorChip
              key={t}
              token={t}
              selected={color === t}
              onSelect={(next) => setDraft((d) => ({ ...d, colorToken: next }))}
            />
          ))}
        </div>
      </div>

      {/* ── Preview ───────────────────────────────────────────────────── */}
      <ServicePreview name={draft.name} duration={draft.duration} colorToken={color} />

      {/* ── Grupo secundario: descripción + destacar ──────────────────── */}
      <div className="space-y-3 pt-1">
        <textarea
          value={draft.description || ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Descripción (opcional). Ej.: Corte clásico a máquina y tijera, acabado con toalla caliente."
          rows={2}
          maxLength={240}
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none resize-none"
        />
        <label className="inline-flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!draft.featured}
            disabled={featuredLockedOut}
            onChange={(e) => setDraft((d) => ({ ...d, featured: e.target.checked }))}
            className="h-3.5 w-3.5"
          />
          <Star className="h-3.5 w-3.5" />
          Destacar en la home
          {featuredLockedOut && <span className="text-ink-3">(máx. {MAX_FEATURED})</span>}
        </label>
      </div>

      {/* ── Acciones (sticky en móvil) ────────────────────────────────── */}
      <div className="flex gap-2 justify-end sticky bottom-0 -mx-4 -mb-4 px-4 py-3 bg-surface border-t border-line rounded-b-xl">
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="btn-primary btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="h-3.5 w-3.5" /> {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function ServicesManager({ initial }: Props) {
  const [services, setServices] = useState<Service[]>(initial.map(withDefaults))
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Service>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState<Service>(EMPTY)

  const featuredCount = services.filter((s) => s.featured).length
  const json = JSON.stringify(services)

  // ── Edit ────────────────────────────────────────────────
  const startEdit = (i: number) => {
    setAdding(false)
    setEditingIdx(i)
    setEditDraft(withDefaults(services[i]))
  }

  const saveEdit = () => {
    if (!editDraft.name.trim()) return
    const sanitized = withDefaults(editDraft)
    setServices((s) => s.map((svc, i) => (i === editingIdx ? sanitized : svc)))
    setEditingIdx(null)
  }

  const cancelEdit = () => setEditingIdx(null)

  // ── Delete ───────────────────────────────────────────────
  const remove = (i: number) => {
    setServices((s) => s.filter((_, idx) => idx !== i))
    if (editingIdx === i) setEditingIdx(null)
  }

  // ── Toggle featured (sin entrar en edit) ─────────────────
  const toggleFeatured = (i: number) => {
    setServices((s) =>
      s.map((svc, idx) => {
        if (idx !== i) return svc
        // Bloquear si intenta activar un 4.º destacado
        if (!svc.featured && featuredCount >= MAX_FEATURED) return svc
        return { ...svc, featured: !svc.featured }
      }),
    )
  }

  // ── Add ─────────────────────────────────────────────────
  const startAdd = () => {
    setEditingIdx(null)
    setAddDraft(EMPTY)
    setAdding(true)
  }

  const saveAdd = () => {
    if (!addDraft.name.trim()) return
    setServices((s) => [...s, withDefaults(addDraft)])
    setAdding(false)
    setAddDraft(EMPTY)
  }

  const cancelAdd = () => setAdding(false)

  return (
    <div className="space-y-3">
      <input type="hidden" name="services" value={json} readOnly />

      <p className="text-xs text-ink-3">
        Marca con <Star className="h-3 w-3 inline-block -mt-0.5" /> hasta {MAX_FEATURED} servicios
        destacados. Son los que el cliente verá primero en tu página pública
        ({featuredCount}/{MAX_FEATURED} activos).
      </p>

      {services.map((svc, i) => {
        const rowColor = normalizeServiceColor(svc.colorToken)
        const c = SERVICE_COLOR_CLASSES[rowColor]
        return (
          <div key={i} className="bg-surface border border-line rounded-xl overflow-hidden">
            {editingIdx === i ? (
              /* ── Edit inline ── */
              <ServiceDraftForm
                draft={editDraft}
                setDraft={setEditDraft}
                onSave={saveEdit}
                onCancel={cancelEdit}
                saveLabel="Guardar"
                featuredCount={featuredCount}
              />
            ) : (
              /* ── Read view ── */
              <div className="px-4 py-3 flex items-center gap-3">
                {/* Color dot — indicador rápido del color del servicio */}
                <span
                  className={`h-3 w-3 rounded-full shrink-0 ${c.bg} ring-1 ${c.ring}`}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => toggleFeatured(i)}
                  title={
                    svc.featured
                      ? 'Quitar destacado'
                      : featuredCount >= MAX_FEATURED
                      ? `Ya tienes ${MAX_FEATURED} destacados. Quita uno para activar este.`
                      : 'Marcar como destacado'
                  }
                  disabled={!svc.featured && featuredCount >= MAX_FEATURED}
                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                    svc.featured
                      ? 'text-brand hover:text-brand-strong'
                      : 'text-ink-3 hover:text-ink-2 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  <Star className="h-4 w-4" fill={svc.featured ? 'currentColor' : 'none'} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{svc.name}</p>
                  {svc.description && (
                    <p className="text-xs text-ink-3 truncate mt-0.5">{svc.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-ink-3 shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{svc.duration} min</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-ink-2 shrink-0 w-16 justify-end">
                  <span className="font-medium">{svc.price}€</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    aria-label={`Editar ${svc.name}`}
                    className="p-1.5 text-ink-3 hover:text-ink hover:bg-overlay rounded-lg transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Eliminar ${svc.name}`}
                    className="p-1.5 text-ink-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {services.length === 0 && !adding && (
        <p className="text-sm text-ink-3 py-2">No hay servicios todavía. Añade el primero.</p>
      )}

      {adding ? (
        <ServiceDraftForm
          draft={addDraft}
          setDraft={setAddDraft}
          onSave={saveAdd}
          onCancel={cancelAdd}
          saveLabel="Añadir"
          featuredCount={featuredCount}
          emphasized
        />
      ) : (
        <button
          type="button"
          onClick={startAdd}
          className="w-full flex items-center justify-center gap-2 text-sm text-ink-2 hover:text-brand border border-dashed border-line hover:border-brand/40 rounded-xl py-3 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Añadir servicio
        </button>
      )}
    </div>
  )
}
