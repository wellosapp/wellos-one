// Generates the three PNG icons consumed by apps/web/public/manifest.json.
//
// Source-of-truth motif is the LeafIcon from
// apps/web/app/admin/_shell/icons.tsx — the same 24x24 stroke path the rail
// renders, scaled and re-styled (white on sage) for the PWA tile.
//
// Run via: `node apps/web/scripts/generate-pwa-icons.mjs` from the repo root.
// Outputs:
//   apps/web/public/icons/icon-192.png         — 192x192, leaf ~75% of canvas
//   apps/web/public/icons/icon-512.png         — 512x512, leaf ~75% of canvas
//   apps/web/public/icons/icon-maskable.png    — 512x512, leaf ~60% of canvas
//                                                (centered in the 80% safe-zone
//                                                so iOS/Android mask shapes
//                                                don't clip the mark)
//
// Colors are pinned to the design tokens:
//   --color-sage-deep = #3D7A5E (sage square)
//   white leaf so the stroke reads at small sizes
//
// Re-run any time the LeafIcon path changes or we want different padding.

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'icons');

// Wellos leaf — pulled verbatim from apps/web/app/admin/_shell/icons.tsx
// LeafIcon. Two-path stroke composition in a 24x24 viewBox.
const LEAF_PATHS = [
  'M4 20c0-9 6-15 16-15-1 11-7 16-16 15z',
  'M4 20c4-5 8-8 14-10',
];

const SAGE = '#3D7A5E';
const WHITE = '#FFFFFF';

/**
 * Build the SVG markup for a square icon.
 *
 * @param {object} opts
 * @param {number} opts.size                 Canvas pixels (square)
 * @param {number} opts.leafFractionOfCanvas 0..1 — how much of the canvas the
 *                                            leaf occupies. Smaller for
 *                                            maskable variant so OS masks
 *                                            don't clip the mark.
 * @param {number} opts.cornerRadiusFraction 0..1 — square corner radius as
 *                                            fraction of size. 0 = no round
 *                                            (maskable masks the shape).
 * @returns {string} SVG markup
 */
function buildSvg({ size, leafFractionOfCanvas, cornerRadiusFraction }) {
  const leafPixels = size * leafFractionOfCanvas;
  // Leaf source is a 24-unit viewBox; scale = leafPixels / 24.
  const scale = leafPixels / 24;
  // Center the 24x24 source so the leaf sits centered on the canvas.
  const offset = (size - leafPixels) / 2;
  const rx = size * cornerRadiusFraction;
  // Stroke width in source units. 1.6 matches the rail icon; bump slightly
  // so it reads at small sizes after rasterization.
  const strokeWidth = 1.8;

  const leafGroup = `
    <g transform="translate(${offset} ${offset}) scale(${scale})"
       fill="none" stroke="${WHITE}" stroke-width="${strokeWidth}"
       stroke-linecap="round" stroke-linejoin="round">
      ${LEAF_PATHS.map((d) => `<path d="${d}" />`).join('\n      ')}
    </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${SAGE}" />
  ${leafGroup}
</svg>`;
}

function rasterize(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: SAGE,
  });
  return resvg.render().asPng();
}

function writePng(filename, svg, size) {
  const png = rasterize(svg, size);
  const outPath = resolve(OUT_DIR, filename);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}

mkdirSync(OUT_DIR, { recursive: true });

// Standard variants — rounded corners (Android home screen renders these
// as-is on older OSes; modern Android also masks them, but 25% rx keeps the
// non-masked render looking like a tile not a hard square).
writePng(
  'icon-192.png',
  buildSvg({ size: 192, leafFractionOfCanvas: 0.5, cornerRadiusFraction: 0.2 }),
  192,
);
writePng(
  'icon-512.png',
  buildSvg({ size: 512, leafFractionOfCanvas: 0.5, cornerRadiusFraction: 0.2 }),
  512,
);

// Maskable variant — full-bleed sage (no rounded corners — the OS applies
// the mask), leaf shrunk to ~40% so it always sits inside the 80% safe-zone
// regardless of which mask shape the OS picks (squircle, circle, teardrop).
writePng(
  'icon-maskable.png',
  buildSvg({ size: 512, leafFractionOfCanvas: 0.4, cornerRadiusFraction: 0 }),
  512,
);
