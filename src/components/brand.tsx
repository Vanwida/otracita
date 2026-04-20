/**
 * Inline brand marks. Prefer these over `<img src="/logo.svg">` on pages that
 * load Fraunces via next/font — inline SVG inherits the page's font, so the
 * ligature renders in the exact typeface instead of falling back to Georgia.
 */

interface MarkProps {
  /** Target pixel height of the mark. */
  height?: number;
  className?: string;
  /** Override text color. Uses currentColor by default so parents can theme it. */
  inkColor?: string;
  /** Override the brand dot color (useful on terracotta reverse). */
  dotColor?: string;
  /** Override the wordmark divider color. */
  dividerColor?: string;
}

/**
 * "oc" ligature monogram with terracotta dot at the c's tittle.
 * For favicons, avatars, chips — any square-ish spot where the wordmark
 * lockup would be too wide.
 */
export function Monogram({
  height = 32,
  className,
  inkColor = "currentColor",
  dotColor = "#C9653C",
}: MarkProps) {
  const width = Math.round(height * (120 / 96));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 120 96"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <text
        x="8"
        y="76"
        fontFamily="var(--font-fraunces), Fraunces, Georgia, serif"
        fontSize="78"
        fontWeight="600"
        fill={inkColor}
        letterSpacing="-6"
      >
        oc
      </text>
      <circle cx="101" cy="50" r="5" fill={dotColor} />
    </svg>
  );
}

/**
 * Full wordmark lockup: "oc [•]  |  otracita".
 * Used in nav, sidebar, footer — anywhere the brand name should read in full.
 */
export function Wordmark({
  height = 32,
  className,
  inkColor = "currentColor",
  dotColor = "#C9653C",
  dividerColor = "#E8DDD0",
}: MarkProps) {
  const width = Math.round(height * (320 / 72));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 320 72"
      fill="none"
      className={className}
      aria-label="otracita"
    >
      <text
        x="8"
        y="54"
        fontFamily="var(--font-fraunces), Fraunces, Georgia, serif"
        fontSize="56"
        fontWeight="600"
        fill={inkColor}
        letterSpacing="-3"
      >
        oc
      </text>
      <circle cx="76" cy="36" r="3.5" fill={dotColor} />
      <line x1="98" y1="16" x2="98" y2="56" stroke={dividerColor} strokeWidth="1" />
      <text
        x="112"
        y="48"
        fontFamily="var(--font-fraunces), Fraunces, Georgia, serif"
        fontSize="30"
        fontWeight="600"
        fill={inkColor}
        letterSpacing="-0.5"
      >
        otracita
      </text>
    </svg>
  );
}
