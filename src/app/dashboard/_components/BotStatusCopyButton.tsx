'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'

interface Props {
  url: string
}

export default function BotStatusCopyButton({ url }: Props) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), FEEDBACK_MS.copied)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}
