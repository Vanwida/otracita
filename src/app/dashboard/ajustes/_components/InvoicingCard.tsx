'use client'

import React, { useState } from 'react'
import { FileText, Pencil, Check, AlertTriangle } from 'lucide-react'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import InvoicingSettings, {
  type InvoicingInitial,
} from '@/app/dashboard/_components/InvoicingSettings'

// -----------------------------------------------------------------------------
// InvoicingCard — wrapper de InvoicingSettings en SlideOver lateral.
//
// La card muestra un resumen compacto (estado + nombre fiscal + NIF + IVA +
// próximo número) y un botón Editar que abre el editor canónico en un
// SlideOver de ancho ampliado (más campos que el slide-over estándar).
//
// InvoicingSettings sigue siendo self-contained (auto-guarda contra
// /api/invoicing/config) — no se toca su lógica, solo cambia el chasis para
// cumplir la regla dura del proyecto: cero forms largos inline en Ajustes.
// -----------------------------------------------------------------------------

interface Props {
  initial: InvoicingInitial
}

export default function InvoicingCard({ initial }: Props) {
  const [open, setOpen] = useState(false)

  const fiscalName = initial.fiscalName.trim()
  const fiscalNif = initial.fiscalNif.trim()
  const ready = !!fiscalName && !!fiscalNif && !!initial.fiscalAddress

  return (
    <>
      <section className="rounded-2xl border border-line bg-surface p-4 md:p-5">
        <header className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-softer text-brand-strong"
            >
              <FileText className="h-4 w-4" />
            </span>
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              Datos fiscales y facturación
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Editar datos fiscales"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-overlay"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </button>
        </header>

        <div className="space-y-2 text-xs text-ink-2">
          <div className="inline-flex items-center gap-1.5">
            {initial.invoicingEnabled ? (
              <>
                <Check className="h-3.5 w-3.5 text-success" />
                <span className="text-success font-medium">
                  Emisión activa
                </span>
              </>
            ) : ready ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span className="text-warning font-medium">
                  Configurado pero desactivado
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-ink-3" />
                <span className="text-ink-3">Sin configurar</span>
              </>
            )}
          </div>

          {ready && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-2">
              <li>
                <span className="text-ink-3">Razón social:</span>{' '}
                <span className="text-ink truncate">{fiscalName}</span>
              </li>
              <li>
                <span className="text-ink-3">NIF:</span>{' '}
                <span className="text-ink font-mono">{fiscalNif}</span>
              </li>
              <li>
                <span className="text-ink-3">IVA:</span>{' '}
                <span className="text-ink">{initial.ivaRate}%</span>
              </li>
              <li>
                <span className="text-ink-3">Próximo nº:</span>{' '}
                <span className="text-ink font-mono">
                  {initial.invoiceNumberPrefix}
                  {String(initial.invoiceNumberNext).padStart(4, '0')}
                </span>
              </li>
            </ul>
          )}

          {!ready && (
            <p className="text-[12px] text-ink-3">
              Añade tu razón social, NIF y dirección para poder emitir
              facturas con IVA según RD 1619/2012.
            </p>
          )}
        </div>
      </section>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Datos fiscales y facturación"
        ariaLabel="Editar datos fiscales y facturación"
        width="w-[520px] max-w-[92vw]"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <InvoicingSettings initial={initial} />
          </div>
        </div>
      </SlideOver>
    </>
  )
}
