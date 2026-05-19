'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShoppingBag, Plus, Minus, Check } from 'lucide-react'
import Modal from '../_components/Modal'
import NumberInput from '../_components/NumberInput'

// -----------------------------------------------------------------------------
// AddProductSaleModal — modal para registrar la venta de un producto desde
// el detalle de un booking. Auto-asocia la venta al barbero del booking y
// al phone del cliente (atribución per-barbero para el desglose en Caja).
//
// Flujo:
//   1. Carga lista de productos (GET /api/products).
//   2. Barbero selecciona producto + cantidad + método de pago (cash, card, online).
//   3. POST /api/products/sales con bookingId + barberId + customerPhone
//      auto-fill del booking.
//   4. Muestra confirmación y avisa al caller (onCreated) por si quiere
//      refrescar UI.
// -----------------------------------------------------------------------------

interface ProductLite {
  id: string
  name: string
  imageUrl: string | null
  priceCents: number
  stockQuantity: number | null
}

interface Props {
  isOpen: boolean
  bookingId: string
  /** Para mostrar contexto al barbero. */
  customerName: string | null
  /** El servidor también auto-fill, pero pasarlo permite UI clara. */
  barberName: string | null
  onClose: () => void
  onCreated?: () => void
}

type PaymentMethod = 'cash' | 'card' | 'online'

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta (datáfono)',
  online: 'Online (Stripe)',
}

export default function AddProductSaleModal({
  isOpen,
  bookingId,
  customerName,
  barberName,
  onClose,
  onCreated,
}: Props) {
  const [products, setProducts] = useState<ProductLite[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; total: number } | null>(null)

  // Cargar productos al abrir.
  useEffect(() => {
    if (!isOpen) return
    setLoadingList(true)
    setError(null)
    setSelectedId(null)
    setQuantity(1)
    setPaymentMethod('cash')
    setDone(null)
    fetch('/api/products')
      .then((r) => r.json())
      .then((d: { products?: ProductLite[]; error?: string }) => {
        if (d.products) setProducts(d.products)
        else setError(d.error ?? 'No se pudieron cargar productos')
      })
      .catch(() => setError('Error de red'))
      .finally(() => setLoadingList(false))
  }, [isOpen])

  if (!isOpen) return null

  const selected = products.find((p) => p.id === selectedId) ?? null
  const totalCents = selected ? selected.priceCents * quantity : 0
  const stockExceeded = selected?.stockQuantity !== null && selected != null && quantity > selected.stockQuantity!

  const submit = async () => {
    if (!selected) return
    setError(null)
    setSubmitting(true)
    try {
      const r = await fetch('/api/products/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selected.id,
          quantity,
          paymentMethod,
          bookingId,
        }),
      })
      const d = (await r.json().catch(() => ({}))) as { sale?: unknown; error?: string }
      if (!r.ok) {
        setError(d.error ?? 'No se pudo registrar la venta')
        return
      }
      setDone({ name: selected.name, total: totalCents })
      onCreated?.()
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={done ? 'Venta registrada' : 'Añadir venta de producto'}
      subtitle={
        !done && customerName
          ? `Cliente: ${customerName}${barberName ? ` · Barbero: ${barberName}` : ''}`
          : undefined
      }
      size="md"
    >
        {done ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
              <Check className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-base font-semibold text-ink">{done.name}</p>
              <p className="text-sm text-ink-2 mt-1">
                {(done.total / 100).toFixed(2)} € · {PAYMENT_LABELS[paymentMethod]}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-brand hover:bg-brand-strong text-brand-ink font-semibold py-3 text-sm transition-colors"
            >
              Listo
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
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
                  No tienes productos dados de alta. Añádelos en{' '}
                  <a href="/dashboard/marketing/tienda" className="text-brand hover:underline">
                    Marketing → Tienda
                  </a>
                  .
                </p>
              ) : (
                <div className="rounded-xl border border-line max-h-56 overflow-y-auto divide-y divide-line">
                  {products.map((p) => {
                    const selectedNow = p.id === selectedId
                    const out = p.stockQuantity !== null && p.stockQuantity === 0
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
                            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingBag className="h-4 w-4 text-ink-3" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                          <p className="text-[11px] text-ink-3">
                            {p.stockQuantity === null
                              ? 'Stock ilimitado'
                              : out ? 'Agotado' : `${p.stockQuantity} disponibles`}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-ink tabular-nums shrink-0">
                          {(p.priceCents / 100).toFixed(2)} €
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cantidad + Método de pago — solo cuando hay producto seleccionado */}
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
                        // R11: vacío permitido mientras se reescribe; el
                        // clamp de NumberInput (min=1) restaura 1 al salir.
                        // Solo actualizamos el contador con valores válidos.
                        if (n !== null) setQuantity(Math.max(1, Math.min(99, n)))
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
                      disabled={selected.stockQuantity !== null && quantity >= selected.stockQuantity}
                      aria-label="Sumar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <span className="ml-auto text-xs text-ink-3">
                      Total: <span className="font-semibold text-ink tabular-nums">{(totalCents / 100).toFixed(2)} €</span>
                    </span>
                  </div>
                  {stockExceeded && (
                    <p className="text-xs text-danger mt-1.5">
                      Solo quedan {selected.stockQuantity} unidades.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 block">
                    Método de pago
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'card', 'online'] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          paymentMethod === m
                            ? 'border-brand bg-brand-softer text-ink'
                            : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                        }`}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={submit}
              disabled={!selected || stockExceeded || submitting}
              className="w-full rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed text-brand-ink font-semibold py-3 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando…
                </>
              ) : (
                `Registrar venta · ${(totalCents / 100).toFixed(2)} €`
              )}
            </button>
          </div>
        )}
    </Modal>
  )
}
