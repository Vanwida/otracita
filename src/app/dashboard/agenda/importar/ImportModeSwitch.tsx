'use client'

import { useState } from 'react'
import { Image as ImageIcon, Calendar as CalendarIcon } from 'lucide-react'
import ImportFlow from './ImportFlow'
import IcalImportFlow from './IcalImportFlow'

// -----------------------------------------------------------------------------
// ImportModeSwitch — segmented control entre los dos flujos de importación.
// Estado en URL via shallow router para que recargar/compartir mantenga el
// modo. Sin context provider — solo dos componentes hermanos.
// -----------------------------------------------------------------------------

type Mode = 'vision' | 'ical'

export default function ImportModeSwitch({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)

  const change = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    // Actualiza la URL sin recargar — útil si el usuario refresca.
    const url = new URL(window.location.href)
    url.searchParams.set('mode', next)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <div className="space-y-4">
      <div
        className="inline-flex rounded-lg border border-line bg-surface p-1 gap-1"
        role="tablist"
        aria-label="Modo de importación"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'ical'}
          onClick={() => change('ical')}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'ical'
              ? 'bg-brand text-brand-ink'
              : 'text-ink-2 hover:text-ink'
          }`}
        >
          <CalendarIcon className="h-4 w-4" />
          Archivo .ics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'vision'}
          onClick={() => change('vision')}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'vision'
              ? 'bg-brand text-brand-ink'
              : 'text-ink-2 hover:text-ink'
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Capturas (IA)
        </button>
      </div>

      {mode === 'ical' ? <IcalImportFlow /> : <ImportFlow />}
    </div>
  )
}
