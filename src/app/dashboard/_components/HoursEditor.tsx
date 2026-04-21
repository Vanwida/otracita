'use client'

import { useState } from 'react'

export interface HoursMap {
  [day: string]: string // "10:00-20:00" or "Cerrado"
}

interface Props {
  initial: HoursMap | null
  /** Hidden input name so the value reaches the parent form on submit. */
  name?: string
}

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const
const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
}

const DEFAULT_HOURS: HoursMap = {
  lunes: '10:00-20:00',
  martes: '10:00-20:00',
  miercoles: '10:00-20:00',
  jueves: '10:00-20:00',
  viernes: '10:00-20:00',
  sabado: '10:00-14:00',
  domingo: 'Cerrado',
}

/**
 * Weekly business-hours editor. Each row has open/closed toggle plus a
 * `HH:MM-HH:MM` range. Serialised as JSON into a hidden input so it rides
 * along the surrounding <form>.
 */
export default function HoursEditor({ initial, name = 'hours' }: Props) {
  const [hours, setHours] = useState<HoursMap>({ ...DEFAULT_HOURS, ...(initial || {}) })

  const json = JSON.stringify(hours)

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={json} readOnly />
      {DAYS.map((day) => {
        const value = hours[day] ?? 'Cerrado'
        const closed = value === 'Cerrado'
        return (
          <div key={day} className="flex items-center gap-3">
            <span className="text-sm text-ink-2 w-24 shrink-0">{DAY_LABELS[day]}</span>
            <select
              value={closed ? 'closed' : 'open'}
              onChange={(e) => {
                setHours((h) => ({
                  ...h,
                  [day]: e.target.value === 'closed' ? 'Cerrado' : '10:00-20:00',
                }))
              }}
              className="bg-surface border border-line rounded-lg p-2 text-sm text-ink outline-none w-28 focus:border-brand transition-colors"
            >
              <option value="open">Abierto</option>
              <option value="closed">Cerrado</option>
            </select>
            {!closed && (
              <input
                type="text"
                value={value}
                onChange={(e) => setHours((h) => ({ ...h, [day]: e.target.value }))}
                placeholder="10:00-20:00"
                className="flex-1 bg-surface border border-line rounded-lg p-2 text-sm text-ink focus:border-brand outline-none transition-colors text-center"
              />
            )}
          </div>
        )
      })}
      <p className="text-xs text-ink-3 mt-2">Formato: <code className="font-mono">HH:MM-HH:MM</code>. Ej: <code className="font-mono">10:00-20:00</code>.</p>
    </div>
  )
}
