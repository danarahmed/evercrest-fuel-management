/**
 * The EverCrest crest.
 *
 * One stroke: the V that opens the wordmark, up over the near peak, then the
 * long descent off the summit. Drawn rather than shipped as a bitmap so it
 * stays sharp at any size and picks up the brand colour from CSS.
 */
export function Mark({ size = 28, className = '' }) {
  return (
    <svg
      className={'crest ' + className}
      width={size}
      height={(size * 64) / 120}
      viewBox="0 0 120 64"
      fill="none"
      role="img"
      aria-label="EverCrest"
      focusable="false"
    >
      <path
        d="M5 27 L23 58 L41 13 L49 25 L59 5 L115 58"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Crest plus the company name, for the sign-in screen. */
export function Wordmark({ tagline }) {
  return (
    <div className="brandmark">
      <Mark size={92} />
      <div className="brandname">
        Ever<span>Crest</span>
      </div>
      {tagline && <div className="brandtag">{tagline}</div>}
    </div>
  )
}
