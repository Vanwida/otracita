"use client";

/**
 * Hero video for the landing.
 * Two renders: 16:9 for ≥md viewports, 9:16 for mobile.
 * Sources in `/otracita-hero-video/` (desktop) and `/otracita-hero-mobile/` (mobile).
 * Re-render with `npx hyperframes render`, then copy the MP4 to `/public/hero[-mobile].mp4`.
 */
export default function VideoSection() {
  return (
    <>
      {/* Desktop — 16:9 (hidden on mobile) */}
      <div className="relative hidden md:block aspect-video w-full overflow-hidden rounded-xl bg-[var(--color-brand-softer)]">
        <video
          src="/hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      </div>

      {/* Mobile — 9:16 (hidden on md+) */}
      <div className="relative block md:hidden aspect-[9/16] w-full max-w-[400px] mx-auto overflow-hidden rounded-xl bg-[var(--color-brand-softer)]">
        <video
          src="/hero-mobile.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      </div>
    </>
  );
}
