'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Clock, Euro } from 'lucide-react'

interface Service {
  name: string
  duration: number | string
  price: number | string
}

interface Props {
  initial: Service[]
}

const EMPTY: Service = { name: '', duration: 30, price: 0 }

export default function ServicesManager({ initial }: Props) {
  const [services, setServices] = useState<Service[]>(initial)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Service>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState<Service>(EMPTY)

  const json = JSON.stringify(services)

  // ── Edit ────────────────────────────────────────────────
  const startEdit = (i: number) => {
    setAdding(false)
    setEditingIdx(i)
    setEditDraft({ ...services[i] })
  }

  const saveEdit = () => {
    if (!editDraft.name.trim()) return
    setServices(s => s.map((svc, i) => i === editingIdx ? { ...editDraft } : svc))
    setEditingIdx(null)
  }

  const cancelEdit = () => setEditingIdx(null)

  // ── Delete ───────────────────────────────────────────────
  const remove = (i: number) => {
    setServices(s => s.filter((_, idx) => idx !== i))
    if (editingIdx === i) setEditingIdx(null)
  }

  // ── Add ─────────────────────────────────────────────────
  const startAdd = () => {
    setEditingIdx(null)
    setAddDraft(EMPTY)
    setAdding(true)
  }

  const saveAdd = () => {
    if (!addDraft.name.trim()) return
    setServices(s => [...s, { ...addDraft }])
    setAdding(false)
    setAddDraft(EMPTY)
  }

  const cancelAdd = () => setAdding(false)

  return (
    <div className="space-y-3">
      {/* Hidden input carries JSON back to the parent <form> */}
      <input type="hidden" name="services" value={json} readOnly />

      {/* Column headers */}
      {services.length > 0 && (
        <div className="px-4 flex items-center gap-4 text-xs text-neutral-600 font-medium uppercase tracking-wider">
          <span className="flex-1">Servicio</span>
          <span className="w-16 text-center">Duración</span>
          <span className="w-16 text-right">Precio</span>
          <span className="w-16" />
        </div>
      )}

      {/* Service cards */}
      {services.map((svc, i) => (
        <div key={i} className="bg-[#0f0f0f] border border-[#262626] rounded-xl overflow-hidden">
          {editingIdx === i ? (
            /* ── Inline edit ── */
            <div className="p-4 space-y-3">
              <input
                autoFocus
                value={editDraft.name}
                onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Nombre del servicio"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
                  <input
                    type="number"
                    value={editDraft.duration}
                    onChange={e => setEditDraft(d => ({ ...d, duration: e.target.value }))}
                    placeholder="30"
                    min={5}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-8 pr-10 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">min</span>
                </div>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
                  <input
                    type="number"
                    value={editDraft.price}
                    onChange={e => setEditDraft(d => ({ ...d, price: e.target.value }))}
                    placeholder="0"
                    min={0}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-8 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={cancelEdit} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg px-3 py-1.5 transition-colors">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
                <button type="button" onClick={saveEdit} className="flex items-center gap-1.5 text-xs font-medium text-black bg-emerald-500 hover:bg-emerald-400 rounded-lg px-3 py-1.5 transition-colors">
                  <Check className="h-3.5 w-3.5" /> Guardar
                </button>
              </div>
            </div>
          ) : (
            /* ── Read view ── */
            <div className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{svc.name}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-neutral-500 shrink-0">
                <Clock className="h-3.5 w-3.5" />
                <span>{svc.duration} min</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-neutral-400 shrink-0 w-16 justify-end">
                <span className="font-medium">{svc.price}€</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(i)}
                  className="p-1.5 text-neutral-500 hover:text-white hover:bg-[#1f1f1f] rounded-lg transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Empty state */}
      {services.length === 0 && !adding && (
        <p className="text-sm text-neutral-600 py-2">No hay servicios todavía. Añade el primero.</p>
      )}

      {/* Add new service form */}
      {adding ? (
        <div className="bg-[#0f0f0f] border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <input
            autoFocus
            value={addDraft.name}
            onChange={e => setAddDraft(d => ({ ...d, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && saveAdd()}
            placeholder="Nombre del servicio (ej. Corte de pelo)"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
              <input
                type="number"
                value={addDraft.duration}
                onChange={e => setAddDraft(d => ({ ...d, duration: e.target.value }))}
                placeholder="30"
                min={5}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-8 pr-10 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">min</span>
            </div>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
              <input
                type="number"
                value={addDraft.price}
                onChange={e => setAddDraft(d => ({ ...d, price: e.target.value }))}
                placeholder="0"
                min={0}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-8 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelAdd} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg px-3 py-1.5 transition-colors">
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
            <button type="button" onClick={saveAdd} className="flex items-center gap-1.5 text-xs font-medium text-black bg-emerald-500 hover:bg-emerald-400 rounded-lg px-3 py-1.5 transition-colors">
              <Check className="h-3.5 w-3.5" /> Añadir
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startAdd}
          className="w-full flex items-center justify-center gap-2 text-sm text-neutral-400 hover:text-emerald-400 border border-dashed border-[#2a2a2a] hover:border-emerald-500/40 rounded-xl py-3 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Añadir servicio
        </button>
      )}
    </div>
  )
}
