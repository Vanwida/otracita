'use client'

import { useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

// -----------------------------------------------------------------------------
// Invoicing settings panel — controls inside the NegocioForm's "Facturación"
// tab. Kept as its own component because it carries local state (NIF validation
// hint, toggle, invoice-next lock), and the form keeps the save button.
//
// This component is uncontrolled for its text inputs (we read them via
// FormData at submit time, same as the rest of NegocioForm), but it does drive
// the enabled/disabled state of the toggle based on required fields and
// surfaces a soft NIF-format warning.
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

// Matches the helper in src/lib/invoicing.ts — single source of truth for the
// shape check (lenient, not a real checksum).
const NIF_SHAPE = /^[0-9A-Z][0-9]{7}[0-9A-Z]$/i

/** IVA rates offered in Spain for services. 21% is the default general rate. */
const IVA_OPTIONS = [
  { value: 21, label: '21% — general' },
  { value: 10, label: '10% — reducido' },
  { value: 4, label: '4% — superreducido' },
  { value: 0, label: '0% — exento' },
]

/** Zero-pad width used by the backend — keep in sync with lib/invoicing.ts. */
const PREVIEW_PAD = 4

export default function InvoicingSettings({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.invoicingEnabled)
  const [fiscalName, setFiscalName] = useState(initial.fiscalName)
  const [fiscalNif, setFiscalNif] = useState(initial.fiscalNif)
  const [fiscalAddress, setFiscalAddress] = useState(initial.fiscalAddress)
  const [fiscalCity, setFiscalCity] = useState(initial.fiscalCity)
  const [fiscalPostalCode, setFiscalPostalCode] = useState(initial.fiscalPostalCode)
  const [prefix, setPrefix] = useState(initial.invoiceNumberPrefix)

  // Real Decreto 1619/2012 art. 6 — a valid factura emisor block requires
  // fiscal name, NIF, and full postal address. All five fields are mandatory
  // before the barber can toggle invoicing on.
  const canEnable =
    fiscalName.trim().length > 0 &&
    fiscalNif.trim().length > 0 &&
    fiscalAddress.trim().length > 0 &&
    fiscalPostalCode.trim().length > 0 &&
    fiscalCity.trim().length > 0
  const nifLooksOff = fiscalNif.trim().length > 0 && !NIF_SHAPE.test(fiscalNif.trim())

  // Toggle guard: if user tries to enable while required fields empty, stop.
  const onToggle = () => {
    if (!enabled && !canEnable) return
    setEnabled(!enabled)
  }

  const paddedPreview = String(initial.invoiceNumberNext).padStart(PREVIEW_PAD, '0')
  const numberPreview = `${prefix}${paddedPreview}`

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
          name="invoicingEnabled"
          value="on"
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          name="fiscalName"
          label="Nombre fiscal"
          defaultValue={fiscalName}
          onChange={(v) => setFiscalName(v)}
          placeholder="Ej. Barbería Central SL"
          required
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="fiscalNif" className="text-sm font-medium text-ink-2">
            NIF / CIF <span className="text-danger">*</span>
          </label>
          <input
            id="fiscalNif"
            name="fiscalNif"
            type="text"
            defaultValue={fiscalNif}
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
      </div>

      <TextField
        name="fiscalAddress"
        label="Dirección fiscal"
        defaultValue={fiscalAddress}
        onChange={(v) => setFiscalAddress(v)}
        placeholder="Calle Gran Vía 123"
        required
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          name="fiscalCity"
          label="Ciudad"
          defaultValue={fiscalCity}
          onChange={(v) => setFiscalCity(v)}
          placeholder="Barcelona"
          required
        />
        <TextField
          name="fiscalPostalCode"
          label="Código postal"
          defaultValue={fiscalPostalCode}
          onChange={(v) => setFiscalPostalCode(v)}
          placeholder="08001"
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ivaRate" className="text-sm font-medium text-ink-2">
            IVA aplicado
          </label>
          <select
            id="ivaRate"
            name="ivaRate"
            defaultValue={String(initial.ivaRate)}
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
            name="invoiceNumberPrefix"
            type="text"
            defaultValue={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="FAC-2026-"
            className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
          />
          <p className="text-xs text-ink-3">
            Ejemplo: <code className="font-mono">FAC-2026-</code> + 4 dígitos ={' '}
            <code className="font-mono text-ink">{numberPreview || `0000`}</code>. Deja vacío para usar solo números.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 max-w-xs">
        <label htmlFor="invoiceNumberNext" className="text-sm font-medium text-ink-2">
          Próximo número
        </label>
        <input
          id="invoiceNumberNext"
          name="invoiceNumberNext"
          type="number"
          min={1}
          step={1}
          defaultValue={initial.invoiceNumberNext}
          disabled={initial.hasEmittedInvoices}
          className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {initial.hasEmittedInvoices ? (
          <p className="text-xs text-ink-3">
            Bloqueado porque ya se han emitido facturas — cambiarlo rompería la continuidad legal.
          </p>
        ) : (
          <p className="text-xs text-ink-3">
            Número con el que empezará la primera factura. Solo se puede cambiar mientras no hayas emitido ninguna.
          </p>
        )}
      </div>
    </div>
  )
}

function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  onChange,
}: {
  name: string
  label: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  onChange?: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-2">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        defaultValue={defaultValue || ''}
        placeholder={placeholder}
        required={required}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
      />
    </div>
  )
}
