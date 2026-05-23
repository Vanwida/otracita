// Helpers de formato locales a la app del barbero. Todo en € y minutos.

export function formatEuros(cents: number): string {
  const euros = cents / 100
  if (Number.isInteger(euros)) return `${euros} €`
  return `${euros.toFixed(2).replace('.', ',')} €`
}

export function formatEurosFromEuros(euros: number | null): string {
  if (euros == null) return '—'
  return formatEuros(euros * 100)
}

// "en 23 min", "en 1 h 12 min", "Atendiendo ahora", "Ya pasó"
export function relativeCountdown(targetHHMM: string, dateYYYYMMDD: string): {
  text: string
  isNow: boolean
  isPast: boolean
} {
  const [h, m] = targetHHMM.split(':').map(Number)
  const [y, mo, d] = dateYYYYMMDD.split('-').map(Number)
  const target = new Date(y, mo - 1, d, h, m, 0, 0)
  const now = new Date()
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60000)

  if (diffMin <= -120) {
    return { text: 'Ya pasó', isNow: false, isPast: true }
  }
  if (diffMin <= 0 && diffMin > -120) {
    return { text: 'Atendiendo ahora', isNow: true, isPast: false }
  }
  if (diffMin < 60) {
    return { text: `en ${diffMin} min`, isNow: false, isPast: false }
  }
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  return {
    text: mins === 0 ? `en ${hours} h` : `en ${hours} h ${mins} min`,
    isNow: false,
    isPast: false,
  }
}

export function statusLabel(s: string): string {
  switch (s) {
    case 'confirmed':
      return 'Confirmada'
    case 'completed':
      return 'Cobrada'
    case 'cancelled':
      return 'Cancelada'
    case 'no_show':
      return 'No vino'
    default:
      return s
  }
}
