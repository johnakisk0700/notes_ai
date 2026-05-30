import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * TopSpiralBinding — a wire coil crowning a surface along its TOP edge, drawn as a FRONT /
 * "looking at the spine" view: per loop, a straight front leg dropping from the paper edge
 * to a punched hole, plus a small loop top arcing over the spine and back down onto the sheet
 * — so it reads as a real loop rather than a bare bar. Sibling of SpiralBinding (sidebar coil);
 * shares the hand-drawn graphite wire (.nb-coil-wire) + its round caps, and the punch-hole
 * fill (.nb-coil-hole). Runs HORIZONTALLY along the top.
 *
 * Geometry is carried over from the curved view kept in TopSpiralBindingLegacy so the parts
 * line up: the edge sits at H/2, the FOOT (hole) is low on the sheet where the legacy loop's
 * foot was (≈74), and the curl peeks above the edge like the top of the legacy ring (≈22).
 *
 * Drop it as the first child of a positioned container; it pins to the top and straddles the
 * edge (-translate-y-1/2). Width-aware via ResizeObserver — as many evenly-spaced loops as
 * fit (with left/right padding) are rendered, centred, no slicing.
 */
const H = 88; // strip height (px); the sheet's top edge sits at H/2
const P = 24; // pitch — horizontal distance between loops (px)
const CX = P / 2; // loop centre x within a tile
const EDGE = H / 2; // the sheet's top edge in strip coords (44)
const FOOT = 72; // front-leg foot / hole centre — rests ~28px onto the sheet (legacy foot ≈ 74)
const BACK_RISE = 12; // how high the loop top bulges above the edge (control height; the curve peaks a bit lower)
const BACK_DX = 7; // half-width of the loop top — its far foot lands 2*BACK_DX to the left
const LAND = 3; // how far past the edge the loop top's far foot rests ON the sheet, so it can't look airborne
const STROKE = 5; // wire thickness (px) — fatter than the sidebar coil's shared .nb-coil-wire default
const HOLE_RX = 6; // punch-hole radii — front-facing, so a touch wider than tall, and roomy enough to swallow the wire
const HOLE_RY = 4.5;
const PAD = 18; // left/right inset (px) — gap like a real notepad, loops don't run edge-to-edge
const LIFT = 3; // nudge the whole strip up a few px so the loops sit exactly on the sheet's top edge

// One loop, front-on: straight front leg from the hole up to the edge, then a smooth loop top
// arcing over the spine and back DOWN onto the sheet. The Q control sits directly above the join
// (same x), so the curve leaves the leg vertically — no kink — and reads as one curvy loop.
const coil = (x: number) =>
  `M ${x} ${FOOT} L ${x} ${EDGE} Q ${x} ${EDGE - 2 * BACK_RISE} ${x - 2 * BACK_DX} ${EDGE + LAND}`;

export const TopSpiralBinding = ({ className }: { className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const available = width - PAD * 2;
  const count = available > 0 ? Math.floor(available / P) : 0;
  // centre the loops within the padded area so the side gaps stay symmetric
  const loopsWidth = count * P;
  const offsetX = PAD + (available - loopsWidth) / 2;

  return (
    <div
      ref={containerRef}
      className={cn('nb-coil pointer-events-none absolute inset-x-0 top-0 z-20', className)}
      style={{ height: H, transform: `translateY(calc(-50% - ${LIFT}px))` }}
      aria-hidden
    >
      {width > 0 && (
        <svg className="block h-full w-full" width={width} height={H}>
          {Array.from({ length: count }, (_, i) => {
            const x = offsetX + i * P + CX;
            return (
              <g key={i}>
                {/* hole first, wire on top — so the wire reads as plunging INTO the hole,
                    not the hole sitting on top of the wire */}
                <ellipse className="nb-coil-hole" cx={x} cy={FOOT} rx={HOLE_RX} ry={HOLE_RY} />
                <path className="nb-coil-wire" style={{ strokeWidth: STROKE }} d={coil(x)} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};
