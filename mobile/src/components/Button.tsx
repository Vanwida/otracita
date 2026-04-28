import type { ButtonHTMLAttributes, ReactNode } from 'react'

// -----------------------------------------------------------------------------
// Button — componente base con tap targets grandes (h-12 mínimo) y
// variantes brand. Para móvil el peso visual y el padding importan.
// -----------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'lg' | 'xl'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink active:bg-brand-strong disabled:bg-line disabled:text-ink-3',
  secondary: 'bg-surface border border-line text-ink active:bg-overlay disabled:opacity-60',
  ghost: 'text-ink-2 active:text-ink',
  danger: 'bg-danger text-white active:bg-danger/90 disabled:opacity-60',
}

const sizeClasses: Record<Size, string> = {
  lg: 'h-12 px-5 text-base',
  xl: 'h-14 px-6 text-lg',
}

export function Button({ variant = 'primary', size = 'lg', className = '', children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
