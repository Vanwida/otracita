'use client'

import { useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
  ImageIcon,
  X,
  PackageOpen,
} from 'lucide-react'
import { useConfirm } from '../../_components/ConfirmDialog'

// -----------------------------------------------------------------------------
// ProductsManager — CRUD client-side del catálogo de productos.
//
// State local + llamadas a /api/products. Optimista en updates rápidos
// (toggle inline), forma completa para crear/editar (modal-like inline).
//
// Foto: subida directa a Vercel Blob via @vercel/blob/client.upload, con
// el endpoint /api/products/upload firmando los tokens.
// -----------------------------------------------------------------------------

interface Product {
  id: string
  name: string
  description: string
  imageUrl: string
  priceCents: number
  stockQuantity: number | null
  displayOrder: number
}

interface Props {
  initial: Product[]
}

interface DraftProduct {
  id?: string
  name: string
  description: string
  imageUrl: string
  priceEur: string
  stockQuantity: string
}

const EMPTY_DRAFT: DraftProduct = {
  name: '',
  description: '',
  imageUrl: '',
  priceEur: '',
  stockQuantity: '',
}

export default function ProductsManager({ initial }: Props) {
  const [items, setItems] = useState<Product[]>(initial)
  const [draft, setDraft] = useState<DraftProduct | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const confirm = useConfirm()

  const startCreate = () => {
    setError(null)
    setDraft({ ...EMPTY_DRAFT })
  }

  const startEdit = (p: Product) => {
    setError(null)
    setDraft({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      priceEur: (p.priceCents / 100).toFixed(2),
      stockQuantity: p.stockQuantity === null ? '' : String(p.stockQuantity),
    })
  }

  const cancelDraft = () => {
    setDraft(null)
    setError(null)
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !draft) return
    setUploading(true)
    setError(null)
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/products/upload',
      })
      setDraft({ ...draft, imageUrl: blob.url })
    } catch {
      setError('No se pudo subir la imagen')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const save = () => {
    if (!draft) return
    setError(null)

    const name = draft.name.trim()
    if (name.length === 0) {
      setError('Pon un nombre al producto')
      return
    }
    const priceEur = parseFloat(draft.priceEur.replace(',', '.'))
    if (!Number.isFinite(priceEur) || priceEur <= 0) {
      setError('Precio inválido (mínimo 0,01 €)')
      return
    }
    const priceCents = Math.round(priceEur * 100)

    let stockQuantity: number | null = null
    if (draft.stockQuantity.trim() !== '') {
      const s = Number.parseInt(draft.stockQuantity.trim(), 10)
      if (!Number.isFinite(s) || s < 0) {
        setError('Stock inválido (vacío para ilimitado, sino número >= 0)')
        return
      }
      stockQuantity = s
    }

    const payload = {
      name,
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl || null,
      priceCents,
      stockQuantity,
    }

    startTransition(async () => {
      try {
        const url = draft.id ? `/api/products/${draft.id}` : '/api/products'
        const method = draft.id ? 'PATCH' : 'POST'
        const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const d = (await r.json().catch(() => ({}))) as { error?: string; product?: Product }
        if (!r.ok || !d.product) {
          setError(d.error ?? 'No se pudo guardar')
          return
        }
        // Refresca lista local — sustituye o añade.
        setItems((prev) => {
          const next = prev.filter((x) => x.id !== d.product!.id)
          next.push({
            id: d.product!.id,
            name: d.product!.name,
            description: d.product!.description ?? '',
            imageUrl: d.product!.imageUrl ?? '',
            priceCents: d.product!.priceCents,
            stockQuantity: d.product!.stockQuantity,
            displayOrder: d.product!.displayOrder,
          })
          return next.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
        })
        setDraft(null)
      } catch {
        setError('Error de red')
      }
    })
  }

  const remove = async (p: Product) => {
    const ok = await confirm({
      title: `¿Eliminar "${p.name}"?`,
      message:
        'Si tiene ventas históricas se mantendrá oculto pero conservaremos el histórico.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        const r = await fetch(`/api/products/${p.id}`, { method: 'DELETE' })
        if (!r.ok) {
          setError('No se pudo eliminar')
          return
        }
        setItems((prev) => prev.filter((x) => x.id !== p.id))
      } catch {
        setError('Error de red')
      }
    })
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && !draft && (
        <div className="bg-surface border border-line border-dashed rounded-2xl p-8 md:p-12 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-softer border border-brand/20 flex items-center justify-center">
            <PackageOpen className="h-6 w-6 text-brand" />
          </div>
          <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>Sin productos aún</h2>
          <p className="mt-2 text-ink-2 text-sm max-w-md mx-auto">
            Da de alta lo que vendes en mostrador (champú, ceras, peines...) y podrás
            registrar las ventas desde la agenda al cobrar.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="btn-primary mt-5"
          >
            <Plus className="h-4 w-4" />
            Añadir primer producto
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-widest text-ink-3 font-semibold">
            {items.length} {items.length === 1 ? 'producto' : 'productos'}
          </p>
          {!draft && (
            <button
              type="button"
              onClick={startCreate}
              className="btn-primary btn-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir
            </button>
          )}
        </div>
      )}

      {/* Lista de productos */}
      <ul className="space-y-2">
        {items.map((p) => (
          <li
            key={p.id}
            className="bg-surface border border-line rounded-xl p-3 flex items-center gap-3 flex-wrap"
          >
            <div className="h-14 w-14 rounded-lg bg-overlay border border-line shrink-0 overflow-hidden flex items-center justify-center">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-ink-3" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink">{p.name}</p>
              {p.description && (
                <p className="text-xs text-ink-3 truncate">{p.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold text-ink tabular-nums">{(p.priceCents / 100).toFixed(2)} €</p>
              <p className="text-[10px] text-ink-3">
                {p.stockQuantity === null ? 'Stock ilimitado' : `Stock: ${p.stockQuantity}`}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => startEdit(p)}
                disabled={pending}
                className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-overlay transition-colors disabled:opacity-50"
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={pending}
                className="p-2 rounded-lg text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Form crear/editar inline */}
      {draft && (
        <div className="bg-surface border border-brand rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink">
              {draft.id ? 'Editar producto' : 'Nuevo producto'}
            </h3>
            <button
              type="button"
              onClick={cancelDraft}
              className="p-1 rounded text-ink-3 hover:text-ink"
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Foto */}
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 rounded-xl bg-overlay border border-line shrink-0 overflow-hidden flex items-center justify-center">
              {draft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.imageUrl}
                  alt="Vista previa"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-ink-3" />
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay text-xs font-medium px-3 py-2 cursor-pointer transition-colors">
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Subiendo…
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-3.5 w-3.5" />
                    {draft.imageUrl ? 'Cambiar foto' : 'Añadir foto'}
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onPickImage}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {draft.imageUrl && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, imageUrl: '' })}
                  className="ml-2 text-xs text-ink-3 hover:text-danger"
                >
                  Quitar
                </button>
              )}
              <p className="text-[11px] text-ink-3 mt-1">Opcional · PNG/JPG hasta 5 MB</p>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="text-xs font-semibold text-ink-2 mb-1 block">Nombre *</label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ej. Cera moldeadora 100ml"
              maxLength={120}
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-semibold text-ink-2 mb-1 block">Descripción (opcional)</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              maxLength={500}
              placeholder="Detalles que el barbero necesita recordar"
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none resize-none"
            />
          </div>

          {/* Precio + Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-2 mb-1 block">Precio (€) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={draft.priceEur}
                onChange={(e) => setDraft({ ...draft, priceEur: e.target.value })}
                placeholder="12,90"
                className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-2 mb-1 block">Stock</label>
              <input
                type="text"
                inputMode="numeric"
                value={draft.stockQuantity}
                onChange={(e) => setDraft({ ...draft, stockQuantity: e.target.value })}
                placeholder="Vacío = ilimitado"
                className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none tabular-nums"
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={cancelDraft}
              disabled={pending || uploading}
              className="text-xs text-ink-2 hover:text-ink px-3 py-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || uploading}
              className="btn-primary btn-sm"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {draft.id ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
