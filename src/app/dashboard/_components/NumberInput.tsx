'use client'

import { useId, useState } from 'react'

// -----------------------------------------------------------------------------
// NumberInput — input numérico compartido que SÍ se puede dejar vacío (R11).
//
// El foot-gun de `<input type="number" value={n} onChange={setN(Number(...))}>`
// es que un campo vacío se interpreta como `0`: el barbero borra el precio
// para reescribirlo y el formulario manda 0 €. Aquí el estado interno es un
// string libre — el usuario puede dejarlo en blanco mientras escribe — y solo
// se coacciona a `number | null` cuando pierde el foco (o en cada tecla, vía
// `onValueChange`, para que el padre tenga el valor en vivo sin perder el
// "vacío significa vacío").
//
// Contrato:
//   · value: number | null         → null = campo vacío (NO 0)
//   · onValueChange(n: number|null) → emite en cada cambio válido / vacío
//   · onBlur opcional               → tras coaccionar (recibe el valor final)
//
// No fuerza 0. No tiene React import (jsx: 'react-jsx' lo inyecta). Solo se
// usa en las superficies WS-C; el resto de inputs numéricos migran en task #8.
// -----------------------------------------------------------------------------

interface Props {
  value: number | null
  onValueChange: (next: number | null) => void
  /** Mínimo permitido. Si tras blur el valor cae por debajo, se sube a `min`. */
  min?: number
  /** Máximo permitido. Si tras blur el valor supera, se baja a `max`. */
  max?: number
  /** Decimales permitidos: 0 = enteros (duración, cantidad), 2 = euros. */
  decimals?: number
  step?: number | string
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  disabled?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
  onBlur?: (final: number | null) => void
}

/** "" / "-" / "." en mitad de la escritura → null, sin romper el input. */
function parse(raw: string, decimals: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const normalized = trimmed.replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  if (decimals === 0) return Math.trunc(n)
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

function clamp(n: number, min?: number, max?: number): number {
  let out = n
  if (typeof min === 'number' && out < min) out = min
  if (typeof max === 'number' && out > max) out = max
  return out
}

export default function NumberInput({
  value,
  onValueChange,
  min,
  max,
  decimals = 0,
  step,
  placeholder,
  className,
  id,
  required,
  disabled,
  onBlur,
  ...aria
}: Props) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId
  // Estado interno = string libre. Permite "" mientras el usuario edita.
  const [text, setText] = useState(value === null ? '' : String(value))
  // Evita pisar lo que el usuario está escribiendo cuando el padre re-renderiza
  // con el mismo valor numérico (p.ej. tras un onValueChange controlado).
  const [isFocused, setIsFocused] = useState(false)
  // Sincroniza con `value` externo SIN useEffect: si el padre cambia el valor
  // de forma programática (reset de formulario, autollenado al elegir
  // servicio) y el usuario no está editando, derivamos el texto durante el
  // render. Patrón oficial "adjusting state when a prop changes" de
  // react.dev — prev-prop en state, sin efecto ni ref, sin cascada.
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value && !isFocused) {
    setPrevValue(value)
    setText(value === null ? '' : String(value))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setText(raw)
    // Emitimos en vivo el valor parseado (null si vacío) para que el padre
    // siempre tenga el estado correcto — sin forzar 0 ni clamp aún (clamp se
    // aplica en blur para no pelear con el usuario mientras teclea).
    onValueChange(parse(raw, decimals))
  }

  const handleBlur = () => {
    setIsFocused(false)
    const parsed = parse(text, decimals)
    if (parsed === null) {
      // Al perder el foco con el campo vacío, devolvemos el texto al `value`
      // del padre. Si el padre quiere de verdad un campo vacío, pasa
      // `value=null` y el setText('') lo mantiene; si el padre ignoró el
      // `null` (caso típico: "no me clearees el threshold, conserva el
      // valor anterior"), el input vuelve a mostrar ese número en vez de
      // quedarse en blanco — que Reni leía como "se queda en 0" (task #94).
      // Sin esto, el contrato "value es number" no se respeta visualmente
      // tras un blur con null.
      setText(value === null ? '' : String(value))
      onValueChange(null)
      onBlur?.(null)
      return
    }
    const finalValue = clamp(parsed, min, max)
    setText(String(finalValue))
    onValueChange(finalValue)
    onBlur?.(finalValue)
  }

  return (
    <input
      id={inputId}
      type="text"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      value={text}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      required={required}
      disabled={disabled}
      step={step}
      aria-label={aria['aria-label']}
      aria-describedby={aria['aria-describedby']}
    />
  )
}
