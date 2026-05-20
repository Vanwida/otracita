// -----------------------------------------------------------------------------
// CategoryStackedBar — barra apilada compacta (h-1.5) que muestra las top
// categorías de gasto. La primera carga más opacidad de brand, la segunda
// menos, y el resto se colapsa en "Otros". El barbero ve de un vistazo en
// qué está gastando más sin abrir el desglose.
//
// Si `total === 0` no se renderiza (no hay gastos que apilar).
// -----------------------------------------------------------------------------

interface Props {
  breakdown: { cat: string; cents: number; label: string }[]
  total: number
}

export default function CategoryStackedBar({ breakdown, total }: Props) {
  if (total === 0) return null
  // Top 2 + agrupar resto en "Otros".
  const top = breakdown.slice(0, 2)
  const restCents = breakdown.slice(2).reduce((s, b) => s + b.cents, 0)
  const segments: { label: string; cents: number; color: string }[] = []
  top.forEach((t, i) => {
    segments.push({
      label: t.label,
      cents: t.cents,
      color: i === 0 ? 'bg-brand/70' : 'bg-brand/40',
    })
  })
  if (restCents > 0) {
    segments.push({ label: 'Otros', cents: restCents, color: 'bg-brand/20' })
  }
  return (
    <div className="flex h-1.5 mt-2 rounded-full overflow-hidden bg-overlay">
      {segments.map((s, i) => (
        <div
          key={i}
          className={s.color}
          style={{ width: `${(s.cents / total) * 100}%` }}
          title={`${s.label} · ${(s.cents / 100).toFixed(0)} €`}
        />
      ))}
    </div>
  )
}
