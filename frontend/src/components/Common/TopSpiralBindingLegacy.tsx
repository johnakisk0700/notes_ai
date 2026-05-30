import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * TopSpiralBindingLegacy — LEGACY, kept for now (not wired into the app). The original
 * top binding drawn as curved open rings seen head-on. Superseded by TopSpiralBinding,
 * which draws the coil as straight bars (a front-on / "looking at the spine" view). Keep
 * this around until the front-view version is locked in, then it can be deleted.
 *
 * A wire coil that crowns a surface along its TOP edge, so a panel reads as a top-bound
 * steno pad (τεφτέρι). Sibling of SpiralBinding (the sidebar/page seam coil); shares the
 * hand-drawn graphite wire (.nb-coil-wire), but the strip runs HORIZONTALLY and each loop
 * is a single open ring, leaning left.
 *
 * Drop it as the first child of a positioned container; it pins to the top and straddles
 * the edge (-translate-y-1/2). Width-aware: a ResizeObserver measures the container and
 * exactly as many complete loops as fit (with left/right padding) are rendered.
 */
const H = 88; // strip height (px) — tall enough for the bigger loop to hang low without clipping
const P = 52; // pitch — horizontal distance between loops (px)
const CX = P / 2; // loop centre x within a tile
const CY = 48; // loop centre y — below the strip centre so the coil rests low on the sheet
const RX = 19; // loop radii — taller than wide, a vertical ring seen head-on
const RY = 26;
const STROKE = 5; // wire thickness (px) — fatter than the sidebar coil's shared .nb-coil-wire default
const TILT = -12; // lean (deg); negative leans the loop to the LEFT
const UPPER_END = 190; // angle of the wire's upper terminal — rests just on the paper edge, left of centre
const LOWER_END = 96; // angle of the foot — sits on the front of the sheet, a touch left of bottom-centre
const PAD = 24; // left/right inset (px) — gap like a real notepad, coils don't run edge-to-edge

const onRing = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return `${(CX + RX * Math.cos(r)).toFixed(2)} ${(CY + RY * Math.sin(r)).toFixed(2)}`;
};
const LOOP = `M ${onRing(UPPER_END)} A ${RX} ${RY} 0 1 1 ${onRing(LOWER_END)}`;

export const TopSpiralBindingLegacy = ({ className }: { className?: string }) => {
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
  // centre the coils within the padded area so gaps are symmetric
  const totalCoilWidth = count * P;
  const offsetX = PAD + (available - totalCoilWidth) / 2;

  return (
    <div
      ref={containerRef}
      className={cn('nb-coil pointer-events-none absolute inset-x-0 top-0 z-20 -translate-y-1/2', className)}
      style={{ height: H }}
      aria-hidden
    >
      {width > 0 && (
        <svg className="block h-full w-full" width={width} height={H}>
          {Array.from({ length: count }, (_, i) => (
            <g key={i} transform={`translate(${offsetX + i * P}, 0)`}>
              <path className="nb-coil-wire" style={{ strokeWidth: STROKE }} d={LOOP} transform={`rotate(${TILT} ${CX} ${CY})`} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
};
