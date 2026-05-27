import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * SpiralBinding — the wire coil that binds the sidebar to the page, like a
 * spiral notebook. It's a fixed overlay CENTERED on the sidebar/page seam: the
 * strip is pinned to the sidebar's right edge (left-[var(--sidebar-width)]) and
 * pulled left by half its width (-translate-x-1/2), so the loops straddle the
 * seam — half over the sidebar, half over the page. It runs the full height of
 * the seam, fades out when the sidebar collapses, and is hidden on mobile (where
 * the sidebar is a sheet, not a seam).
 *
 * Each loop is a near-closed ring with a small gap centred at the BOTTOM (where the
 * wire would dip behind to the next turn) — a coil seen head-on. Drawn upright; TILT
 * can lean it (which swings the gap off-centre). Tiled down the seam by an SVG <pattern>.
 * The stroke (.nb-coil-wire) is an OPAQUE muted grey — ink mixed toward the
 * background, not toward transparent — so the wire reads as a solid soft graphite
 * line, not see-through over whatever's behind it.
 */
const W = 18; // strip width (px); loops are centered at W/2 so the coil sits on the seam
const TH = 14; // pitch — vertical distance between loops (px)
const CX = W / 2; // loop centre x (strip centre → seam centre)
const CY = TH / 2; // loop centre y within a tile
const RX = 6; // loop radii — wider than tall, so the top reads as a flattened (pressed-ball) curve
const RY = 3.8;
const GAP = 110; // the opening at the BOTTOM of the ring, in degrees; bigger = shorter "legs"
const TILT = 0; // lean in degrees; 0 keeps the gap centred at the bottom, negative swings it

// One coil loop: a near-closed ring with a small gap at the bottom, drawn as a single
// elliptical arc the long way over the top (large-arc flag), then leaned by TILT. The
// gap sits at θ=90° (bottom); the arc runs from one side of it, over the top, to the other.
const onRing = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return `${(CX + RX * Math.cos(r)).toFixed(2)} ${(CY + RY * Math.sin(r)).toFixed(2)}`;
};
const LOOP = `M ${onRing(90 + GAP / 2)} A ${RX} ${RY} 0 1 1 ${onRing(450 - GAP / 2)}`;

export const SpiralBinding = () => {
  const { state, isMobile } = useSidebar();
  if (isMobile) return null;

  return (
    <div
      className={cn(
        'nb-coil pointer-events-none fixed inset-y-0 z-50 -translate-x-1/2 transition-[left,opacity] duration-200 ease-linear',
        state === 'expanded' ? 'left-(--sidebar-width) opacity-100' : 'left-0 opacity-0'
      )}
      style={{ width: W }}
      aria-hidden
    >
      <svg className="block h-full w-full" width={W} height="100%">
        <defs>
          <pattern id="nb-coil-pat" width={W} height={TH} patternUnits="userSpaceOnUse">
            {/* a near-closed ring with a small bottom gap, leaned by TILT */}
            <path className="nb-coil-wire" d={LOOP} transform={`rotate(${TILT} ${CX} ${CY})`} />
          </pattern>
        </defs>
        <rect width={W} height="100%" fill="url(#nb-coil-pat)" />
      </svg>
    </div>
  );
};
