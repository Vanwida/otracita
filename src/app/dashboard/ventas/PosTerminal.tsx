'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap,
  Scissors,
  ShoppingBag,
  Calculator,
  Plus,
  Minus,
  Trash2,
  X,
  Loader2,
  Check,
  Banknote,
  CreditCard,
  Smartphone,
  Globe,
  Pencil,
  User,
  Receipt,
} from 'lucide-react'
import NumberInput from '../_components/NumberInput'
import SumupCheckoutPrompt from '../_components/SumupCheckoutPrompt'
import type {
  PosBarberItem,
  PosProductItem,
  PosServiceItem,
} from './_data'

// -----------------------------------------------------------------------------
// PosTerminal — TPV "Nueva venta" estilo Booksy (10.00.16 / .25 / .41 /
// 01.18 / 01.36). Tres zonas:
//
//   1. Rail de categorías (Venta rápida · Servicios · Productos · Cantidad
//      personalizada) — igual orden y nombres que Booksy.
//   2. Rejilla de tiles nombre+precio (servicios y/o productos según
//      categoría). "Cantidad personalizada" abre un numpad como Booksy.
//   3. Carrito acoplado a la derecha: cliente opcional, líneas con qty +
//      descuento, TOTAL, botón "Seleccionar método de pago" → grid de
//      métodos (Efectivo/Tarjeta/Bizum/Online) → CONFIRMAR Y PAGAR →
//      recibo "Pago finalizado" (Booksy 10.01.18). "Editar artículo"
//      (10.01.36): precio / descuento % / cantidad.
//
// El cobro REUSA el pipeline existente: POST /api/pos/sale crea una reserva
// sintética vía createBooking y la cierra (auto-factura + caja). Cero
// duplicación de lógica fiscal. Soporta walk-in SIN cita previa.
//
// Tokens only, sin Fraunces, castellano informal, AAA, viewport-fit (la
// página no scrollea; los paneles internos gestionan su propio overflow).
// -----------------------------------------------------------------------------

type Category = 'rapida' | 'servicios' | 'productos' | 'personalizada'

type LineKind = 'service' | 'product' | 'custom'

interface CartLine {
  /** Id único de la línea en el carrito (no del producto). */
  uid: string
  kind: LineKind
  /** Solo para productos: id real para enviar al endpoint. */
  productId?: string
  name: string
  /** Precio unitario en euros (IVA incluido). Editable para custom/servicio. */
  unitPriceEuros: number
  quantity: number
  /** Descuento porcentual 0-100 sobre la línea. */
  discountPct: number
  /** Minutos — solo relevante para servicios (alimenta la reserva). */
  durationMin: number
}

interface PaymentMethodDef {
  key: 'cash' | 'card' | 'online'
  label: string
  hint: string
  icon: typeof Banknote
}

// Booksy 10.00.41: Efectivo / Terminal tarjeta / Bizum / … Mapeamos a los 3
// métodos que el pipeline de caja entiende (cash/card/online). Bizum es un
// pago online para el cuadre (entra como 'online' en cash_movements) pero se
// muestra como su propio tile porque el barbero lo piensa así.
const PAYMENT_METHODS: PaymentMethodDef[] = [
  { key: 'cash', label: 'Efectivo', hint: 'Dinero en mano', icon: Banknote },
  {
    key: 'card',
    label: 'Tarjeta',
    hint: 'Datáfono físico',
    icon: CreditCard,
  },
  { key: 'online', label: 'Bizum', hint: 'Pago por móvil', icon: Smartphone },
  {
    key: 'online',
    label: 'Online',
    hint: 'Link de pago / Stripe',
    icon: Globe,
  },
]

const CATEGORIES: { key: Category; label: string; icon: typeof Zap }[] = [
  { key: 'rapida', label: 'Venta rápida', icon: Zap },
  { key: 'servicios', label: 'Servicios', icon: Scissors },
  { key: 'productos', label: 'Productos', icon: ShoppingBag },
  { key: 'personalizada', label: 'Cantidad personalizada', icon: Calculator },
]

function eur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

function eurFromEuros(euros: number): string {
  return `${euros.toFixed(2).replace('.', ',')} €`
}

function lineTotalCents(l: CartLine): number {
  const gross = Math.round(l.unitPriceEuros * 100) * l.quantity
  const disc = Math.round((gross * l.discountPct) / 100)
  return Math.max(0, gross - disc)
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

interface Props {
  services: PosServiceItem[]
  products: PosProductItem[]
  barbers: PosBarberItem[]
  invoicingEnabled: boolean
  /** % de IVA del negocio (España default 21). Para el desglose del recibo. */
  ivaRate: number
  /** SumUp conectado + Reader pareado → "Tarjeta" cobra con datáfono real. */
  sumupReaderConnected: boolean
}

interface ReceiptSnapshot {
  lines: { name: string; qty: number; totalCents: number }[]
  /** Total IVA incluido (lo que paga el cliente). */
  totalCents: number
  methodLabel: string
  customerName: string | null
}

type Stage = 'cart' | 'payment' | 'done'

export default function PosTerminal({
  services,
  products,
  barbers,
  invoicingEnabled,
  ivaRate,
  sumupReaderConnected,
}: Props) {
  const router = useRouter()
  const [category, setCategory] = useState<Category>('rapida')
  const [lines, setLines] = useState<CartLine[]>([])
  const [barberId, setBarberId] = useState<string>(barbers[0]?.id ?? '')
  const [customerName, setCustomerName] = useState('')
  // Cliente conocido adjuntado (Booksy "Sugiere para este cliente"). Si se
  // adjunta, su teléfono enlaza la venta a su ficha → historial, fidelidad,
  // followup van a la persona correcta en vez de a un walk-in anónimo.
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null)
  const [custMatches, setCustMatches] = useState<
    { name: string; phone: string }[]
  >([])
  const [custOpen, setCustOpen] = useState(false)
  const custBoxRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<Stage>('cart')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CartLine | null>(null)
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null)
  // SumUp Reader: cuando se prepara una venta para cobro con datáfono,
  // guardamos el bookingId+importe y abrimos SumupCheckoutPrompt (reusado
  // tal cual de la agenda). El snapshot del recibo se guarda aparte para
  // mostrarlo cuando el callback confirme el cobro.
  const [sumupCheckout, setSumupCheckout] = useState<{
    bookingId: string
    amountCents: number
    snapshot: ReceiptSnapshot
  } | null>(null)

  // Numpad "Cantidad personalizada" (Booksy 10.00.25).
  const [customAmount, setCustomAmount] = useState('')
  const [customDesc, setCustomDesc] = useState('')

  // Typeahead de cliente conocido: al teclear el nombre, busca coincidencias
  // (debounce 250ms). Al adjuntar un cliente fijamos su teléfono; si el
  // barbero reescribe el nombre a mano, soltamos el enlace (vuelve a ser
  // walk-in anónimo). Solo busca con ≥2 chars y mientras no haya enlace.
  useEffect(() => {
    if (linkedPhone) return
    const term = customerName.trim()
    if (term.length < 2) {
      setCustMatches([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/pos/customers?q=${encodeURIComponent(term)}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d: { customers?: { name: string; phone: string }[] }) => {
          setCustMatches(d.customers ?? [])
          setCustOpen(true)
        })
        .catch(() => {
          /* búsqueda best-effort; sin coincidencias no rompe la venta */
        })
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [customerName, linkedPhone])

  // Cierra el dropdown al hacer click fuera.
  useEffect(() => {
    if (!custOpen) return
    const onDown = (e: MouseEvent) => {
      if (custBoxRef.current && !custBoxRef.current.contains(e.target as Node)) {
        setCustOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [custOpen])

  const totalCents = useMemo(
    () => lines.reduce((acc, l) => acc + lineTotalCents(l), 0),
    [lines],
  )

  // Tiles del centro según categoría. "Venta rápida" = servicios más
  // habituales (todos, Booksy los ordena por uso; sin telemetría aún los
  // mostramos en orden de catálogo).
  const tiles = useMemo(() => {
    if (category === 'productos') {
      return products.map((p) => ({
        key: `p-${p.id}`,
        name: p.name,
        priceLabel: eur(p.priceCents),
        onAdd: () => addProduct(p),
        disabled: p.stockQuantity !== null && p.stockQuantity <= 0,
      }))
    }
    // rapida + servicios → servicios del catálogo
    return services.map((s, i) => ({
      key: `s-${i}-${s.name}`,
      name: s.name,
      priceLabel: eurFromEuros(s.priceEuros),
      onAdd: () => addService(s),
      disabled: false,
    }))
  }, [category, services, products])

  function addService(s: PosServiceItem) {
    setLines((prev) => [
      ...prev,
      {
        uid: uid(),
        kind: 'service',
        name: s.name,
        unitPriceEuros: s.priceEuros,
        quantity: 1,
        discountPct: 0,
        durationMin: s.durationMin,
      },
    ])
  }

  function addProduct(p: PosProductItem) {
    setLines((prev) => {
      const existing = prev.find(
        (l) => l.kind === 'product' && l.productId === p.id,
      )
      if (existing) {
        return prev.map((l) =>
          l.uid === existing.uid ? { ...l, quantity: l.quantity + 1 } : l,
        )
      }
      return [
        ...prev,
        {
          uid: uid(),
          kind: 'product',
          productId: p.id,
          name: p.name,
          unitPriceEuros: p.priceCents / 100,
          quantity: 1,
          discountPct: 0,
          durationMin: 0,
        },
      ]
    })
  }

  function addCustom() {
    const amount = Number.parseFloat(customAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Escribe un importe válido.')
      return
    }
    setError(null)
    setLines((prev) => [
      ...prev,
      {
        uid: uid(),
        kind: 'custom',
        name: customDesc.trim() || 'Cantidad personalizada',
        unitPriceEuros: amount,
        quantity: 1,
        discountPct: 0,
        durationMin: 0,
      },
    ])
    setCustomAmount('')
    setCustomDesc('')
    setCategory('rapida')
  }

  function setQuantity(uidv: string, q: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.uid === uidv ? { ...l, quantity: Math.max(1, Math.min(99, q)) } : l,
      ),
    )
  }

  function removeLine(uidv: string) {
    setLines((prev) => prev.filter((l) => l.uid !== uidv))
  }

  function applyEdit(next: CartLine) {
    setLines((prev) => prev.map((l) => (l.uid === next.uid ? next : l)))
    setEditing(null)
  }

  function resetSale() {
    setLines([])
    setCustomerName('')
    setLinkedPhone(null)
    setCustMatches([])
    setCustOpen(false)
    setStage('cart')
    setError(null)
    setReceipt(null)
    setCategory('rapida')
  }

  function attachCustomer(c: { name: string; phone: string }) {
    setCustomerName(c.name || c.phone)
    setLinkedPhone(c.phone)
    setCustOpen(false)
    setCustMatches([])
  }

  function clearCustomer() {
    setCustomerName('')
    setLinkedPhone(null)
    setCustMatches([])
    setCustOpen(false)
  }

  // Payload de la venta (líneas + cliente) — compartido por el cobro
  // directo y por la preparación para SumUp. Descuento de línea → precio
  // efectivo (el endpoint factura por línea; el % se aplica aquí para que
  // total cobrado y factura coincidan con lo que ve el barbero).
  function buildSalePayload() {
    const serviceLines = lines
      .filter((l) => l.kind === 'service' || l.kind === 'custom')
      .map((l) => {
        const effective =
          l.unitPriceEuros * l.quantity * (1 - l.discountPct / 100)
        return {
          name: l.quantity > 1 ? `${l.name} x${l.quantity}` : l.name,
          priceEuros: Math.round(effective * 100) / 100,
          durationMin: l.durationMin,
        }
      })
    const productLines = lines
      .filter((l) => l.kind === 'product')
      .map((l) => ({ productId: l.productId!, quantity: l.quantity }))
    return {
      serviceLines,
      productLines,
      barberId: barberId || undefined,
      customerName: customerName.trim() || undefined,
      // Solo si se adjuntó un cliente conocido: enlaza a su ficha. Walk-in
      // anónimo → undefined → el endpoint genera un teléfono sintético.
      customerPhone: linkedPhone ?? undefined,
    }
  }

  function buildSnapshot(methodLabel: string): ReceiptSnapshot {
    return {
      lines: lines.map((l) => ({
        name: l.name,
        qty: l.quantity,
        totalCents: lineTotalCents(l),
      })),
      totalCents,
      methodLabel,
      customerName: customerName.trim() || null,
    }
  }

  async function confirmPayment(method: PaymentMethodDef) {
    if (lines.length === 0) return

    // SumUp Reader + "Tarjeta": no cobramos a mano. Preparamos la venta
    // (reserva sin cerrar) y abrimos SumupCheckoutPrompt — el datáfono
    // cobra de verdad y su callback cierra todo. Reutiliza el MISMO prompt
    // y el MISMO pipeline que la agenda.
    if (method.key === 'card' && sumupReaderConnected) {
      setSubmitting(true)
      setError(null)
      try {
        const res = await fetch('/api/pos/sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...buildSalePayload(), prepareForSumup: true }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          bookingId?: string
          amountCents?: number
          error?: string
        }
        if (!res.ok || !data.bookingId || !data.amountCents) {
          setError(data.error ?? 'No se pudo preparar el cobro con datáfono.')
          setStage('cart')
          return
        }
        setSumupCheckout({
          bookingId: data.bookingId,
          amountCents: data.amountCents,
          snapshot: buildSnapshot(method.label),
        })
      } catch {
        setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.')
        setStage('cart')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Cobro directo (efectivo / bizum / online / tarjeta manual sin Reader).
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildSalePayload(),
          paymentMethod: method.key,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        totalCents?: number
        error?: string
      }
      if (!res.ok) {
        setError(data.error ?? 'No se pudo completar el cobro.')
        setStage('cart')
        return
      }
      const snap = buildSnapshot(method.label)
      setReceipt({ ...snap, totalCents: data.totalCents ?? totalCents })
      setStage('done')
      // Refresca datos del dashboard (caja, transacciones) en segundo plano.
      router.refresh()
    } catch {
      setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.')
      setStage('cart')
    } finally {
      setSubmitting(false)
    }
  }

  // SumUp cobró con éxito (callback procesado) → mostramos el recibo con el
  // snapshot congelado al preparar la venta.
  function onSumupSettled() {
    if (sumupCheckout) {
      setReceipt(sumupCheckout.snapshot)
      setStage('done')
      router.refresh()
    }
    setSumupCheckout(null)
  }

  // SumUp falló/timeout y el barbero elige marcar a mano: la reserva ya
  // existe sin cerrar; la cerramos como tarjeta manual vía el PATCH de
  // siempre (mismo cierre que la agenda, sin duplicar lógica).
  async function onSumupFallback() {
    const ck = sumupCheckout
    setSumupCheckout(null)
    if (!ck) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/bookings/${ck.bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', paymentMethod: 'card' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'No se pudo cerrar la venta a mano.')
        setStage('cart')
        return
      }
      setReceipt(ck.snapshot)
      setStage('done')
      router.refresh()
    } catch {
      setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.')
      setStage('cart')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Recibo "Pago finalizado" (Booksy 10.01.18) ─────────────────────────
  // Ticket desglosado: líneas + base imponible + IVA + total + método.
  // El total cobrado lleva el IVA incluido (norma retail España); la base
  // y la cuota se derivan hacia atrás con el ivaRate del negocio — los
  // mismos números que la factura VeriFactu emitida en segundo plano.
  if (stage === 'done' && receipt) {
    const baseCents = Math.round(
      receipt.totalCents / (1 + ivaRate / 100),
    )
    const ivaCents = receipt.totalCents - baseCents
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-[var(--space-page)]">
        <div className="w-full max-w-md">
          <div className="mb-4 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Check className="h-6 w-6 text-success" aria-hidden="true" />
            </div>
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              Pago finalizado
            </h2>
          </div>

          {/* Tarjeta-ticket */}
          <div className="overflow-hidden rounded-control border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-widest text-success">
                <Check className="h-3 w-3" aria-hidden="true" />
                Pagado
              </span>
              {receipt.customerName && (
                <span className="truncate text-[0.8125rem] font-semibold text-ink">
                  {receipt.customerName}
                </span>
              )}
            </div>

            <ul className="divide-y divide-line px-5">
              {receipt.lines.map((l, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-ink">
                    {l.name}
                    {l.qty > 1 && (
                      <span className="text-ink-3"> x{l.qty}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {eur(l.totalCents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-1.5 border-t border-line px-5 py-3 text-[0.8125rem]">
              <div className="flex justify-between text-ink-2">
                <span>Base imponible</span>
                <span className="tabular-nums">{eur(baseCents)}</span>
              </div>
              <div className="flex justify-between text-ink-2">
                <span>IVA ({ivaRate}%)</span>
                <span className="tabular-nums">{eur(ivaCents)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
                  Total pagado
                </span>
                <span
                  className="font-bold tabular-nums text-ink"
                  style={{ fontSize: 'var(--text-figure)' }}
                >
                  {eur(receipt.totalCents)}
                </span>
              </div>
              <p className="pt-1 text-[0.75rem] text-ink-3">
                Cobrado en {receipt.methodLabel}
                {invoicingEnabled
                  ? ' · factura emitida automáticamente'
                  : ''}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={resetSale}
              className="btn-primary w-full justify-center"
            >
              Nueva venta
            </button>
            <a
              href={
                invoicingEnabled
                  ? '/dashboard/ventas/facturas'
                  : '/dashboard/ventas/transacciones'
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              {invoicingEnabled ? 'Ver factura' : 'Ver transacciones'}
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── 1. Rail de categorías ─────────────────────────────────────── */}
      <nav
        aria-label="Categorías de venta"
        className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-overlay/40 p-3"
      >
        {CATEGORIES.map((c) => {
          const active = category === c.key
          const Icon = c.icon
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              aria-current={active ? 'true' : undefined}
              className={`flex items-center gap-2 rounded-control px-3 py-2.5 text-left text-[0.8125rem] font-semibold transition-colors ${
                active
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-2 hover:bg-surface/60 hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 leading-tight">{c.label}</span>
            </button>
          )
        })}
      </nav>

      {/* ── 2. Rejilla de tiles / numpad ──────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto p-[var(--space-page)]">
        {category === 'personalizada' ? (
          <CustomAmountPad
            amount={customAmount}
            desc={customDesc}
            onAmount={setCustomAmount}
            onDesc={setCustomDesc}
            onAdd={addCustom}
          />
        ) : tiles.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[0.8125rem] text-ink-2">
              {category === 'productos'
                ? 'No tienes productos dados de alta. Añádelos en Ventas → Productos.'
                : 'No tienes servicios dados de alta. Añádelos en Ajustes → Negocio.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={t.onAdd}
                disabled={t.disabled}
                className="flex min-h-[88px] flex-col justify-between rounded-control border border-line bg-surface p-3 text-left transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[0.8125rem] font-semibold leading-tight text-ink">
                  {t.name}
                </span>
                <span className="mt-2 text-[0.8125rem] font-bold tabular-nums text-ink">
                  {t.priceLabel}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Carrito acoplado ───────────────────────────────────────── */}
      <aside
        aria-label="Carrito de venta"
        className="flex w-80 shrink-0 flex-col border-l border-line bg-surface"
      >
        {/* Cliente opcional (typeahead) + barbero */}
        <div className="space-y-2 border-b border-line p-4">
          <div ref={custBoxRef} className="relative">
            <label
              className={`flex items-center gap-2 rounded-control border bg-canvas px-3 py-2 ${
                linkedPhone ? 'border-brand' : 'border-line'
              }`}
            >
              <User
                className={`h-4 w-4 shrink-0 ${
                  linkedPhone ? 'text-brand' : 'text-ink-3'
                }`}
                aria-hidden="true"
              />
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value)
                  if (linkedPhone) setLinkedPhone(null)
                }}
                onFocus={() => {
                  if (custMatches.length > 0) setCustOpen(true)
                }}
                placeholder="Cliente (opcional)"
                aria-label="Buscar o escribir cliente"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              />
              {customerName && (
                <button
                  type="button"
                  onClick={clearCustomer}
                  aria-label="Quitar cliente"
                  className="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:text-ink-2"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            {custOpen && custMatches.length > 0 && !linkedPhone && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-control border border-line bg-surface shadow-xl">
                {custMatches.map((c) => (
                  <li key={c.phone}>
                    <button
                      type="button"
                      onClick={() => attachCustomer(c)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-overlay"
                    >
                      <span className="truncate text-sm font-semibold text-ink">
                        {c.name || 'Sin nombre'}
                      </span>
                      <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-3">
                        {c.phone}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {linkedPhone && (
              <p className="mt-1 text-[0.6875rem] text-ink-3">
                Cliente conocido · la venta entra en su historial
              </p>
            )}
          </div>
          {barbers.length > 0 && (
            <select
              value={barberId}
              onChange={(e) => setBarberId(e.target.value)}
              aria-label="Profesional"
              className="w-full rounded-control border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            >
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Líneas */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-center text-[0.8125rem] text-ink-3">
                Toca un servicio o producto para empezar la venta.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.uid} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {l.name}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-ink-2">
                        {eurFromEuros(l.unitPriceEuros)}
                        {l.discountPct > 0 ? ` · -${l.discountPct}%` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                      {eur(lineTotalCents(l))}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity(l.uid, l.quantity - 1)}
                      disabled={l.quantity <= 1}
                      aria-label="Restar unidad"
                      className="rounded-md border border-line p-1 text-ink-2 transition-colors hover:bg-overlay disabled:opacity-40"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums text-ink">
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(l.uid, l.quantity + 1)}
                      aria-label="Sumar unidad"
                      className="rounded-md border border-line p-1 text-ink-2 transition-colors hover:bg-overlay"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(l)}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-semibold text-ink-2 transition-colors hover:bg-overlay hover:text-ink"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(l.uid)}
                      aria-label="Quitar artículo"
                      className="rounded-md p-1 text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Total + acción */}
        <div className="border-t border-line p-4">
          {error && (
            <p className="mb-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[0.75rem] text-danger">
              {error}
            </p>
          )}
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
              Total
            </span>
            <span
              className="font-bold tabular-nums text-ink"
              style={{ fontSize: 'var(--text-figure)' }}
            >
              {eur(totalCents)}
            </span>
          </div>

          {stage === 'cart' && (
            <button
              type="button"
              onClick={() => setStage('payment')}
              disabled={lines.length === 0}
              className="btn-primary w-full justify-center"
            >
              Seleccionar método de pago
            </button>
          )}

          {stage === 'payment' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon
                  // "Tarjeta" con Reader pareado cobra de verdad en el
                  // datáfono — el hint lo dice para que el barbero sepa que
                  // no es marcar a mano.
                  const hint =
                    m.label === 'Tarjeta' && sumupReaderConnected
                      ? 'Cobro real en datáfono'
                      : m.hint
                  return (
                    <button
                      key={m.label}
                      type="button"
                      disabled={submitting}
                      onClick={() => void confirmPayment(m)}
                      className="flex flex-col items-start gap-1 rounded-control border border-line bg-surface p-3 text-left transition-colors hover:border-brand disabled:opacity-50"
                    >
                      <Icon
                        className="h-4 w-4 text-brand"
                        aria-hidden="true"
                      />
                      <span className="text-[0.8125rem] font-semibold text-ink">
                        {m.label}
                      </span>
                      <span className="text-[0.6875rem] text-ink-3">
                        {hint}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setStage('cart')}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cobrando…
                  </>
                ) : (
                  'Volver al carrito'
                )}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Modal "Editar artículo" (Booksy 10.01.36) ─────────────────── */}
      {editing && (
        <EditLineModal
          line={editing}
          onClose={() => setEditing(null)}
          onSave={applyEdit}
          onDelete={() => {
            removeLine(editing.uid)
            setEditing(null)
          }}
        />
      )}

      {/* ── Cobro instantáneo SumUp (Booksy "acerca la tarjeta") ──────────
          Reusa el MISMO prompt que la agenda: "Acerca la tarjeta…",
          polling a /api/bookings/[id]/status, éxito o fallback a mano.
          La reserva ya está creada (prepareForSumup); su callback la
          cierra y dispara factura/caja/followup. */}
      {sumupCheckout && (
        <SumupCheckoutPrompt
          open
          bookingId={sumupCheckout.bookingId}
          amountCents={sumupCheckout.amountCents}
          subtitle={
            sumupCheckout.snapshot.customerName ?? 'Venta de mostrador'
          }
          onClose={() => setSumupCheckout(null)}
          onSettled={onSumupSettled}
          onFallback={() => void onSumupFallback()}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// CustomAmountPad — numpad "Cantidad personalizada" (Booksy 10.00.25).
// -----------------------------------------------------------------------------
function CustomAmountPad({
  amount,
  desc,
  onAmount,
  onDesc,
  onAdd,
}: {
  amount: string
  desc: string
  onAmount: (v: string) => void
  onDesc: (v: string) => void
  onAdd: () => void
}) {
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '←']

  function press(k: string) {
    if (k === '←') {
      onAmount(amount.slice(0, -1))
      return
    }
    if (k === ',' && amount.includes(',')) return
    // Máx 2 decimales.
    if (amount.includes(',')) {
      const dec = amount.split(',')[1] ?? ''
      if (dec.length >= 2 && k !== ',') return
    }
    onAmount(amount + k)
  }

  return (
    <div className="mx-auto max-w-sm">
      <label className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
        Cantidad
      </label>
      <div className="mb-3 flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-3">
        <span className="text-ink-3">€</span>
        <span
          className="flex-1 font-bold tabular-nums text-ink"
          style={{ fontSize: 'var(--text-figure)' }}
        >
          {amount || '0,00'}
        </span>
      </div>
      <input
        type="text"
        value={desc}
        onChange={(e) => onDesc(e.target.value)}
        placeholder="Descripción (opcional)"
        className="mb-3 w-full rounded-control border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand placeholder:text-ink-3"
      />
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="rounded-control border border-line bg-surface py-4 text-base font-semibold text-ink transition-colors hover:border-brand"
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="btn-primary mt-3 w-full justify-center"
      >
        Añadir al recibo
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// EditLineModal — "Editar artículo" (Booksy 10.01.36): precio / descuento %
// / cantidad.
// -----------------------------------------------------------------------------
function EditLineModal({
  line,
  onClose,
  onSave,
  onDelete,
}: {
  line: CartLine
  onClose: () => void
  onSave: (next: CartLine) => void
  onDelete: () => void
}) {
  const [price, setPrice] = useState<number | null>(line.unitPriceEuros)
  const [discount, setDiscount] = useState<number | null>(line.discountPct)
  const [qty, setQty] = useState<number | null>(line.quantity)
  // Productos: el precio unitario es el de catálogo (no se reescribe aquí —
  // se cambia en Ventas → Productos). Servicio/custom sí editan precio.
  const priceEditable = line.kind !== 'product'

  function save() {
    onSave({
      ...line,
      unitPriceEuros: priceEditable
        ? Math.max(0, price ?? 0)
        : line.unitPriceEuros,
      discountPct: Math.max(0, Math.min(100, discount ?? 0)),
      quantity: Math.max(1, Math.min(99, qty ?? 1)),
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-scrim)] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-ink">
              Editar artículo
            </h3>
            <p className="mt-0.5 truncate text-xs text-ink-3">{line.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-ink-3 transition-colors hover:bg-overlay hover:text-ink-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
              Precio (€)
            </label>
            <NumberInput
              value={price}
              onValueChange={setPrice}
              min={0}
              decimals={2}
              step="0.01"
              disabled={!priceEditable}
              aria-label="Precio del artículo en euros"
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
            />
            {!priceEditable && (
              <p className="mt-1 text-[0.6875rem] text-ink-3">
                El precio de un producto se cambia en Ventas → Productos.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
                Descuento (%)
              </label>
              <NumberInput
                value={discount}
                onValueChange={setDiscount}
                min={0}
                max={100}
                decimals={0}
                aria-label="Descuento porcentual"
                className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-widest text-ink-2">
                Cantidad
              </label>
              <NumberInput
                value={qty}
                onValueChange={setQty}
                min={1}
                max={99}
                decimals={0}
                aria-label="Cantidad"
                className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-line p-4">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2.5 text-[0.8125rem] font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Eliminar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-control border border-line bg-surface px-3 py-2.5 text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-primary flex-1 justify-center"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
