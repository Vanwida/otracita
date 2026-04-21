'use client'

import { useState, useTransition } from 'react'
import { Store, Scissors, Users, Clock, CalendarX, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import ServicesManager from './ServicesManager'
import TeamEditor from './TeamEditor'
import HoursEditor, { type HoursMap } from './HoursEditor'
import BlockedDatesManager from './BlockedDatesManager'

interface ServiceItem {
  name: string
  duration: number | string
  price: number | string
}

interface Props {
  clientId: string
  initial: {
    businessName: string
    whatsappNumber: string
    phone: string
    address: string
    services: ServiceItem[]
    barbers: string[]
    hours: HoursMap | null
    blockedDates: string[]
  }
  /** Server action that saves the core business fields (everything except blocked dates). */
  save: (formData: FormData) => Promise<void>
}

type TabKey = 'info' | 'services' | 'team' | 'hours' | 'blocked'

interface Tab {
  key: TabKey
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { key: 'info', label: 'Información', icon: Store },
  { key: 'services', label: 'Servicios', icon: Scissors },
  { key: 'team', label: 'Equipo', icon: Users },
  { key: 'hours', label: 'Horario', icon: Clock },
  { key: 'blocked', label: 'Días bloqueados', icon: CalendarX },
]

/**
 * Unified business settings form with horizontal tabs.
 *
 * Tabs 1-4 (info / services / team / hours) live inside a single <form>
 * so the user can edit one, jump to another, and save once. Tab 5 (blocked
 * dates) uses the existing API-driven component and saves independently.
 */
export default function NegocioForm({ clientId, initial, save }: Props) {
  const [tab, setTab] = useState<TabKey>('info')
  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      await save(formData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-6">
      {/* Tabs — scroll horizontally on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-line -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-brand text-ink'
                  : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'blocked' ? (
        <div className="bg-surface border border-line rounded-xl p-4 md:p-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Días bloqueados</h2>
            <p className="text-sm text-ink-2 mt-1">Bloquea fechas específicas (vacaciones, festivos) para que el bot no ofrezca esos días.</p>
          </div>
          <BlockedDatesManager initialDates={initial.blockedDates} clientId={clientId} />
        </div>
      ) : (
        <form action={onSubmit} className="bg-surface border border-line rounded-xl p-4 md:p-8 space-y-6">
          {/* ─── Información ─── */}
          <div className={tab === 'info' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Información del negocio</h2>
              <p className="text-sm text-ink-2 mt-1">Los datos que el bot usa para presentarse a tus clientes.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                name="businessName"
                label="Nombre del negocio"
                defaultValue={initial.businessName}
                placeholder="Ej. Barbería Central"
                required
              />
              <Field
                name="whatsappNumber"
                label="WhatsApp (con código de país)"
                defaultValue={initial.whatsappNumber || initial.phone}
                placeholder="+34 600 123 456"
                required
              />
            </div>

            <Field
              name="address"
              label="Dirección"
              defaultValue={initial.address}
              placeholder="Calle Gran Vía 123, Barcelona"
            />
          </div>

          {/* ─── Servicios ─── */}
          <div className={tab === 'services' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Servicios</h2>
              <p className="text-sm text-ink-2 mt-1">Los servicios que ofrece tu negocio. El bot los usará para las reservas.</p>
            </div>
            <ServicesManager initial={initial.services.map((s) => ({ name: String(s.name), duration: s.duration, price: s.price }))} />
          </div>

          {/* ─── Equipo ─── */}
          <div className={tab === 'team' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Equipo</h2>
              <p className="text-sm text-ink-2 mt-1">Profesionales del negocio. El bot preguntará con quién quiere reservar el cliente.</p>
            </div>
            <TeamEditor initial={initial.barbers} />
          </div>

          {/* ─── Horario ─── */}
          <div className={tab === 'hours' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Horario</h2>
              <p className="text-sm text-ink-2 mt-1">Horas de apertura por día. El bot solo ofrecerá huecos dentro de este rango.</p>
            </div>
            <HoursEditor initial={initial.hours} />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-line">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Check className="h-4 w-4" />
                Guardado
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand hover:bg-brand-strong px-6 py-3 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  type = 'text',
}: {
  name: string
  label: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  type?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-2">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue || ''}
        placeholder={placeholder}
        required={required}
        className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
      />
    </div>
  )
}
