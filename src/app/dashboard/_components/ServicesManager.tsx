'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Clock, Euro, Star } from 'lucide-react'

// -----------------------------------------------------------------------------
// ServicesManager — CRUD de servicios del barbero.
//
// Cada servicio: nombre, duración, precio, descripción (opcional) y un flag
// `featured` que el barbero activa para que el servicio aparezca destacado
// en la home pública (/b/[slug] muestra 2-3 destacados). El resto se ven al
// abrir "Ver todos".
//
// Los servicios se guardan como JSON en `clients.chatbotServices`, así que
// añadir campos aquí no requiere migración — el shape de runtime se extiende
// libremente y los consumidores leen con defaults.
// -----------------------------------------------------------------------------

interface Service {
  name: string
  duration: number | string
  price: number | string
  description?: string
  featured?: boolean
}

interface Props {
  initial: Service[]
}

const EMPTY: Service = { name: '', duration: 30, price: 0, description: '', featured: false }
const MAX_FEATURED = 3

export default function ServicesManager({ initial }: Props) {
  const [services, setServices] = useState<Service[]>(
    initial.map((s) => ({ description: '', featured: false, ...s })),
  )
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
    setEditDraft({ ...services[i] })
  }

  const saveEdit = () => {
    if (!editDraft.name.trim()) return
    setServices((s) => s.map((svc, i) => (i === editingIdx ? { ...editDraft } : svc)))
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
    setServices((s) => [...s, { ...addDraft }])
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

      {services.map((svc, i) => (
        <div key={i} className="bg-surface border border-line rounded-xl overflow-hidden">
          {editingIdx === i ? (
            /* ── Edit inline ── */
            <div className="p-4 space-y-3">
              <input
                autoFocus
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Nombre del servicio"
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
              <textarea
                value={editDraft.description || ''}
                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Descripción (opcional). Ej.: Corte clásico a máquina y tijera, acabado con toalla caliente."
                rows={2}
                maxLength={240}
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
                  <input
                    type="number"
                    value={editDraft.duration}
                    onChange={(e) => setEditDraft((d) => ({ ...d, duration: e.target.value }))}
                    placeholder="30"
                    min={5}
                    className="w-full bg-surface border border-line rounded-lg pl-8 pr-10 py-2 text-sm text-ink focus:border-brand outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">min</span>
                </div>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
                  <input
                    type="number"
                    value={editDraft.price}
                    onChange={(e) => setEditDraft((d) => ({ ...d, price: e.target.value }))}
                    placeholder="0"
                    min={0}
                    className="w-full bg-surface border border-line rounded-lg pl-8 py-2 text-sm text-ink focus:border-brand outline-none"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!editDraft.featured}
                  onChange={(e) => setEditDraft((d) => ({ ...d, featured: e.target.checked }))}
                  className="h-3.5 w-3.5"
                />
                <Star className="h-3.5 w-3.5" />
                Destacar en la home
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={cancelEdit} className="btn-secondary btn-sm">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
                <button type="button" onClick={saveEdit} className="btn-primary btn-sm">
                  <Check className="h-3.5 w-3.5" /> Guardar
                </button>
              </div>
            </div>
          ) : (
            /* ── Read view ── */
            <div className="px-4 py-3 flex items-center gap-3">
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
                  className="p-1.5 text-ink-3 hover:text-ink hover:bg-overlay rounded-lg transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="p-1.5 text-ink-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {services.length === 0 && !adding && (
        <p className="text-sm text-ink-3 py-2">No hay servicios todavía. Añade el primero.</p>
      )}

      {adding ? (
        <div className="bg-surface border border-brand/30 rounded-xl p-4 space-y-3">
          <input
            autoFocus
            value={addDraft.name}
            onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nombre del servicio (ej. Corte de pelo)"
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none"
          />
          <textarea
            value={addDraft.description || ''}
            onChange={(e) => setAddDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            rows={2}
            maxLength={240}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
              <input
                type="number"
                value={addDraft.duration}
                onChange={(e) => setAddDraft((d) => ({ ...d, duration: e.target.value }))}
                placeholder="30"
                min={5}
                className="w-full bg-surface border border-line rounded-lg pl-8 pr-10 py-2 text-sm text-ink focus:border-brand outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">min</span>
            </div>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3" />
              <input
                type="number"
                value={addDraft.price}
                onChange={(e) => setAddDraft((d) => ({ ...d, price: e.target.value }))}
                placeholder="0"
                min={0}
                className="w-full bg-surface border border-line rounded-lg pl-8 py-2 text-sm text-ink focus:border-brand outline-none"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!addDraft.featured}
              onChange={(e) => setAddDraft((d) => ({ ...d, featured: e.target.checked }))}
              disabled={!addDraft.featured && featuredCount >= MAX_FEATURED}
              className="h-3.5 w-3.5"
            />
            <Star className="h-3.5 w-3.5" />
            Destacar en la home
            {featuredCount >= MAX_FEATURED && !addDraft.featured && (
              <span className="text-ink-3">(máx. {MAX_FEATURED})</span>
            )}
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelAdd} className="btn-secondary btn-sm">
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
            <button type="button" onClick={saveAdd} className="btn-primary btn-sm">
              <Check className="h-3.5 w-3.5" /> Añadir
            </button>
          </div>
        </div>
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
