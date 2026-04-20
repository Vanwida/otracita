"use client";

/**
 * Hero video placeholder.
 *
 * When the HyperFrames-rendered MP4 is ready, drop it at `/public/hero.mp4`
 * and swap this block for the commented <video/> element below.
 */
export default function VideoSection() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--color-brand-softer)]">
      {/* Once hero.mp4 exists, uncomment:
      <video
        src="/hero.mp4"
        autoPlay
        muted
        loop
        playsInline
        poster="/hero-poster.jpg"
        className="h-full w-full object-cover"
      />
      */}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-8">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-[var(--color-brand)] flex items-center justify-center shadow-[0_10px_30px_rgba(201,101,60,0.3)]">
            <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="mt-6 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Así funciona otracita
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-2)]">
            Video en camino · 15 segundos
          </p>
        </div>
      </div>
    </div>
  );
}
