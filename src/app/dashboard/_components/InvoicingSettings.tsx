'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Info, Check, Loader2 } from 'lucide-react'
import NumberInput from './NumberInput'
import FormGrid from './FormGrid'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// InvoicingSettings — panel de datos fiscales + numeración + toggle de
// emisión automática.
//
// Vive en /dashboard/caja desde commit 4 — antes vivía en NegocioForm tab
// "Facturación" como uncontrolled (recogía via FormData). Ahora es
// self-contained: state controlado + botón save propio + endpoint dedicado
// /api/invoicing/config. Misma validación legal que el saveBusiness viejo.
//
// Reglas legales (RD 1619/2012 art. 6):
//   · Activar el toggle requiere los 5 campos fiscales rellenos
//   · invoiceNumberNext es read-only si ya hay facturas emitidas (numeración
//     correlativa obligatoria)
// -----------------------------------------------------------------------------

export interface InvoicingInitial {
  invoicingEnabled: boolean
  fiscalName: string
  fiscalNif: string
  fiscalAddress: string
  fiscalCity: string
  fiscalPostalCode: string
  ivaRate: number
  invoiceNumberPrefix: string
  invoiceNumberNext: number
  /** When true, the "next number" field is read-only (invoices already emitted). */
  hasEmittedInvoices: boolean
}

interface Props {
  initial: InvoicingInitial
}

const NIF_SHAPE = /^[0-9A-Z][0-9]{7}[0-9A-Z]$/i

const IVA_OPTIONS = [
  { value: 21, label: '21% (general)' },
  { value: 10, label: '10% (reducido)' },
  { value: 4, label: '4% (superreducido)' },
  { value: 0, label: '0% (exento)' },
]

const PREVIEW_PAD = 4

export default function InvoicingSettings({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.invoicingEnabled)
  const [fiscalName, setFiscalName] = useState(initial.fiscalName)
  const [fiscalNif, setFiscalNif] = useState(initial.fiscalNif)
  const [fiscalAddress, setFiscalAddress] = useState(initial.fiscalAddress)
  const [fiscalCity, setFiscalCity] = useState(initial.fiscalCity)
  const [fiscalPostalCode, setFiscalPostalCode] = useState(initial.fiscalPostalCode)
  const [ivaRate, setIvaRate] = useState<number>(initial.ivaRate)
  const [prefix, setPrefix] = useState(initial.invoiceNumberPrefix)
  // Número entero de secuencia de factura (NO importe/IVA/tasa): NumberInput
  // con decimals=0 parsea idéntico a parseInt para todo entero válido; un
  // input malformado sigue sin poder guardarse (el guard ≥ 1 lo bloquea).
  const [nextNumber, setNextNumber] = useState<number | null>(
    initial.invoiceNumberNext,
  )

  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // RD 1619/2012 art. 6 — emisor block requires los 5 campos fiscales.
  const canEnable =
    fiscalName.trim().length > 0 &&
    fiscalNif.trim().length > 0 &&
    fiscalAddress.trim().length > 0 &&
    fiscalPostalCode.trim().length > 0 &&
    fiscalCity.trim().length > 0
  const nifLooksOff = fiscalNif.trim().length > 0 && !NIF_SHAPE.test(fiscalNif.trim())

  const onToggle = () => {
    if (!enabled && !canEnable) return
    setEnabled(!enabled)
  }

  const paddedPreview = String(initial.invoiceNumberNext).padStart(PREVIEW_PAD, '0')
  const numberPreview = `${prefix}${paddedPreview}`

  const onSave = () => {
    setError(null)
    setSaved(false)

    const parsedNext = nextNumber
    if (parsedNext === null || !Number.isFinite(parsedNext) || parsedNext < 1) {
      setError('El próximo número debe ser ≥ 1.')
      return
    }

    startTransition(async () => {
      try {
        const r = await fetch('/api/invoicing/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoicingEnabled: enabled,
            fiscalName,
            fiscalNif,
            fiscalAddress,
            fiscalCity,
            fiscalPostalCode,
            ivaRate,
            invoiceNumberPrefix: prefix,
            invoiceNumberNext: parsedNext,
          }),
        })
        const d = (await r.json().catch(() => ({}))) as { error?: string; invoicingEnabled?: boolean }
        if (!r.ok) {
          setError(d?.error ?? 'No se pudo guardar')
          return
        }
        // Sync local toggle con lo que el backend persistió (por si lo
        // bajó a false porque faltaban campos).
        if (typeof d.invoicingEnabled === 'boolean') setEnabled(d.invoicingEnabled)
        setSaved(true)
        setTimeout(() => setSaved(false), FEEDBACK_MS.saved)
      } catch {
        setError('Error de red')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Facturación</h2>
        <p className="text-sm text-ink-2 mt-1">
          Emite tickets y facturas automáticas a tus clientes cuando confirmes una reserva con precio. Ideal para pasar del papel al digital sin fricción.
        </p>
      </div>

      {/* Toggle card */}
      <label
        className={`flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
          enabled ? 'border-brand bg-brand-softer' : 'border-line bg-overlay hover:border-line-strong'
        } ${!canEnable && !enabled ? 'cursor-not-allowed opacity-80' : ''}`}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          disabled={!enabled && !canEnable}
          className="mt-1 h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">Activar facturación automática</p>
          <p className="text-xs text-ink-2 mt-1">
            Cuando una reserva se confirme con precio, el sistema generará un ticket (o factura si el cliente da NIF) automáticamente.
          </p>
          {!canEnable && !enabled && (
            <p className="text-xs text-warning mt-2 inline-flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Rellena nombre fiscal, NIF, dirección, código postal y ciudad antes de activar.
            </p>
          )}
        </div>
      </label>

      {/* Fiscal details */}
      <FormGrid cols={2}>
        <TextField
          label="Nombre fiscal"
          value={fiscalName}
          onChange={setFiscalName}
          placeholder="Ej. Barbería Central SL"
          required
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="fiscalNif" className="text-sm font-medium text-ink-2">
            NIF / CIF <span className="text-danger">*</span>
          </label>
          <input
            id="fiscalNif"
            type="text"
            value={fiscalNif}
            onChange={(e) => setFiscalNif(e.target.value.toUpperCase())}
            placeholder="B12345678"
            className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors uppercase"
          />
          {nifLooksOff && (
            <p className="text-xs text-warning inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              El formato no cuadra (esperamos 8 caracteres: letra/dígito + 7 dígitos + letra/dígito). Revisa antes de activar.
            </p>
          )}
        </div>
      </FormGrid>

      <TextField
        label="Dirección fiscal"
        value={fiscalAddress}
        onChange={setFiscalAddress}
        placeholder="Calle Gran Vía 123"
        required
      />

      <FormGrid cols={2}>
        <TextField
          label="Ciudad"
          value={fiscalCity}
          onChange={setFiscalCity}
          placeholder="Barcelona"
          required
        />
        <TextField
          label="Código postal"
          value={fiscalPostalCode}
          onChange={setFiscalPostalCode}
          placeholder="08001"
          required
        />
      </FormGrid>

      <FormGrid cols={2}>
        <div className="flex flex-col gap-2">
          <label htmlFor="ivaRate" className="text-sm font-medium text-ink-2">
            IVA aplicado
          </label>
          <select
            id="ivaRate"
            value={String(ivaRate)}
            onChange={(e) => setIvaRate(Number(e.target.value))}
            className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
          >
            {IVA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-3">
            El precio que guardas en cada servicio se entiende como <strong>IVA incluido</strong>. El sistema desglosa automáticamente la base imponible.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="invoiceNumberPrefix" className="text-sm font-medium text-ink-2">
            Formato de numeración
          </label>
          <input
            id="invoiceNumberPrefix"
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="FAC-2026-"
            className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
          />
          <p className="text-xs text-ink-3">
            Ejemplo: <code className="font-mono">FAC-2026-</code> + 4 dígitos ={' '}
            <code className="font-mono text-ink">{numberPreview || `0000`}</code>. Deja vacío para usar solo números.
          </p>
        </div>
      </FormGrid>

      <div className="flex flex-col gap-2 max-w-xs">
        <label htmlFor="invoiceNumberNext" className="text-sm font-medium text-ink-2">
          Próximo número
        </label>
        {/* min NO se pasa a propósito: la validación ≥ 1 vive en onSave
            con mensaje explícito. Clamp-en-blur lo ocultaría (cambio
            observable). decimals=0 → mismo entero que parseInt. */}
        <NumberInput
          id="invoiceNumberNext"
          decimals={0}
          step={1}
          value={nextNumber}
          onValueChange={setNextNumber}
          disabled={initial.hasEmittedInvoices}
          className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {initial.hasEmittedInvoices ? (
          <p className="text-xs text-ink-3">
            Bloqueado porque ya se han emitido facturas. Cambiarlo rompería la continuidad legal.
          </p>
        ) : (
          <p className="text-xs text-ink-3">
            Número con el que empezará la primera factura. Solo se puede cambiar mientras no hayas emitido ninguna.
          </p>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Guardado
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar facturación
        </button>
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  placeholder,
  required,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  required?: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink-2">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
      />
    </div>
  )
}
