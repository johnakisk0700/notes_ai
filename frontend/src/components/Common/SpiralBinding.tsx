/**
 * SpiralBinding — the wire coil that binds the page, like a spiral notebook.
 *
 * Each loop is a tilted ellipse ring centered EXACTLY on the page's left edge
 * (E = the page sheet's left inset). The page sheet (`.nb-page`) is opaque and
 * sits in front (z above this), so it covers the right half of every ring —
 * what's left is a row of skewed half-circles bulging into the gutter that
 * appear to pass underneath the page's left edge. It moves with the layout
 * automatically (the region reflows when the sidebar opens/closes) and sits
 * behind the page (z-0), so it never floats on top of the UI.
 *
 * Keep E in sync with the page sheet's left inset in Layout.tsx — the rings are
 * centered on that line so they're cut cleanly in half.
 */
const W = 24; // strip width (px) — a touch wider than E so the ring's cut half is covered
const E = 20; // cut line = page sheet's left inset (Layout: left-5); ring centers here
const TH = 20; // tile height (px) — one loop

export const SpiralBinding = () => (
  <svg
    className="nb-coil pointer-events-none absolute top-0 left-0 z-0 h-full"
    width={W}
    height="100%"
    aria-hidden
  >
    <defs>
      <pattern id="nb-coil-pat" width={W} height={TH} patternUnits="userSpaceOnUse">
        {/* skewed loop, centered on the cut line; the page covers its right half */}
        <g transform={`rotate(-18 ${E} ${TH / 2})`}>
          <ellipse className="nb-coil-shadow" cx={E + 1} cy={TH / 2 + 1.5} rx="14" ry="11" />
          <ellipse className="nb-coil-wire" cx={E} cy={TH / 2} rx="14" ry="11" />
        </g>
      </pattern>
    </defs>
    <rect width={W} height="100%" fill="url(#nb-coil-pat)" />
  </svg>
);
