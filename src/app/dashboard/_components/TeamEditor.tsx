'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface Props {
  initial: string[]
  /** Hidden input name so the value reaches the parent form on submit. */
  name?: string
}

/**
 * Simple list-of-names editor for the team (barbers / stylists).
 * Values ride the parent <form> as a JSON-encoded hidden input.
 */
export default function TeamEditor({ initial, name = 'barbers' }: Props) {
  const [members, setMembers] = useState<string[]>(initial)
  const [draft, setDraft] = useState('')

  const add = () => {
    const value = draft.trim()
    if (!value) return
    if (members.includes(value)) return
    setMembers((m) => [...m, value])
    setDraft('')
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(members)} readOnly />

      {members.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {members.map((m, i) => (
            <div key={`${m}-${i}`} className="flex items-center gap-2 rounded-full bg-overlay border border-line px-4 py-2">
              <span className="text-sm text-ink-2">{m}</span>
              <button
                type="button"
                onClick={() => setMembers((current) => current.filter((_, j) => j !== i))}
                className="text-ink-3 hover:text-danger transition-colors"
                aria-label={`Quitar ${m}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Nombre del barbero / profesional"
          className="flex-1 bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg bg-overlay border border-line px-4 py-3 text-sm text-ink-2 hover:bg-canvas hover:border-line-strong transition-colors"
          aria-label="Añadir profesional"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {members.length === 0 && (
        <p className="text-xs text-ink-3">
          Aún no has añadido a nadie. El bot preguntará al cliente con quién quiere reservar cuando haya más de un profesional.
        </p>
      )}
    </div>
  )
}
