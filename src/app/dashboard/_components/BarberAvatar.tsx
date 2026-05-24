'use client'

import { useState, useEffect } from 'react'

/**
 * Retrato del barbero con fallback a iniciales cuando la imagen falla
 * (URL muerta, blob borrado, CDN caído). `onError` apaga el <img> para
 * evitar el "círculo vacío" sobre bg-overlay.
 */
export default function BarberAvatar({
  url,
  name,
  className,
  fallbackClassName,
  alt,
}: {
  url: string | null
  name: string
  /** Clases del contenedor (forma/tamaño/borde). */
  className: string
  /** Clases del texto de iniciales (tamaño/peso). */
  fallbackClassName: string
  /** alt explícito; si no, decorativo. */
  alt?: string
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [url])

  const initials = name.slice(0, 1).toUpperCase()
  const showImg = url && !failed

  return (
    <div className={className}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt ?? ''}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center ${fallbackClassName}`}
          aria-label={alt}
        >
          {initials}
        </span>
      )}
    </div>
  )
}
