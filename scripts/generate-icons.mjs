/**
 * Generates the PWA icons into `public/`.
 *
 * Written by hand against the PNG spec rather than pulled from an image
 * library: this repo has no image tooling, the icons are four flat-colour
 * rectangles, and a build-time dependency for that would be absurd. Run with
 * `node scripts/generate-icons.mjs` after changing the design.
 *
 * Chrome requires a >=192px icon in the manifest before it will offer to
 * install a site at all, so without these the app could not go on a home
 * screen — which matters for something explicitly meant to work offline on a
 * phone.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [0x12, 0x16, 0x1c];
const BARS = [
  [0x05, 0x96, 0x69], // emerald
  [0xdb, 0x27, 0x79], // pink
  [0x63, 0x66, 0xf1], // indigo
  [0xf5, 0x9e, 0x0b], // amber
  [0x05, 0x96, 0x69],
];
/** Bar heights as a fraction of the drawing area — a sequencer silhouette. */
const HEIGHTS = [0.55, 0.95, 0.35, 0.75, 0.5];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {number} size @param {number} inset fraction of padding per side */
function drawIcon(size, inset) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = BG[0];
    px[i * 3 + 1] = BG[1];
    px[i * 3 + 2] = BG[2];
  }

  const pad = Math.round(size * inset);
  const area = size - pad * 2;
  const gap = Math.max(1, Math.round(area * 0.05));
  const barW = Math.floor((area - gap * (BARS.length - 1)) / BARS.length);
  const baseline = pad + area;

  BARS.forEach((colour, i) => {
    const h = Math.round(area * HEIGHTS[i]);
    const x0 = pad + i * (barW + gap);
    for (let y = baseline - h; y < baseline; y++) {
      for (let x = x0; x < x0 + barW; x++) {
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const o = (y * size + x) * 3;
        px[o] = colour[0];
        px[o + 1] = colour[1];
        px[o + 2] = colour[2];
      }
    }
  });

  // One filter byte (type 0, "None") in front of every scanline.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, inset] of [
  ['icon-192.png', 192, 0.16],
  ['icon-512.png', 512, 0.16],
  // Maskable icons are cropped to a circle on some launchers, so the artwork
  // has to sit inside the middle 80%.
  ['icon-maskable-512.png', 512, 0.26],
  // iOS ignores the manifest and reads <link rel="apple-touch-icon">. It also
  // does not honour `purpose: maskable`, so this one is drawn with the padding
  // baked in and 180 is the size Safari actually asks for.
  ['apple-touch-icon-180.png', 180, 0.18],
  ['favicon-32.png', 32, 0.12],
]) {
  writeFileSync(join(OUT, name), drawIcon(size, inset));
  console.log(`wrote public/${name} (${size}x${size})`);
}
