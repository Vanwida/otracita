'use client'

import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  User,
  X,
} from 'lucide-react'
import SlideOver from '../../_components/SlideOver'
import NumberInput from '../../_components/NumberInput'

// -----------------------------------------------------------------------------
// RegistrarConsumoSlideOver — punto de entrada DIRECTO para registrar un
// consumo interno (el barbero usa producto en el trabajo) o una merma
// (rotura/vencido/robo) SIN necesidad de cita asociada.
//
// El modal de cita (AddProductSaleModal) solo vende productos al cliente.
// Para descontar stock sin venta, el barbero abre este SlideOver desde la
// página de productos y registra el consumo en 5 segundos.
//
// Body POST /api/products/sales:
//   { productId, quantity, consumptionKind: 'internal' | 'damage',
//     bookingId: null, barberId?: string }
//
// El endpoint ya acepta bookingId=null cuando consumptionKind != null
// (verificado en src/app/api/products/sales/route.ts líneas 88-100).
// -----------------------------------------------------------------------------

interface ProductLite {
  id: string
  name: string
  imageUrl: string | null
  priceCents: number
  stockQuantity: number | null
}

interface BarberLite {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** Se llama tras registro OK para que el caller refresque listas/stock. */
  onCreated?: () => void
}

type ConsumptionKind = 'internal' | 'damage'

const KIND_TABS: {
  key: ConsumptionKind
  label: string
  icon: typeof User
  help: string
}[] = [
  {
    key: 'internal',
    label: 'Consumo barbero',
    icon: User,
    help: 'El barbero usa el producto en el trabajo. Solo descuenta stock.',
  },
  {
    key: 'damage',
    label: 'Merma',
    icon: AlertTriangle,
    help: 'Producto roto, vencido o perdido. Solo descuenta stock.',
  },
]

export default function RegistrarConsumoSlideOver({
  open,
  onClose,
  onCreated,
}: Props) {
  const [kind, setKind] = useState<ConsumptionKind>('internal')
  const [products, setProducts] = useState<ProductLite[]>([])
  const [barbers, setBarbers] = useState<BarberLite[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [barberId, setBarberId] = useState<string>('') // '' = no atribuido
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; kind: ConsumptionKind } | null>(
    null,
  )

  // Resetear y cargar productos + barberos al abrir.
  useEffect(() => {
    if (!open) return
    setLoadingList(true)
    setError(null)
    setSelectedId(null)
    setQuantity(1)
    setBarberId('')
    setNotes('')
    setKind('internal')
    setDone(null)

    Promise.all([
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/barbers').then((r) => r.json()),
    ])
      .then(
        ([prodRes, barbRes]: [
          { products?: ProductLite[]; error?: string },
          { barbers?: BarberLite[]; error?: string },
        ]) => {
          if (prodRes.products) setProducts(prodRes.products)
          else setError(prodRes.error ?? 'No se pudieron cargar productos')
          if (barbRes.barbers) setBarbers(barbRes.barbers)
        },
      )
      .catch(() => setError('Error de red'))
      .finally(() => setLoadingList(false))
  }, [open])

  const selected = products.find((p) => p.id === selectedId) ?? null
  const stockExceeded =
    selected?.stockQuantity !== null &&
    selected != null &&
    quantity > selected.stockQuantity!

  const activeTab = KIND_TABS.find((t) => t.key === kind)!

  const submit = async () => {
    if (!selected) return
    setError(null)
    setSubmitting(true)
    try {
      // Nota: el campo `notes` se prepara para cuando lo soporte el endpoint;
      // hoy se envía a futuro-proof pero el backend lo ignora (no peta).
      const payload: Record<string, unknown> = {
        productId: selected.id,
        quantity,
        consumptionKind: kind,
        // bookingId omitido → el endpoint lo trata como null (consumo sin cita).
      }
      if (barberId) payload.barberId = barberId
      if (notes.trim()) payload.notes = notes.trim()

      const r = await fetch('/api/products/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = (await r.json().catch(() => ({}))) as {
        sale?: unknown
        error?: string
      }
      if (!r.ok) {
        setError(d.error ?? 'No se pudo registrar')
        return
      }
      setDone({ name: selected.name, kind })
      onCreated?.()
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Registrar consumo"
      ariaLabel="Registrar consumo interno o merma de producto"
    >
      {/* Cadena de altura canónica: contenedor flex h-full flex-col → body
          flex-1 overflow-y-auto → footer shrink-0. Garantiza que el botón
          Guardar sea siempre accesible aunque la lista de productos sea
          larga. Mismo patrón que HoursSlideOver. */}
      <div className="flex h-full flex-col">
        {/* BODY scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {done ? (
            <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
              <Check className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-base font-semibold text-ink">{done.name}</p>
              <p className="text-sm text-ink-2 mt-1">
                {done.kind === 'internal'
                  ? 'Consumo interno registrado — sin coste para el cliente'
                  : 'Merma registrada — sin coste para el cliente'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-[0.75rem] text-ink-3">
                Descuenta stock sin venta. No mueve dinero ni aparece en
                ingresos.
              </p>

              {/* Tabs: Consumo barbero / Merma */}
              <div
                role="tablist"
                aria-label="Tipo de salida de stock"
                className="grid grid-cols-2 gap-1 rounded-xl bg-overlay/60 p-1"
              >
                {KIND_TABS.map((t) => {
                  const Icon = t.icon
                  const active = kind === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setKind(t.key)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[0.75rem] font-semibold transition-colors ${
                        active
                          ? 'bg-surface text-ink shadow-sm'
                          : 'text-ink-2 hover:bg-surface/60 hover:text-ink'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[0.75rem] text-ink-3">{activeTab.help}</p>

              {/* Lista de productos */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 block">
                  Producto
                </label>
                {loadingList ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-sm text-ink-3 text-center py-4">
                    No tienes productos dados de alta todavía.
                  </p>
                ) : (
                  <div className="rounded-xl border border-line max-h-56 overflow-y-auto divide-y divide-line">
                    {products.map((p) => {
                      const selectedNow = p.id === selectedId
                      const out =
                        p.stockQuantity !== null && p.stockQuantity === 0
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => !out && setSelectedId(p.id)}
                          disabled={out}
                          className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            selectedNow ? 'bg-brand-softer' : 'hover:bg-overlay/40'
                          }`}
                        >
                          <div className="h-9 w-9 rounded-md bg-overlay border border-line shrink-0 overflow-hidden flex items-center justify-center">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ShoppingBag className="h-4 w-4 text-ink-3" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">
                              {p.name}
                            </p>
                            <p className="text-[11px] text-ink-3">
                              {p.stockQuantity === null
                                ? 'Stock ilimitado'
                                : out
                                  ? 'Agotado'
                                  : `${p.stockQuantity} disponibles`}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Cantidad + Barbero atribuido + Notas — sólo con producto */}
              {selected && (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 block">
                      Cantidad
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="p-2 rounded-lg border border-line bg-surface hover:bg-overlay disabled:opacity-50"
                        disabled={quantity <= 1}
                        aria-label="Restar"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <NumberInput
                        value={quantity}
                        onValueChange={(n) => {
                          if (n !== null)
                            setQuantity(Math.max(1, Math.min(99, n)))
                        }}
                        min={1}
                        max={99}
                        decimals={0}
                        aria-label="Cantidad"
                        className="w-16 text-center bg-surface border border-line rounded-lg py-2 text-sm font-semibold tabular-nums focus:border-brand outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.min(99, quantity + 1))}
                        className="p-2 rounded-lg border border-line bg-surface hover:bg-overlay disabled:opacity-50"
                        disabled={
                          selected.stockQuantity !== null &&
                          quantity >= selected.stockQuantity
                        }
                        aria-label="Sumar"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {stockExceeded && (
                      <p className="text-xs text-danger mt-1.5">
                        Solo quedan {selected.stockQuantity} unidades.
                      </p>
                    )}
                  </div>

                  {/* Barbero atribuido — solo para consumo interno. La merma
                      no se atribuye a nadie (es del local). */}
                  {kind === 'internal' && barbers.length > 0 && (
                    <div>
                      <label
                        htmlFor="rc-barber"
                        className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 block"
                      >
                        Atribuir a barbero (opcional)
                      </label>
                      <select
                        id="rc-barber"
                        value={barberId}
                        onChange={(e) => setBarberId(e.target.value)}
                        className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
                      >
                        <option value="">Sin atribuir</option>
                        {barbers.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="rc-notes"
                      className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 block"
                    >
                      Notas (opcional)
                    </label>
                    <textarea
                      id="rc-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      maxLength={240}
                      placeholder={
                        kind === 'internal'
                          ? 'Ej. uso en degradado, cliente recurrente'
                          : 'Ej. bote roto al caer'
                      }
                      className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none resize-none"
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER sticky — siempre accesible aunque la lista crezca */}
        <div className="shrink-0 border-t border-line bg-surface px-5 py-3 flex items-center justify-end gap-2">
          {done ? (
            <button
              type="button"
              onClick={onClose}
              className="btn-primary btn-sm"
            >
              <Check className="h-3.5 w-3.5" /> Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="btn-secondary btn-sm"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!selected || stockExceeded || submitting}
                className="btn-primary btn-sm"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Guardar
              </button>
            </>
          )}
        </div>
      </div>
    </SlideOver>
  )
}
