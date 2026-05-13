'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { Loader2, AlertCircle, Info } from 'lucide-react'

// -----------------------------------------------------------------------------
// ManualInvoiceForm — client-side form for walk-in invoices.
//
// NIF detection: if the user types a value, the invoice becomes a "Factura"
// (B2B), otherwise a "Ticket simplificado" (B2C). We show that hint live so
// the barber understands what document is being emitted.
// -----------------------------------------------------------------------------

interface ServiceSuggestion {
  name: string
  duration?: number
  price?: number
}
interface BarberSuggestion {
  name: string
}

interface Props {
  suggestedServices: ServiceSuggestion[]
  suggestedBarbers: BarberSuggestion[]
  ivaRate: number
}

// Lenient NIF shape — 8 chars, starts with digit or letter, middle 7 digits,
// ends with digit or letter. Matches server-side `looksLikeValidNif`.
const NIF_SHAPE = /^[0-9A-Z][0-9]{7}[0-9A-Z]$/i

/**
 * Ticket simplificado price ceiling (euros). Real Decreto 1619/2012 art. 4:
 * ventas > 400€ must be emitted as a factura completa with the buyer's NIF.
 * Keep in sync with `TICKET_MAX_CENTS` in src/lib/invoicing.ts.
 */
const TICKET_MAX_EUROS = 400

const INPUT_CLASS =
  'w-full px-3 py-2.5 text-sm rounded-xl bg-surface border border-line text-ink placeholder-ink-3 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors'

const LABEL_CLASS =
  'block text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-1.5'

function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function ManualInvoiceForm({
  suggestedServices,
  suggestedBarbers,
  ivaRate,
}: Props) {
  const router = useRouter()
  const [issueDate, setIssueDate] = useState<string>(todayISO())
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNif, setCustomerNif] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [barberName, setBarberName] = useState('')
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isInvoice = customerNif.trim().length > 0
  const nifShapeOk = !customerNif.trim() || NIF_SHAPE.test(customerNif.trim())

  // Legal validation — mirrors `validateManualInvoiceInput` on the server so
  // the barber can't even submit an invalid combo.
  const priceNum = Number(price)
  const priceIsPositive = price !== '' && Number.isFinite(priceNum) && priceNum > 0
  const exceedsTicketMax = priceIsPositive && priceNum > TICKET_MAX_EUROS
  const nifRequired = exceedsTicketMax && !customerNif.trim()
  const addressRequiredForInvoice = isInvoice && !customerAddress.trim()
  const submitDisabled =
    loading ||
    !priceIsPositive ||
    nifRequired ||
    addressRequiredForInvoice ||
    !customerName.trim() ||
    !serviceName.trim()

  // Breakdown preview — mirrors server logic so the barber sees what they're emitting.
  const preview = useMemo(() => {
    const p = Number(price)
    if (!price || Number.isNaN(p) || p <= 0) return null
    const totalCents = Math.round(p * 100)
    const subtotalCents = Math.round(totalCents / (1 + ivaRate / 100))
    const ivaCents = totalCents - subtotalCents
    return {
      subtotal: (subtotalCents / 100).toFixed(2).replace('.', ','),
      iva: (ivaCents / 100).toFixed(2).replace('.', ','),
      total: (totalCents / 100).toFixed(2).replace('.', ','),
    }
  }, [price, ivaRate])

  const handleServiceSuggest = (name: string) => {
    setServiceName(name)
    const svc = suggestedServices.find((s) => s.name === name)
    if (svc?.price != null && !price) {
      setPrice(String(svc.price))
    }
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/invoices/create-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueDate,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          customerNif: customerNif.trim() || undefined,
          customerAddress: customerAddress.trim() || undefined,
          serviceName: serviceName.trim(),
          barberName: barberName.trim() || undefined,
          priceInEuros: Number(price),
          notes: notes.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'No se pudo emitir la factura.')
        setLoading(false)
        return
      }

      router.push(`/dashboard/facturas/${data.invoiceId}`)
      router.refresh()
    } catch {
      setError('Error de red. Inténtalo de nuevo.')
      setLoading(false)
    }
  }

  const servicesDatalistId = 'manual-invoice-services'

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-line rounded-2xl p-6 md:p-8 space-y-6"
    >
      {/* Type indicator */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-overlay border border-line">
        <Info className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" />
        <p className="text-xs text-ink-2 leading-relaxed">
          {isInvoice ? (
            <>
              Al introducir NIF/CIF se emitirá una <span className="font-semibold text-ink">Factura</span> completa
              (B2B).
            </>
          ) : (
            <>
              Sin NIF/CIF se emitirá un <span className="font-semibold text-ink">Ticket simplificado</span> (B2C).
              Añade el NIF solo si el cliente lo pide.
            </>
          )}
        </p>
      </div>

      {/* Date */}
      <div>
        <label className={LABEL_CLASS} htmlFor="issueDate">Fecha de emisión</label>
        <input
          id="issueDate"
          type="date"
          required
          value={issueDate}
          onChange={(e) => setIssueDate(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      {/* Customer fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="customerName">
            Nombre del cliente <span className="text-danger">*</span>
          </label>
          <input
            id="customerName"
            type="text"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Ana Pérez"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="customerPhone">Teléfono (opcional)</label>
          <input
            id="customerPhone"
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="+34 612 345 678"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="customerNif">
            NIF/CIF {exceedsTicketMax ? <span className="text-danger">*</span> : '(opcional)'}
          </label>
          <input
            id="customerNif"
            type="text"
            value={customerNif}
            onChange={(e) => setCustomerNif(e.target.value.toUpperCase())}
            placeholder="12345678A"
            autoComplete="off"
            required={exceedsTicketMax}
            className={INPUT_CLASS}
          />
          {nifRequired && (
            <p className="mt-1 text-xs text-danger font-medium">
              Las ventas &gt;400€ requieren NIF (factura completa, no ticket simplificado).
            </p>
          )}
          {customerNif && !nifShapeOk && (
            <p className="mt-1 text-xs text-warning">
              El formato del NIF/CIF no es habitual. Se emitirá igualmente.
            </p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="customerAddress">
            Dirección {isInvoice ? <span className="text-danger">*</span> : '(opcional)'}
          </label>
          <input
            id="customerAddress"
            type="text"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            placeholder="Calle Mayor 1, 08001 Barcelona"
            className={INPUT_CLASS}
            disabled={!isInvoice}
            required={isInvoice}
          />
          {addressRequiredForInvoice && (
            <p className="mt-1 text-xs text-danger font-medium">
              Dirección obligatoria en facturas con NIF.
            </p>
          )}
          {!isInvoice && (
            <p className="mt-1 text-xs text-ink-3">
              Solo relevante si emites factura con NIF.
            </p>
          )}
        </div>
      </div>

      {/* Service + professional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="serviceName">
            Servicio / concepto <span className="text-danger">*</span>
          </label>
          <input
            id="serviceName"
            type="text"
            required
            list={suggestedServices.length > 0 ? servicesDatalistId : undefined}
            value={serviceName}
            onChange={(e) => handleServiceSuggest(e.target.value)}
            placeholder="Corte + barba"
            className={INPUT_CLASS}
          />
          {suggestedServices.length > 0 && (
            <datalist id={servicesDatalistId}>
              {suggestedServices.map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="barberName">Profesional (opcional)</label>
          {suggestedBarbers.length > 0 ? (
            <select
              id="barberName"
              value={barberName}
              onChange={(e) => setBarberName(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Sin especificar</option>
              {suggestedBarbers.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="barberName"
              type="text"
              value={barberName}
              onChange={(e) => setBarberName(e.target.value)}
              placeholder="Nombre del profesional"
              className={INPUT_CLASS}
            />
          )}
        </div>
      </div>

      {/* Price */}
      <div>
        <label className={LABEL_CLASS} htmlFor="price">
          Precio total (€, IVA incluido) <span className="text-danger">*</span>
        </label>
        <input
          id="price"
          type="number"
          required
          step="0.01"
          min="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="25,00"
          className={INPUT_CLASS}
        />
        {preview && (
          <div className="mt-3 p-3 rounded-xl bg-brand-softer border border-brand/20 text-sm">
            <div className="flex justify-between text-ink-2">
              <span>Base imponible</span>
              <span className="font-mono">{preview.subtotal} €</span>
            </div>
            <div className="flex justify-between text-ink-2 mt-1">
              <span>IVA {ivaRate}%</span>
              <span className="font-mono">{preview.iva} €</span>
            </div>
            <div className="flex justify-between text-ink font-semibold mt-1 pt-2 border-t border-brand/20">
              <span>Total</span>
              <span className="font-mono">{preview.total} €</span>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className={LABEL_CLASS} htmlFor="notes">Notas internas (opcional)</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Información adicional, forma de pago, etc."
          className={INPUT_CLASS}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30">
          <AlertCircle className="h-4 w-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
        <button
          type="button"
          onClick={() => router.push('/dashboard/facturas')}
          className="px-4 py-2.5 text-sm text-ink-2 hover:text-ink transition-colors"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="btn-primary"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Emitiendo…' : isInvoice ? 'Emitir factura' : 'Emitir ticket'}
        </button>
      </div>
    </form>
  )
}
