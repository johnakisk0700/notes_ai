/* Generator for the lit-relief paper-texture library in src/index.css (the --tex-* block).
 *
 * Why a generator: each texture is a feTurbulence height field run through feDiffuseLighting,
 * so every bump gets a real directional highlight + micro-shadow (paper "tooth"), not the flat
 * symmetric speckle the old soft-light noise gave. That's a long, fiddly, URL-encoded SVG per
 * texture — 5 families x {page,fine} x {light,dark} = 20 of them. Authoring them by hand is
 * unreadable and typo-prone; this script is the source of truth. To retune, edit the constants
 * below and run:  bun scripts/gen-paper-textures.ts   then paste the two emitted blocks into
 * index.css (light block -> :root/.classic light, dark block -> .dark/.classic dark).
 *
 * Colour neutrality (so a palette's paper colour is preserved, never muddied):
 *   - DARK variants centre on mid-grey (mean ~0.5) and are blended `soft-light` — neutral at 0.5,
 *     so only the relief reads. Works because dark paper (L~0.16-0.22) is far from the extremes
 *     where soft-light vanishes.
 *   - LIGHT variants are bright (flats ~0.97, valleys dip toward ~0.82) and blended `multiply`.
 *     soft-light/overlay collapse on near-white paper (the b*(1-b) term -> 0), so light mode needs
 *     a multiply-with-a-bright-texture: flats stay put, only the tooth valleys darken a hair.
 * Both keep alpha opaque; feColorMatrix saturate 0 strips any lighting tint so the texture is pure
 * greyscale and the palette hue comes entirely from --background underneath.
 */

const ELEV = 55; // light elevation; flat-surface diffuse value = sin(ELEV)
const FLAT = Math.sin((ELEV * Math.PI) / 180); // ~0.8192

type Fam = {
  size: number; // page tile px
  fineSize: number; // sidebar/fine tile px
  page: string; // <feTurbulence .../> chain producing the height field for the page cut
  fine: string; // same, finer/quieter cut
};

// feDistantLight azimuth per family: laid lines are vertical, so rake the light across them (0°);
// everything else takes a soft 45°.
const turb = (baseFreq: string, oct: number, seed: number) =>
  `<feTurbulence type='fractalNoise' baseFrequency='${baseFreq}' numOctaves='${oct}' seed='${seed}' stitchTiles='stitch'/>`;

// linen is a woven cloth: a near-vertical warp composited with a near-horizontal weft.
const cloth = (bx: string, by: string, s1: number, s2: number) =>
  `<feTurbulence type='fractalNoise' baseFrequency='${bx}' numOctaves='1' seed='${s1}' stitchTiles='stitch' result='warp'/>` +
  `<feTurbulence type='fractalNoise' baseFrequency='${by}' numOctaves='1' seed='${s2}' stitchTiles='stitch' result='weft'/>` +
  `<feComposite in='warp' in2='weft' operator='arithmetic' k1='0' k2='0.5' k3='0.5' k4='0'/>`;

const FAMILIES: Record<string, Fam & { surf: number; fineSurf: number; az: number; fineAz?: number }> = {
  // warm fractal tooth (classic) — the hero page grain
  grain: { size: 140, fineSize: 120, page: turb('0.5', 3, 0), fine: turb('0.85', 2, 4), surf: 1.5, fineSurf: 1.0, az: 45 },
  // clean cold-press (paper) — even, fine tooth
  tooth: { size: 140, fineSize: 120, page: turb('0.68', 2, 5), fine: turb('1.0', 2, 9), surf: 1.3, fineSurf: 0.9, az: 45 },
  // coarse hand-made rag (copper) — big soft lumps; the coarsest family, so it reads boldest —
  // kept on a shorter surfaceScale than the others so its relief doesn't overpower text.
  rough: { size: 140, fineSize: 120, page: turb('0.36', 4, 7), fine: turb('0.58', 3, 12), surf: 1.65, fineSurf: 1.0, az: 45 },
  // vertical laid lines (sage) — anisotropic, light raked sideways
  laid: { size: 140, fineSize: 120, page: turb('0.5 0.013', 3, 11), fine: turb('0.72 0.02', 2, 5), surf: 1.4, fineSurf: 1.0, az: 0 },
  // woven crosshatch (warm)
  linen: { size: 140, fineSize: 120, page: cloth('0.022 0.5', '0.5 0.022', 3, 8), fine: cloth('0.03 0.68', '0.68 0.03', 8, 13), surf: 1.5, fineSurf: 1.0, az: 45 },
};

// amplitude (slope K) + recenter intercept I so the flat surface lands on the target mean.
// output = K*lit + I ;  at lit=FLAT we want `target` -> I = target - FLAT*K.
// Amplitude is the legibility lever. Light/multiply darkens the tooth valleys under the text, so
// keep it whisper-faint: flats sit ~pure paper (target ~0.99) and the swing (K) is small. Dark
// soft-light is more forgiving but was also too strong — eased down.
const MODES = {
  dark: { pageK: 0.32, fineK: 0.21, target: 0.5 }, // mid-grey for soft-light
  light: { pageK: 0.19, fineK: 0.13, target: 0.99 }, // near-white for multiply — barely-there tooth
};

const round = (n: number) => Number(n.toFixed(4));

const transfer = (K: number, target: number) => {
  const I = round(target - FLAT * K);
  const f = (c: string) => `<feFunc${c} type='linear' slope='${K}' intercept='${I}'/>`;
  return `<feComponentTransfer>${f('R')}${f('G')}${f('B')}<feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer>`;
};

const light = (surf: number, az: number) =>
  `<feDiffuseLighting surfaceScale='${surf}' diffuseConstant='1' lighting-color='#fff'><feDistantLight azimuth='${az}' elevation='${ELEV}'/></feDiffuseLighting>`;

const svg = (size: number, height: string, surf: number, az: number, K: number, target: number) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
  `<filter id='n' color-interpolation-filters='sRGB'>${height}${light(surf, az)}<feColorMatrix type='saturate' values='0'/>${transfer(K, target)}</filter>` +
  `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;

// match the existing encoding in index.css: single quotes + slashes stay literal; encode % then space.
const enc = (s: string) =>
  'url("data:image/svg+xml,' +
  s.replace(/%/g, '%25').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23').replace(/ /g, '%20') +
  '")';

const block = (mode: 'light' | 'dark') => {
  const m = MODES[mode];
  const lines: string[] = [];
  for (const [name, fam] of Object.entries(FAMILIES)) {
    const page = svg(fam.size, fam.page, fam.surf, fam.az, m.pageK, m.target);
    const fine = svg(fam.fineSize, fam.fine, fam.fineSurf, fam.fineAz ?? fam.az, m.fineK, m.target);
    lines.push(`  --tex-${name}: ${enc(page)};`);
    lines.push(`  --tex-${name}-fine: ${enc(fine)};`);
  }
  return lines.join('\n');
};

console.log('/* ===== LIGHT block (paste into the light scope) ===== */');
console.log(block('light'));
console.log('\n/* ===== DARK block (paste into the dark scope) ===== */');
console.log(block('dark'));

// `bun scripts/gen-paper-textures.ts --html` also writes a standalone swatch sheet you can open
// in a browser (file://) to eyeball every texture on the real palette papers, light + dark.
if (process.argv.includes('--html')) {
  // (name, page bg, sidebar/card bg) sampled from index.css + themes/*.css
  const PAPERS = {
    light: [
      ['classic', 'grain', '#f4f1e8', '#f7f4ec'],
      ['paper', 'tooth', '#fcfcfc', '#fbfbfb'],
      ['copper', 'rough', '#f3efe7', '#f7f3eb'],
      ['sage', 'laid', '#f0f1ea', '#f3f4ed'],
      ['warm', 'linen', '#f8f5ef', '#fbf8f2'],
    ],
    dark: [
      ['classic', 'grain', '#16181d', '#101319'],
      ['paper', 'tooth', '#1c1c1c', '#171717'],
      ['copper', 'rough', '#1a1714', '#16130f'],
      ['sage', 'laid', '#15191a', '#11150f'],
      ['warm', 'linen', '#15171d', '#101319'],
    ],
  } as const;

  // url() data-URIs hold double quotes, which break an inline style="" attribute — so every
  // swatch's background goes in the <style> block under a generated class (.sw-<mode>-<fam>).
  const rules: string[] = [];
  const swatch = (mode: 'light' | 'dark', name: string, fam: string, pageBg: string, sideBg: string) => {
    const m = MODES[mode];
    const blend = mode === 'light' ? 'multiply' : 'soft-light';
    const page = enc(svg(140, FAMILIES[fam].page, FAMILIES[fam].surf, FAMILIES[fam].az, m.pageK, m.target));
    const fine = enc(svg(120, FAMILIES[fam].fine, FAMILIES[fam].fineSurf, FAMILIES[fam].fineAz ?? FAMILIES[fam].az, m.fineK, m.target));
    const cls = `sw-${mode}-${fam}`;
    rules.push(`.${cls} .page{background-color:${pageBg};background-image:${page};background-size:140px;background-blend-mode:${blend}}`);
    rules.push(`.${cls} .fine{background-color:${sideBg};background-image:${fine};background-size:120px;background-blend-mode:${blend}}`);
    const ink = mode === 'light' ? '#222' : '#ddd';
    return `<figure class="${cls}"><div class="page" style="color:${ink}"><p>The quick brown fox jumps<br>over the lazy dog · 1234567890<br>Γειά σου κόσμε — readable?</p></div><div class="page fine"></div><figcaption>${name} · ${fam}</figcaption></figure>`;
  };

  const section = (mode: 'light' | 'dark') =>
    `<section class="${mode}"><h2>${mode} — blended ${mode === 'light' ? 'multiply' : 'soft-light'}</h2><div class="grid">` +
    PAPERS[mode].map(p => swatch(mode, p[0], p[1], p[2], p[3])).join('') +
    `</div></section>`;

  const body = section('light') + section('dark');
  const html = `<!doctype html><meta charset="utf-8"><title>paper textures</title><style>
    body{margin:0;font:13px/1.4 system-ui,sans-serif}
    section{padding:28px 32px}
    section.light{background:#e7e3da;color:#222}
    section.dark{background:#0c0d11;color:#ddd}
    h2{margin:0 0 18px;font-weight:600;letter-spacing:.02em;text-transform:lowercase;opacity:.8}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:22px}
    figure{margin:0}
    .page{height:120px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.25);overflow:hidden}
    .page p{margin:0;padding:14px 16px;font:14px/1.5 Georgia,serif}
    .fine{height:54px;margin-top:8px}
    figcaption{margin-top:8px;opacity:.7;font-size:12px}
    ${rules.join('\n    ')}
  </style>${body}`;

  Bun.write(new URL('./paper-textures-preview.html', import.meta.url), html);
  console.log('\n/* wrote scripts/paper-textures-preview.html */');
}
