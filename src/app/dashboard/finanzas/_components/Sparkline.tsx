// -----------------------------------------------------------------------------
// Sparkline — mini-gráfica de tendencia (beneficio bruto, ingresos, etc.).
// Pure SVG, sin estado, sin librerías. Se renderiza en el hero del P&L y en
// los breakdowns de OperatorPanel.
//
// Si la serie tiene <2 puntos, no se renderiza (no hay tendencia que dibujar).
// Si la serie cruza el cero (negativo→positivo o al revés), se pinta una
// línea de referencia discontinua en y=0 para que el barbero vea el cruce.
// -----------------------------------------------------------------------------

interface Props {
  data: number[]
  /** Alto en píxeles. Default 48 (compacto para tiles). */
  height?: number
}

export default function Sparkline({ data, height = 48 }: Props) {
  if (data.length < 2) return null
  const W = 300
  const H = height
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 8) - 4
    return `${x},${y}`
  })
  const zeroY = H - ((0 - min) / range) * (H - 8) - 4
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none">
      {min < 0 && (
        <line
          x1="0" y1={zeroY}
          x2={W} y2={zeroY}
          stroke="var(--color-line-strong)"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
      )}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
