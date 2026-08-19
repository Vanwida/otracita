'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Store,
  Scissors,
  Clock,
  CalendarX,
  CalendarClock,
  ExternalLink,
  Phone,
  MapPin,
  Pencil,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import ServicesManager from '@/app/dashboard/_components/ServicesManager'
import type { HoursMap } from '@/app/dashboard/_components/HoursEditor'
import FormGrid from '@/app/dashboard/_components/FormGrid'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import { type ServiceColorToken } from '@/lib/service-colors'
import AjustesLayout from './AjustesLayout'
import AjustesSaveBar, { type SaveState } from './AjustesSaveBar'
import HoursSlideOver from './HoursSlideOver'
import BlockedDatesSlideOver from './BlockedDatesSlideOver'
import DayHourOverridesSlideOver from './DayHourOverridesSlideOver'
import type { DayOverride } from '@/app/dashboard/_components/DayHourOverridesManager'

// -----------------------------------------------------------------------------
// NegocioSettings — pestaña Negocio rediseñada (épica Reni #44).
//
// Reglas duras del proyecto aplicadas:
//   1. CERO scroll vertical innecesario en ajustes. Las 4 cards caben en
//      viewport en desktop (grid 2-col); en mobile el stack es compacto y
//      la edición se hace en SlideOver lateral (no inline).
//   2. Toda edición de item se hace en `SlideOver`. La card es preview/
//      resumen + botón "Editar" que abre el panel.
//   3. Reutiliza primitivos (SlideOver, FormGrid, AjustesSaveBar). Cero
//      reinvención de chrome.
//   4. Tokens semánticos del @theme (`bg-surface`, `text-ink`, etc.).
//   5. Imports explícitos de React.
//
// Layout grid:
//   ┌─────────────────────────┬─────────────────────────┐
//   │ Información del negocio │ Horario semanal         │
//   │ (form compacto inline)  │ (preview + Editar)      │
//   │                         ├─────────────────────────┤
//   │                         │ Días bloqueados         │
//   │                         │ (preview + Editar)      │
//   ├─────────────────────────┴─────────────────────────┤
//   │ Servicios — lista compacta full-width             │
//   │ (filas, click → SlideOver con form completo)      │
//   └───────────────────────────────────────────────────┘
//
// El form padre engloba businessName, whatsappNumber, address, services
// (input oculto JSON gestionado por ServicesManager), hours (input oculto
// JSON), slotStepMinutes. Igual que antes: un único submit dispara
// saveBusiness con todo el FormData — LÓGICA DE SERVIDOR INTACTA.
// -----------------------------------------------------------------------------

interface ServiceItem {
  name: string
  duration: number | string
  price: number | string
  description?: string
  featured?: boolean
  /** Precio 0 € intencional (U-12). Sin el flag, el precio es obligatorio. */
  courtesy?: boolean
  /** Token canónico de la paleta o hex `#RRGGBB` custom. */
  colorToken?: ServiceColorToken | string
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
    dayOverrides: DayOverride[]
  }
  /** Devuelve `{ error }` si el servidor rechaza el guardado (p.ej. un
   *  servicio a 0 € sin marcar cortesía). `void` = guardado OK. */
  save: (formData: FormData) => Promise<{ error?: string } | void>
}

const DAY_ORDER = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const
const DAY_SHORT: Record<(typeof DAY_ORDER)[number], string> = {
  lunes: 'L',
  martes: 'M',
  miercoles: 'X',
  jueves: 'J',
  viernes: 'V',
  sabado: 'S',
  domingo: 'D',
}

/** Cuenta días abiertos en el mapa de horas. */
function countOpenDays(hours: HoursMap | null): number {
  if (!hours) return 0
  return DAY_ORDER.filter((d) => (hours[d] ?? 'Cerrado') !== 'Cerrado').length
}

/** Devuelve el primer rango horario no vacío como string compacto. */
function previewHoursLabel(hours: HoursMap | null): string {
  if (!hours) return 'Sin configurar'
  for (const d of DAY_ORDER) {
    const v = hours[d]
    if (v && v !== 'Cerrado') return v
  }
  return 'Sin configurar'
}

/** Formatea una fecha YYYY-MM-DD a label corta. */
function formatDateShort(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`)
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
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

  // Estado local de los drafts editables vía SlideOver. Se serializan en
  // inputs ocultos para que el server action reciba el shape esperado.
  const [hoursOpen, setHoursOpen] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [hoursDraft, setHoursDraft] = useState<HoursMap | null>(initial.hours)
  const [slotStep, setSlotStep] = useState<number>(initial.slotStepMinutes ?? 15)

  // Reset "saved" badge tras el feedback estándar (FEEDBACK_MS.saved).
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
      try {
        const result = await save(formData)
        if (result?.error) {
          setSaveState('idle')
          toast.error(result.error)
          return
        }
        // Feedback "Guardado" lo aporta AjustesSaveBar (pill al lado del botón).
        // No emitimos toast.success — evita doble feedback visual con el chip.
        setSaveState('saved')
      } catch (err) {
        setSaveState('idle')
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      }
    })
  }

  const publicUrl =
    publicEnabled && publicSlug ? `/${publicSlug}` : null

  const openDays = countOpenDays(hoursDraft)
  const hoursPreview = previewHoursLabel(hoursDraft)
  const blockedCount = initial.blockedDates.length
  const blockedPreview = initial.blockedDates
    .slice()
    .sort()
    .slice(0, 3)
    .map(formatDateShort)
    .join(', ')

  // Resumen de excepciones por fecha — las que aún no han pasado.
  const todayIso = new Date().toISOString().split('T')[0]
  const upcomingOverrides = initial.dayOverrides
    .filter((o) => o.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
  const overridesCount = upcomingOverrides.length
  const overridesPreview = upcomingOverrides
    .slice(0, 2)
    .map((o) => {
      const label = formatDateShort(o.date)
      return o.hours === 'Cerrado' ? `${label} cerrado` : `${label} ${o.hours}`
    })
    .join(' · ')

  return (
    <AjustesLayout
      intro="Datos, servicios y horario con los que opera tu asistente. Lo que pongas aquí es lo que ve el cliente al reservar y lo que usa el bot para responder."
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
      <form ref={formRef} action={onSubmit} className="space-y-4">
        {/* Inputs ocultos serializados desde los drafts (horario, slotStep) */}
        <input
          type="hidden"
          name="hours"
          value={hoursDraft ? JSON.stringify(hoursDraft) : ''}
          readOnly
        />
        <input
          type="hidden"
          name="slotStepMinutes"
          value={String(slotStep)}
          readOnly
        />

        {/* Grid 2-col en desktop, stack en mobile */}
        <FormGrid cols={2} gap="card">
          {/* ── Card 1: Información del negocio (form inline compacto) ───── */}
          <Card icon={Store} title="Información del negocio">
            <div className="space-y-3">
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
                label="WhatsApp"
                defaultValue={initial.whatsappNumber || initial.phone}
                placeholder="+34 600 123 456"
                type="tel"
                required
                inputMode="tel"
                pattern="^\+?[0-9 .()-]{7,}$"
                icon={Phone}
                autoComplete="tel"
              />
              <TextField
                name="address"
                label="Dirección"
                defaultValue={initial.address}
                placeholder="Calle Gran Vía 123, Barcelona"
                icon={MapPin}
                autoComplete="street-address"
              />
            </div>
          </Card>

          {/* ── Columna derecha: stack de 2 cards compactas ─────────── */}
          <div className="space-y-4">
            {/* Card 2: Horario semanal — preview + Editar */}
            <Card
              icon={Clock}
              title="Horario"
              action={
                <EditButton
                  onClick={() => setHoursOpen(true)}
                  label="Editar horario"
                />
              }
            >
              <div className="space-y-3">
                {/* Strip L M X J V S D con activos en brand */}
                <div className="flex items-center gap-1.5">
                  {DAY_ORDER.map((d) => {
                    const v = hoursDraft?.[d] ?? 'Cerrado'
                    const open = v !== 'Cerrado'
                    return (
                      <span
                        key={d}
                        title={
                          open
                            ? `${d.charAt(0).toUpperCase() + d.slice(1)}: ${v}`
                            : `${d.charAt(0).toUpperCase() + d.slice(1)}: Cerrado`
                        }
                        className={`h-7 w-7 inline-flex items-center justify-center rounded-md text-[11px] font-semibold ${
                          open
                            ? 'bg-brand-softer text-brand-strong ring-1 ring-brand/30'
                            : 'bg-canvas text-ink-3 ring-1 ring-line'
                        }`}
                      >
                        {DAY_SHORT[d]}
                      </span>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
                  <span>
                    {openDays}{' '}
                    {openDays === 1 ? 'día abierto' : 'días abiertos'}
                    {hoursPreview !== 'Sin configurar' && ` · ${hoursPreview}`}
                  </span>
                  <span className="inline-flex items-center gap-1 text-ink-2">
                    <Timer className="h-3 w-3" />
                    {slotStep} min
                  </span>
                </div>
              </div>
            </Card>

            {/* Card 3: Días bloqueados — preview + Editar */}
            <Card
              icon={CalendarX}
              title="Días bloqueados"
              action={
                <EditButton
                  onClick={() => setBlockedOpen(true)}
                  label="Editar días bloqueados"
                />
              }
            >
              {blockedCount === 0 ? (
                <p className="text-xs text-ink-3">
                  Sin fechas bloqueadas. Añade vacaciones o festivos.
                </p>
              ) : (
                <p className="text-xs text-ink-2">
                  <span className="font-semibold text-ink">
                    {blockedCount}
                  </span>{' '}
                  {blockedCount === 1
                    ? 'día bloqueado'
                    : 'días bloqueados'}
                  {blockedPreview && (
                    <>
                      {' · '}
                      <span className="text-ink-3">{blockedPreview}</span>
                      {blockedCount > 3 && (
                        <span className="text-ink-3">…</span>
                      )}
                    </>
                  )}
                </p>
              )}
            </Card>

            {/* Card 4: Excepciones por fecha — extender/recortar/cerrar un día
                 concreto sin tocar el semanal recurrente. */}
            <Card
              icon={CalendarClock}
              title="Excepciones por fecha"
              action={
                <EditButton
                  onClick={() => setOverridesOpen(true)}
                  label="Editar excepciones por fecha"
                />
              }
            >
              {overridesCount === 0 ? (
                <p className="text-xs text-ink-3">
                  Horario distinto al recurrente solo un día concreto, o
                  cerrar un día puntual.
                </p>
              ) : (
                <p className="text-xs text-ink-2">
                  <span className="font-semibold text-ink">
                    {overridesCount}
                  </span>{' '}
                  {overridesCount === 1
                    ? 'excepción próxima'
                    : 'excepciones próximas'}
                  {overridesPreview && (
                    <>
                      {' · '}
                      <span className="text-ink-3">{overridesPreview}</span>
                      {overridesCount > 2 && (
                        <span className="text-ink-3">…</span>
                      )}
                    </>
                  )}
                </p>
              )}
            </Card>
          </div>
        </FormGrid>

        {/* ── Card 4: Servicios — full-width abajo ────────────────── */}
        <Card icon={Scissors} title="Servicios">
          <ServicesManager
            initial={initial.services.map((s) => ({
              name: String(s.name),
              duration: s.duration,
              price: s.price,
              description: s.description,
              featured: s.featured,
              colorToken: s.colorToken,
            }))}
          />
        </Card>

        <AjustesSaveBar state={saveState} />
      </form>

      {/* ── SlideOvers ─────────────────────────────────────────────── */}
      <HoursSlideOver
        open={hoursOpen}
        onClose={() => setHoursOpen(false)}
        initial={hoursDraft}
        initialSlotStep={slotStep}
        onSave={(nextHours, nextStep) => {
          setHoursDraft(nextHours)
          setSlotStep(nextStep)
          setHoursOpen(false)
        }}
      />
      <BlockedDatesSlideOver
        open={blockedOpen}
        onClose={() => setBlockedOpen(false)}
        initialDates={initial.blockedDates}
        clientId={clientId}
      />
      <DayHourOverridesSlideOver
        open={overridesOpen}
        onClose={() => setOverridesOpen(false)}
        initial={initial.dayOverrides}
      />
    </AjustesLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card — wrapper compacto reutilizado por las 4 cards de la pestaña Negocio.
// No usa AjustesSection (más pesado, pensado para secciones full-width). Aquí
// queremos cards tipo dashboard: header pequeño con icono, content denso.
// ─────────────────────────────────────────────────────────────────────────────

function Card({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 md:p-5 shadow-[0_1px_0_0_var(--color-line)]">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-softer text-brand-strong"
          >
            <Icon className="h-4 w-4" />
          </span>
          <h2
            className="font-semibold text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            {title}
          </h2>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  )
}

// ─── EditButton ──────────────────────────────────────────────────────────────

function EditButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-overlay"
    >
      <Pencil className="h-3 w-3" />
      Editar
    </button>
  )
}

// ─── TextField ───────────────────────────────────────────────────────────────

interface TextFieldProps {
  name: string
  label: string
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
    <div className="flex flex-col gap-1">
      <label
        htmlFor={name}
        className="font-medium text-ink"
        style={{ fontSize: '0.75rem' }}
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
          <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
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
    </div>
  )
}
