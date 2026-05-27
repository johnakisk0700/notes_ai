import { cn } from '@/lib/utils';

/**
 * TopSpiralBinding — a wire coil that crowns a surface along its TOP edge, so a
 * panel reads as a top-bound steno pad (τεφτέρι). It's the sibling of
 * SpiralBinding (the sidebar/page seam coil) and shares the same hand-drawn
 * graphite wire (.nb-coil-wire), but the strip runs HORIZONTALLY and each loop
 * is a single open ring, leaning left, seen head-on: the wire's UPPER end rests
 * on the paper edge, bulges UP and OVER behind the spine, then comes down to a
 * FOOT on the front of the sheet — so each loop reads as wire passing from
 * behind the pad toward the front, not a flat symmetric ring. Tiled across the
 * width by an SVG <pattern>.
 *
 * Drop it as the first child of a positioned container; it pins to the top and
 * straddles the edge (-translate-y-1/2). The loop centre sits just BELOW the
 * strip centre (CY > H/2), so the coil hangs low onto the sheet — its upper
 * terminal landing on the edge — instead of floating above it.
 *
 * Right edge: rather than slice the last loop (an SVG clips to its box by
 * default, which cuts the wire with an ugly straight line), on desktop the svg
 * is one pitch WIDER than its box and set to overflow-visible, so the final loop
 * completes and spills past the dialog edge into the page (the dialog is
 * overflow-visible). On mobile the dialog is full-bleed — there's no page to
 * spill into — so it stays at w-full (today's behaviour, no horizontal scroll).
 */
const H = 30; // strip height (px) — tall enough for the bigger loop to hang low without clipping
const P = 20; // pitch — horizontal distance between loops (px)
const CX = P / 2; // loop centre x within a tile
const CY = 17; // loop centre y — below the strip centre (H/2 = 15) so the coil rests low on the sheet
const RX = 5.8; // loop radii — taller than wide, a vertical ring seen head-on
const RY = 8.8;
const TILT = -12; // lean (deg); negative leans the loop to the LEFT
const UPPER_END = 190; // angle of the wire's upper terminal — rests just on the paper edge, left of centre
const LOWER_END = 96; // angle of the foot — sits on the front of the sheet, a touch left of bottom-centre

// One coil loop: a single open elliptical arc drawn the long way (large-arc flag) from the upper
// terminal, up and over the top (behind the spine), down the right and round to the foot — leaving
// the gap on the lower-left. Leaned by TILT. The asymmetric ends (one high on the edge, one low on
// the sheet) are what make the wire read as coming from behind the pad toward the front.
const onRing = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return `${(CX + RX * Math.cos(r)).toFixed(2)} ${(CY + RY * Math.sin(r)).toFixed(2)}`;
};
const LOOP = `M ${onRing(UPPER_END)} A ${RX} ${RY} 0 1 1 ${onRing(LOWER_END)}`;

export const TopSpiralBinding = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn('nb-coil pointer-events-none absolute inset-x-0 top-0 z-20 -translate-y-1/2', className)}
      style={{ height: H }}
      aria-hidden
    >
      {/* lg: one pitch wider + overflow-visible so the final loop spills past the edge instead of being sliced */}
      <svg className="block h-full w-full overflow-visible lg:w-[calc(100%+20px)]" height={H}>
        <defs>
          <pattern id="nb-coil-top-pat" width={P} height={H} patternUnits="userSpaceOnUse">
            <path className="nb-coil-wire" d={LOOP} transform={`rotate(${TILT} ${CX} ${CY})`} />
          </pattern>
        </defs>
        <rect width="100%" height={H} fill="url(#nb-coil-top-pat)" />
      </svg>
    </div>
  );
};
