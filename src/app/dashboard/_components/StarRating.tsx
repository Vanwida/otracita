import { Star } from 'lucide-react'

// -----------------------------------------------------------------------------
// StarRating — fila de 1-5 estrellas de solo lectura para mostrar una
// valoración numérica. Primitivo visual sin estado, pensado para reseñas
// (internas o de Google) allá donde se necesite pintar la misma nota.
// -----------------------------------------------------------------------------

interface Props {
  value: number
  size?: 'sm' | 'md'
}

export default function StarRating({ value, size = 'sm' }: Props) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${value} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value)
        return (
          <Star
            key={n}
            className={cls}
            style={{
              color: filled ? 'var(--color-warning)' : 'var(--color-line)',
              fill: filled ? 'var(--color-warning)' : 'transparent',
            }}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}
