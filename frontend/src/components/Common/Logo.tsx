import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * Logo — the "mneme" brand mark + wordmark.
 *
 * The mark is an inked SEAL: a solid disc of brand ink (--primary) with the memory
 * spiral masked clean OUT of it, so the paper (and its grain) shows THROUGH the cuts.
 * Its rim and cuts are roughened by an SVG turbulence filter into a hand-stamped,
 * slightly-bled imprint — the spiral is the same coil that binds the notebook, here
 * pressed into the page like a wax seal. Beside it, the wordmark is set in heavy
 * all-caps Archivo Black (var(--font-display)) over a single highlighter swipe — the one
 * expressive tone the notebook palette allows.
 *
 * Everything is token-driven (ink, paper, highlighter), so the logo recolours across
 * every palette theme + dark mode with no per-theme code. The spiral is cut as a
 * transparent hole (not a paper-coloured fill), so the seal sits correctly on ANY
 * surface — sidebar, login, a tinted card. Styles + the reveal live in index.css
 * (.nb-logo-*).
 *
 * `animate` plays a one-shot reveal — the seal stamps in (press + settle), the word
 * rises, the highlighter wipes across — for hero placements (login). Still placements
 * (the sidebar) stay quiet, with just a restrained stamp-wobble on hover. All motion
 * is gated behind prefers-reduced-motion.
 */

// One continuous Archimedean spiral, sampled outer→inner. Pure + deterministic —
// geometry, like the binding components. Used here as the shape cut out of the seal.
const spiralPath = (
  turns: number,
  startAngle: number,
  outerR: number,
  innerR: number,
  cx: number,
  cy: number
) => {
  const sweep = turns * 2 * Math.PI;
  const steps = Math.round(turns * 56);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = outer free end, 1 = centre punch
    const angle = startAngle + t * sweep;
    const r = outerR - t * (outerR - innerR);
    d += `${i === 0 ? 'M' : 'L'} ${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)} `;
  }
  return d.trim();
};

// A tight coil that reads cleanly when knocked out of the ink disc (r 14 in the 32 box).
const COIL = spiralPath(2.3, -Math.PI / 4, 10.5, 1.8, 16, 16);

const SIZES = {
  sm: { mark: 28, text: 'text-[1.15rem]', gap: 'gap-2.5' },
  lg: { mark: 68, text: 'text-[2.7rem]', gap: 'gap-3.5' },
} as const;

type LogoProps = {
  size?: keyof typeof SIZES;
  animate?: boolean;
  /** A muted descriptor set beside the wordmark, e.g. "Labs" on the login hero. */
  suffix?: string;
  className?: string;
};

export function Logo({ size = 'sm', animate = false, suffix, className }: LogoProps) {
  const s = SIZES[size];
  // Unique per instance so two logos on one page (sidebar + a page header) never
  // collide on the filter / mask ids.
  const uid = useId().replace(/:/g, '');
  const stampId = `mneme-stamp-${uid}`;
  const maskId = `mneme-seal-${uid}`;

  return (
    <span
      className={cn('nb-logo inline-flex select-none items-center', s.gap, s.text, className)}
      data-animate={animate ? 'true' : undefined}
    >
      <svg
        className="nb-logo-mark shrink-0 overflow-visible"
        width={s.mark}
        height={s.mark}
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <defs>
          {/* roughens the disc rim + the spiral cuts into a hand-stamped, slightly bled imprint */}
          <filter id={stampId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* white keeps the ink, black cuts clean through (the spiral + the centre punch) */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
            <circle cx="16" cy="16" r="14" fill="#fff" />
            <path d={COIL} fill="none" stroke="#000" strokeWidth="2.8" strokeLinecap="round" pathLength={1} />
            <circle cx="16" cy="16" r="1.9" fill="#000" />
          </mask>
        </defs>
        {/* the inked seal — masked first (cuts the spiral), then displaced (stamps the edges) */}
        <g filter={`url(#${stampId})`}>
          <circle className="nb-logo-seal" cx="16" cy="16" r="14" mask={`url(#${maskId})`} />
        </g>
      </svg>

      <span className="nb-logo-word">
        <span className="nb-logo-swipe" aria-hidden="true" />
        <span className="nb-logo-ink">mneme</span>
      </span>

      {suffix ? <span className="nb-logo-suffix">{suffix}</span> : null}
    </span>
  );
}
