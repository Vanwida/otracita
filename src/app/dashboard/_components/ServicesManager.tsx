'use client'

import React, { useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Clock, Euro, Star, Pipette } from 'lucide-react'
import SlideOver from './SlideOver'
import {
  SERVICE_COLOR_TOKENS,
  SERVICE_COLOR_CLASSES,
  SERVICE_COLOR_LABELS,
  DEFAULT_SERVICE_COLOR,
  isServiceColorToken,
  isCustomHex,
  isValidServiceColor,
  normalizeServiceColor,
  pickTextColorFor,
  type ServiceColorToken,
} from '@/lib/service-colors'

// -----------------------------------------------------------------------------
// ServicesManager — CRUD de servicios del barbero.
//
// Patrón (regla dura del proyecto): la LISTA es compacta (filas tipo
// DataTable) y la EDICIÓN vive en `SlideOver` lateral derecho — nunca form
// inline, nunca acordeón, nunca modal central. Esto deja respirar a la
// descripción (textarea grande) y elimina el scroll vertical largo en
// Ajustes → Negocio.
//
// Cada servicio: nombre, duración, precio, descripción, `featured`
// (destacar en home) y `colorToken` (color del bloque en agenda — token de
// la paleta saturada O hex custom `#RRGGBB`). Se guardan como JSON en
// `clients.chatbotServices` — añadir campos no requiere migración. La
// whitelist la valida el server action de la página padre (saveBusiness en
// /dashboard/ajustes/page.tsx).
//
// El padre lee el JSON serializado del input oculto `services` para enviarlo
// al server action.
// -----------------------------------------------------------------------------

/** Color de un servicio: token de la paleta saturada o hex custom `#RRGGBB`. */
type ServiceColor = ServiceColorToken | string

interface Service {
  name: string
  duration: number | string
  price: number | string
  description?: string
  featured?: boolean
  /** Token de paleta o hex custom (#RRGGBB en minúsculas). */
  colorToken?: ServiceColor
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
/** Hex inicial del picker custom cuando el barbero abre por primera vez el
 *  selector — fucsia vivo que no se confunde con ningún token canónico. */
const CUSTOM_DEFAULT_HEX = '#ff4dac'

/** Sanea un service entrante. `colorToken` puede ser token canónico, hex
 *  custom o un valor viejo de la paleta pastel (ya no soportado) — en
 *  cualquier caso inválido cae al DEFAULT. */
function withDefaults(s: Service): Service {
  const raw = s.colorToken
  const color: ServiceColor = isValidServiceColor(raw)
    ? isCustomHex(raw)
      ? raw.toLowerCase()
      : (raw as ServiceColorToken)
    : DEFAULT_SERVICE_COLOR
  return {
    description: '',
    featured: false,
    ...s,
    colorToken: color,
  }
}

/** Para un color (token o hex), devuelve `{ bg, textColor }` para inline
 *  style. Útil para previews, chips de fila y dot mini. Usa CSS vars de
 *  globals.css (`--color-svc-<token>` / `--color-on-svc-light|dark`). */
function inlineSwatchStyle(value: ServiceColor): {
  backgroundColor: string
  color: string
} {
  if (isCustomHex(value)) {
    const textLD = pickTextColorFor(value)
    return {
      backgroundColor: value,
      color:
        textLD === 'light'
          ? 'var(--color-on-svc-light)'
          : 'var(--color-on-svc-dark)',
    }
  }
  const token = isServiceColorToken(value) ? value : DEFAULT_SERVICE_COLOR
  const textLD = pickTextColorFor(token)
  return {
    backgroundColor: `var(--color-svc-${token})`,
    color:
      textLD === 'light'
        ? 'var(--color-on-svc-light)'
        : 'var(--color-on-svc-dark)',
  }
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

/**
 * Chip de un color de la paleta. 44×44px (WCAG 2.5.5 target-size). El círculo
 * es el color SATURADO completo; el check va blanco/negro según luminancia.
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
      className={`relative h-11 w-11 rounded-full flex items-center justify-center transition-all ${c.bg} ${
        selected
          ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface scale-105'
          : 'ring-1 ring-line hover:ring-line-strong'
      }`}
    >
      {selected && <Check className={`h-4 w-4 ${c.ink}`} strokeWidth={2.5} />}
    </button>
  )
}

/**
 * Chip "Personalizado" — abre `<input type="color">` HTML5 nativo (sin
 * librería externa). Si el barbero ya tiene un hex elegido lo muestra como
 * fondo; si no, muestra un swatch multicolor con icono de gotero.
 */
function CustomColorChip({
  value,
  selected,
  onSelect,
}: {
  /** Hex actual (cuando el color del servicio es custom) o undefined. */
  value: string | undefined
  selected: boolean
  onSelect: (hex: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasValue = !!value && isCustomHex(value)
  const display = hasValue ? value! : CUSTOM_DEFAULT_HEX
  const textLD = pickTextColorFor(display)
  const overlayColor =
    textLD === 'light' ? 'var(--color-on-svc-light)' : 'var(--color-on-svc-dark)'

  return (
    <div
      className={`relative h-11 w-11 rounded-full transition-all ${
        selected
          ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface scale-105'
          : 'ring-1 ring-line hover:ring-line-strong'
      }`}
      title="Personalizado"
    >
      {/* Input nativo HTML5 — captura el click y abre el picker del SO. NO
          instalamos `react-color`. Mantiene tab-focus para teclado. */}
      <input
        ref={inputRef}
        type="color"
        value={display}
        onChange={(e) => onSelect(e.target.value.toLowerCase())}
        aria-label="Color personalizado"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {/* Visual del chip — pointer-events-none para que el click llegue al
          input que está encima en z-stacking. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full flex items-center justify-center"
        style={
          hasValue
            ? { backgroundColor: display }
            : {
                background:
                  'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
              }
        }
      >
        {selected && hasValue ? (
          <Check className="h-4 w-4" strokeWidth={2.5} style={{ color: overlayColor }} />
        ) : (
          <Pipette
            className="h-4 w-4"
            strokeWidth={2.25}
            style={{ color: hasValue ? overlayColor : 'oklch(0.20 0.02 60)' }}
          />
        )}
      </div>
    </div>
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
  color,
}: {
  name: string
  duration: number | string
  color: ServiceColor
}) {
  const swatch = inlineSwatchStyle(color)
  const displayName = name.trim() || 'Nombre del servicio'
  const displayDuration = duration || 0
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-ink-3 uppercase tracking-wide">
        Así se verá en la agenda
      </p>
      <div
        className="rounded-md px-2.5 py-1.5 max-w-xs"
        style={{
          ...swatch,
          // Hairline interior del mismo color (color-mix con black/white) —
          // mismo patrón que el bloque real en la agenda.
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${swatch.backgroundColor}, ${
            pickTextColorFor(color) === 'light' ? 'black' : 'white'
          } 24%)`,
        }}
      >
        <p className="text-[13px] font-semibold leading-tight truncate">{displayName}</p>
        <p className="text-[11px] opacity-80 leading-tight mt-0.5">{displayDuration} min</p>
      </div>
    </div>
  )
}

/**
 * Form completo del servicio. Vive dentro del SlideOver — descripción con
 * espacio holgado (rows=4), precio/duración en grid 2-col, color picker
 * con los 12 chips + el chip "Personalizado".
 */
function ServiceForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saveLabel,
  featuredCount,
}: {
  draft: Service
  setDraft: (updater: (d: Service) => Service) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
  featuredCount: number
}) {
  const color: ServiceColor = normalizeServiceColor(draft.colorToken)
  const isCustom = isCustomHex(color)
  const featuredLockedOut = !draft.featured && featuredCount >= MAX_FEATURED
  const canSave =
    draft.name.trim().length > 0 &&
    Number(draft.price) >= 0 &&
    Number(draft.duration) >= 5

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cuerpo scrollable del SlideOver */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Nombre */}
        <div className="space-y-1.5">
          <label htmlFor="svc-name" className="text-xs font-medium text-ink">
            Nombre del servicio
          </label>
          <input
            id="svc-name"
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Ej. Corte de pelo"
            className="w-full min-h-11 bg-canvas border border-line rounded-lg px-3 py-2.5 text-sm text-ink focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_var(--color-brand-softer)] outline-none transition-colors"
          />
        </div>

        {/* Duración + Precio */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="svc-duration" className="text-xs font-medium text-ink">
              Duración
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
              <input
                id="svc-duration"
                type="number"
                inputMode="numeric"
                value={draft.duration}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, duration: e.target.value }))
                }
                placeholder="30"
                min={5}
                step={DURATION_STEP}
                className="w-full min-h-11 bg-canvas border border-line rounded-lg pl-8 pr-10 py-2.5 text-sm text-ink focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_var(--color-brand-softer)] outline-none transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">
                min
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="svc-price" className="text-xs font-medium text-ink">
              Precio
            </label>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
              <input
                id="svc-price"
                type="number"
                inputMode="decimal"
                value={draft.price}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, price: e.target.value }))
                }
                placeholder="0"
                min={0}
                step="0.5"
                className="w-full min-h-11 bg-canvas border border-line rounded-lg pl-8 py-2.5 text-sm text-ink focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_var(--color-brand-softer)] outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Color picker — 12 tokens + chip "Personalizado" */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink">
            Color del bloque en la agenda
          </p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_COLOR_TOKENS.map((t) => (
              <ColorChip
                key={t}
                token={t}
                selected={!isCustom && color === t}
                onSelect={(next) =>
                  setDraft((d) => ({ ...d, colorToken: next }))
                }
              />
            ))}
            <CustomColorChip
              value={isCustom ? (color as string) : undefined}
              selected={isCustom}
              onSelect={(hex) => setDraft((d) => ({ ...d, colorToken: hex }))}
            />
          </div>
          {isCustom && (
            <p className="text-[11px] text-ink-3 font-mono">{color}</p>
          )}
        </div>

        {/* Preview en vivo */}
        <ServicePreview
          name={draft.name}
          duration={draft.duration}
          color={color}
        />

        {/* Descripción — rows=4, respira */}
        <div className="space-y-1.5">
          <label htmlFor="svc-desc" className="text-xs font-medium text-ink">
            Descripción
            <span className="text-ink-3 font-normal"> (opcional)</span>
          </label>
          <textarea
            id="svc-desc"
            value={draft.description || ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="Ej.: Corte clásico a máquina y tijera, acabado con toalla caliente."
            rows={4}
            maxLength={240}
            className="w-full bg-canvas border border-line rounded-lg px-3 py-2.5 text-sm text-ink focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_var(--color-brand-softer)] outline-none transition-colors resize-none leading-relaxed"
          />
          <p className="text-[11px] text-ink-3">
            {(draft.description || '').length}/240
          </p>
        </div>

        {/* Destacar */}
        <label className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 cursor-pointer hover:bg-surface transition-colors">
          <input
            type="checkbox"
            checked={!!draft.featured}
            disabled={featuredLockedOut}
            onChange={(e) =>
              setDraft((d) => ({ ...d, featured: e.target.checked }))
            }
            className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              Destacar en la home
            </p>
            <p className="mt-0.5 text-xs text-ink-3">
              Aparece primero en la página pública de reservas.
              {featuredLockedOut && (
                <>
                  {' '}
                  <span className="text-danger">
                    Ya tienes {MAX_FEATURED} destacados activos.
                  </span>
                </>
              )}
            </p>
          </div>
        </label>
      </div>

      {/* Footer fijo del SlideOver — acciones */}
      <div className="shrink-0 border-t border-line bg-surface px-5 py-3 flex items-center justify-end gap-2">
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
  // Estado del SlideOver de edición. -1 = nuevo, n>=0 = editar índice n, null = cerrado.
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState<Service>(EMPTY)

  const featuredCount = services.filter((s) => s.featured).length
  const json = JSON.stringify(services)
  const isNew = editingIdx === -1

  // ── Open edit / add ────────────────────────────────
  const startEdit = (i: number) => {
    setDraft(withDefaults(services[i]))
    setEditingIdx(i)
  }
  const startAdd = () => {
    setDraft(EMPTY)
    setEditingIdx(-1)
  }
  const close = () => setEditingIdx(null)

  // ── Save ────────────────────────────────────────────
  const handleSave = () => {
    if (!draft.name.trim()) return
    const sanitized = withDefaults(draft)
    if (isNew) {
      setServices((s) => [...s, sanitized])
    } else if (editingIdx !== null && editingIdx >= 0) {
      setServices((s) =>
        s.map((svc, i) => (i === editingIdx ? sanitized : svc)),
      )
    }
    close()
  }

  // ── Delete ──────────────────────────────────────────
  const remove = (i: number) => {
    setServices((s) => s.filter((_, idx) => idx !== i))
    if (editingIdx === i) close()
  }

  // ── Toggle featured (sin abrir slideover) ───────────
  const toggleFeatured = (i: number) => {
    setServices((s) =>
      s.map((svc, idx) => {
        if (idx !== i) return svc
        // Bloquear si intenta activar un 4.º destacado.
        if (!svc.featured && featuredCount >= MAX_FEATURED) return svc
        return { ...svc, featured: !svc.featured }
      }),
    )
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="services" value={json} readOnly />

      {/* Header: contador + botón añadir */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3 min-w-0">
          {services.length === 0
            ? 'Aún no hay servicios.'
            : `${services.length} ${
                services.length === 1 ? 'servicio' : 'servicios'
              }`}
          {' · '}
          <span className="inline-flex items-center gap-0.5">
            <Star className="h-3 w-3 inline-block" />
            {featuredCount}/{MAX_FEATURED} destacados
          </span>
        </p>
        <button
          type="button"
          onClick={startAdd}
          className="btn-primary btn-sm shrink-0 inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo servicio
        </button>
      </div>

      {/* Lista compacta — filas estilo DataTable */}
      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-8 text-center">
          <p className="text-sm text-ink-3">
            Añade tu primer servicio para que el bot pueda ofrecerlo.
          </p>
        </div>
      ) : (
        <ul
          role="list"
          className="rounded-xl border border-line bg-surface overflow-hidden divide-y divide-line"
        >
          {services.map((svc, i) => {
            const rowColor = normalizeServiceColor(svc.colorToken)
            const dotBg = isCustomHex(rowColor)
              ? (rowColor as string)
              : `var(--color-svc-${rowColor})`
            return (
              <li key={i}>
                <div className="px-4 py-3 flex items-center gap-3 hover:bg-overlay/40 transition-colors">
                  {/* Color dot */}
                  <span
                    className="h-3 w-3 rounded-full shrink-0 ring-1 ring-line"
                    style={{ backgroundColor: dotBg }}
                    aria-hidden
                  />
                  {/* Star — toggle featured */}
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
                    <Star
                      className="h-4 w-4"
                      fill={svc.featured ? 'currentColor' : 'none'}
                    />
                  </button>
                  {/* Nombre — clickable abre SlideOver */}
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium text-ink truncate">
                      {svc.name}
                    </p>
                    {svc.description && (
                      <p className="text-xs text-ink-3 truncate mt-0.5">
                        {svc.description}
                      </p>
                    )}
                  </button>
                  {/* Duración + Precio */}
                  <div className="flex items-center gap-1 text-xs text-ink-3 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{svc.duration} min</span>
                  </div>
                  <div className="text-xs text-ink-2 shrink-0 w-14 text-right font-medium">
                    {svc.price}€
                  </div>
                  {/* Acciones */}
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
              </li>
            )
          })}
        </ul>
      )}

      {/* SlideOver de edición — único punto de entrada al form completo. */}
      <SlideOver
        open={editingIdx !== null}
        onClose={close}
        title={isNew ? 'Nuevo servicio' : 'Editar servicio'}
        ariaLabel={isNew ? 'Nuevo servicio' : 'Editar servicio'}
      >
        <ServiceForm
          draft={draft}
          setDraft={setDraft}
          onSave={handleSave}
          onCancel={close}
          saveLabel={isNew ? 'Añadir' : 'Guardar'}
          featuredCount={featuredCount}
        />
      </SlideOver>
    </div>
  )
}
