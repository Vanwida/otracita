'use client'

import { useState } from 'react'

export interface HoursMap {
  [day: string]: string // "10:00-20:00" or "Cerrado"
}

interface Props {
  initial: HoursMap | null
  /** Hidden input name so the value reaches the parent form on submit. */
  name?: string
  /** Optional controlled-mode callback: fires on every change with the full
   *  map so callers that save per-field (not per-form) can PATCH directly. */
  onChange?: (next: HoursMap) => void
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
export default function HoursEditor({ initial, name = 'hours', onChange }: Props) {
  // Si `initial` ya trae datos, los usamos TAL CUAL — sin mergear con
  // DEFAULT_HOURS. El merge anterior `{ ...DEFAULT_HOURS, ...initial }`
  // sobreescribía días faltantes con valores hardcoded (ej. domingo →
  // "Cerrado") aunque la BD del local tuviese ese día abierto vía otra
  // ruta, y al primer onChange persistía esa basura. DEFAULT_HOURS solo
  // aplica cuando NO hay configuración previa (initial null / vacío:
  // setup inicial). Toda fila se renderiza siempre porque el map de
  // `DAYS` itera 7 días y cae a 'Cerrado' si la clave no existe.
  const [hours, setHours] = useState<HoursMap>(() =>
    initial && Object.keys(initial).length > 0
      ? { ...initial }
      : { ...DEFAULT_HOURS },
  )

  const json = JSON.stringify(hours)

  const update = (next: HoursMap) => {
    setHours(next)
    onChange?.(next)
  }

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
                update({
                  ...hours,
                  [day]: e.target.value === 'closed' ? 'Cerrado' : '10:00-20:00',
                })
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
                onChange={(e) => update({ ...hours, [day]: e.target.value })}
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
