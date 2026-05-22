'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Store,
  Scissors,
  Clock,
  CalendarX,
  ExternalLink,
  Phone,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import ServicesManager from '@/app/dashboard/_components/ServicesManager'
import HoursEditor, {
  type HoursMap,
} from '@/app/dashboard/_components/HoursEditor'
import BlockedDatesManager from '@/app/dashboard/_components/BlockedDatesManager'
import FormGrid from '@/app/dashboard/_components/FormGrid'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import AjustesLayout from './AjustesLayout'
import AjustesSection from './AjustesSection'
import AjustesSaveBar, { type SaveState } from './AjustesSaveBar'

// -----------------------------------------------------------------------------
// NegocioSettings — pestaña Negocio rediseñada (#35).
//
// Reemplaza al antiguo NegocioForm (tabs internas Info / Servicios / Horario
// / Días bloqueados). El nuevo patrón es Booksy/Stripe-coded: una sola pestaña
// scrolleable con cards agrupadas, save bar única (sticky en mobile, inline
// en desktop). Días bloqueados sigue siendo API-driven independiente, así que
// va en su propia card sin save bar.
//
// La server action `save` recibe TODO (info, servicios, horario, slotStep)
// como un FormData único — comportamiento idéntico al anterior, sólo cambia
// el chrome. Los inputs ocultos llevan el JSON serializado de servicios y
// horario, igual que antes.
//
// Mobile-first: cards full-bleed con padding clamp, FormGrid stack 1-col en
// mobile y 2-col en md+. Inputs h-11+ (target ≥44). Save bar sticky con
// safe-area awareness.
//
// Imports explícitos de React (regla del proyecto).
// -----------------------------------------------------------------------------

interface ServiceItem {
  name: string
  duration: number | string
  price: number | string
}

interface Props {
  clientId: string
  publicSlug: string | null
  publicEnabled: boolean
  initial: {
    businessName: string
    whatsappNumber: string
    phone: string
    address: string
    services: ServiceItem[]
    hours: HoursMap | null
    slotStepMinutes: number
    blockedDates: string[]
  }
  save: (formData: FormData) => Promise<void>
}

export default function NegocioSettings({
  clientId,
  publicSlug,
  publicEnabled,
  initial,
  save,
}: Props) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Reset "saved" badge tras el feedback estándar de la UI (FEEDBACK_MS.saved).
  useEffect(() => {
    if (saveState !== 'saved') return
    const t = window.setTimeout(
      () => setSaveState('idle'),
      FEEDBACK_MS.saved,
    )
    return () => window.clearTimeout(t)
  }, [saveState])

  const onSubmit = (formData: FormData) => {
    setSaveState('saving')
    startTransition(async () => {
      await save(formData)
      setSaveState('saved')
    })
  }

  const publicUrl =
    publicEnabled && publicSlug ? `/b/${publicSlug}` : null

  return (
    <AjustesLayout
      intro="Datos, servicios, equipo y horario con los que opera tu asistente. Lo que pongas aquí es lo que ve el cliente al reservar y lo que usa el bot para responder."
      action={
        publicUrl ? (
          <Link
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 font-medium text-ink transition-colors hover:border-line-strong hover:bg-overlay"
            style={{ fontSize: 'var(--text-meta)' }}
          >
            Ver en PWA pública
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      <form ref={formRef} action={onSubmit} className="space-y-5 md:space-y-6">
        <AjustesSection
          icon={Store}
          title="Información del negocio"
          description="Lo que el bot usa para presentarse y lo que aparece en tu página pública."
        >
          <div className="space-y-4">
            <FormGrid cols={2}>
              <TextField
                name="businessName"
                label="Nombre del negocio"
                defaultValue={initial.businessName}
                placeholder="Barbería Central"
                required
                autoComplete="organization"
              />
              <TextField
                name="whatsappNumber"
                label="WhatsApp del negocio"
                hint="Con prefijo internacional. Es el número que llama el bot."
                defaultValue={initial.whatsappNumber || initial.phone}
                placeholder="+34 600 123 456"
                type="tel"
                required
                inputMode="tel"
                pattern="^\+?[0-9 .()-]{7,}$"
                icon={Phone}
                autoComplete="tel"
              />
            </FormGrid>

            <TextField
              name="address"
              label="Dirección"
              hint="Calle, número y ciudad. El bot la comparte cuando preguntan dónde estáis."
              defaultValue={initial.address}
              placeholder="Calle Gran Vía 123, Barcelona"
              icon={MapPin}
              autoComplete="street-address"
            />
          </div>
        </AjustesSection>

        <AjustesSection
          icon={Scissors}
          title="Servicios"
          description="Lo que ofreces, en qué orden, a qué precio y de qué color en la agenda."
          bleed
        >
          <div className="px-[var(--space-card)] md:px-6">
            <ServicesManager
              initial={initial.services.map((s) => ({
                name: String(s.name),
                duration: s.duration,
                price: s.price,
              }))}
            />
          </div>
        </AjustesSection>

        <AjustesSection
          icon={Clock}
          title="Horario"
          description="Las horas en las que aceptas reservas. El bot solo ofrece huecos dentro de este rango."
        >
          <div className="space-y-6">
            <HoursEditor initial={initial.hours} />

            <div className="border-t border-line pt-5">
              <h3
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                Granularidad de los huecos
              </h3>
              <p
                className="mt-1 mb-3 text-ink-2"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                Cada cuántos minutos se ofrece un posible inicio de cita.
                15 min (recomendado) rellena micro-huecos y maximiza la
                conversión. Nunca se ofrece un slot que no quepa entero.
              </p>
              <div className="grid max-w-md grid-cols-3 gap-2">
                {([15, 30, 45] as const).map((m) => (
                  <label
                    key={m}
                    className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-ink transition-colors hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-softer"
                    style={{ fontSize: 'var(--text-meta)' }}
                  >
                    <input
                      type="radio"
                      name="slotStepMinutes"
                      value={m}
                      defaultChecked={
                        (initial.slotStepMinutes ?? 15) === m
                      }
                      className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                    />
                    <span className="font-semibold">{m} min</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </AjustesSection>

        <AjustesSaveBar state={saveState} />
      </form>

      <AjustesSection
        icon={CalendarX}
        title="Días bloqueados"
        description="Vacaciones, festivos, días puntuales cerrados. El bot no ofrecerá citas en estas fechas."
      >
        <BlockedDatesManager
          initialDates={initial.blockedDates}
          clientId={clientId}
        />
      </AjustesSection>
    </AjustesLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TextField — input con label/hint/error en el estilo Patagonia warm light.
// No es un primitivo global todavía (lo será cuando se repita >2 veces fuera
// de Ajustes). De momento vive aquí.
// ─────────────────────────────────────────────────────────────────────────────

interface TextFieldProps {
  name: string
  label: string
  hint?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  type?: string
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'url'
  pattern?: string
  icon?: LucideIcon
}

function TextField({
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  required,
  type = 'text',
  autoComplete,
  inputMode,
  pattern,
  icon: Icon,
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="font-medium text-ink"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3"
          />
        )}
        <input
          id={name}
          name={name}
          type={type}
          defaultValue={defaultValue || ''}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          pattern={pattern}
          className={[
            'min-h-11 w-full rounded-lg border border-line bg-canvas text-ink outline-none transition-colors',
            'focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_var(--color-brand-softer)]',
            'placeholder:text-ink-3',
            Icon ? 'pl-9 pr-3' : 'px-3',
            'py-2.5',
          ].join(' ')}
          style={{ fontSize: 'var(--text-meta)' }}
        />
      </div>
      {hint && (
        <p className="text-ink-3" style={{ fontSize: '0.75rem' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
