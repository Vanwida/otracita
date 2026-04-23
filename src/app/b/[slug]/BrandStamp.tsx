// -----------------------------------------------------------------------------
// BrandStamp — sello circular rotativo estilo "stamp" de barbería vintage.
//
// Aporta personalidad al hero sin ser chillón: texto en círculo que gira
// despacio alrededor de un icono de tijeras. Decorativo (pointer-events
// none). Server-safe porque solo usa CSS puro (keyframe `spin` ya
// disponible globalmente vía Tailwind).
// -----------------------------------------------------------------------------

interface Props {
  text: string
  /** Color del texto del sello. Normalmente brand-2 o blanco. */
  color: string
  /** Fondo del botón central. Normalmente brand o white. */
  centerBg?: string
  /** Color del icono central. */
  iconColor?: string
  size?: number
}

export default function BrandStamp({
  text,
  color,
  centerBg = 'rgba(0,0,0,0.45)',
  iconColor = '#FFFFFF',
  size = 96,
}: Props) {
  // Repetir dos veces para rellenar el círculo sin huecos.
  const repeated = `  ${text}  ✦  ${text}  ✦`

  return (
    <div
      className="relative select-none pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        style={{ animation: 'spin 22s linear infinite' }}
      >
        <defs>
          <path
            id="brand-stamp-path"
            d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
            fill="none"
          />
        </defs>
        <text
          fontSize="9.5"
          fontWeight="700"
          letterSpacing="2"
          fill={color}
          style={{ textTransform: 'uppercase' }}
        >
          <textPath href="#brand-stamp-path" startOffset="0">
            {repeated}
          </textPath>
        </text>
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-full flex items-center justify-center backdrop-blur-sm"
          style={{
            width: size * 0.42,
            height: size * 0.42,
            background: centerBg,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-1/2 h-1/2"
            fill="none"
            stroke={iconColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
        </div>
      </div>
    </div>
  )
}
