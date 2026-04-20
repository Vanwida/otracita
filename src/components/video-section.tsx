"use client";

/**
 * Hero video for the landing.
 * Rendered with HyperFrames — source in `/otracita-hero-video/index.html`.
 * Re-render with `npx hyperframes render`, then copy the MP4 to `/public/hero.mp4`.
 */
export default function VideoSection() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--color-brand-softer)]">
      <video
        src="/hero.mp4"
        autoPlay
        muted
        loop
        playsInline
        className="h-full w-full object-cover"
      />
    </div>
  );
}
