'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'

export default function AppPageCopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
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
      onClick={copy}
      className="btn-primary btn-sm"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copiado' : 'Copiar enlace'}
    </button>
  )
}
