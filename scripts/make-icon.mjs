/**
 * Generates media/icon.png — a 256×256 marketplace icon with no external
 * tooling. Motif: three ascending bars (a rising "index") on a rounded navy
 * tile. Re-run with `node scripts/make-icon.mjs` if you tweak the design.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 256;
const buf = Buffer.alloc(SIZE * SIZE * 4); // RGBA

function px(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const inA = a / 255;
  const outA = buf[i + 3] / 255;
  const na = inA + outA * (1 - inA);
  if (na === 0) return;
  buf[i] = Math.round((r * inA + buf[i] * outA * (1 - inA)) / na);
  buf[i + 1] = Math.round((g * inA + buf[i + 1] * outA * (1 - inA)) / na);
  buf[i + 2] = Math.round((b * inA + buf[i + 2] * outA * (1 - inA)) / na);
  buf[i + 3] = Math.round(na * 255);
}

function roundedRect(x0, y0, w, h, radius, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.min(x - x0, x0 + w - 1 - x);
      const dy = Math.min(y - y0, y0 + h - 1 - y);
      if (dx < radius && dy < radius) {
        const d = Math.hypot(radius - dx, radius - dy);
        if (d > radius) continue;
        if (d > radius - 1.5) {
          px(x, y, [color[0], color[1], color[2], (color[3] ?? 255) * (radius - d) / 1.5]);
          continue;
        }
      }
      px(x, y, color);
    }
  }
}

// Background tile.
roundedRect(0, 0, SIZE, SIZE, 52, [11, 30, 51, 255]);
// Subtle top highlight band.
for (let y = 0; y < 90; y++) {
  const a = Math.round(18 * (1 - y / 90));
  for (let x = 0; x < SIZE; x++) px(x, y, [255, 255, 255, a]);
}

// Three ascending bars.
const bars = [
  { h: 96, color: [59, 130, 246] },
  { h: 148, color: [34, 160, 232] },
  { h: 196, color: [52, 211, 153] },
];
const barW = 46;
const gap = 22;
const totalW = bars.length * barW + (bars.length - 1) * gap;
let x = Math.round((SIZE - totalW) / 2);
const baseline = 210;
for (const bar of bars) {
  roundedRect(x, baseline - bar.h, barW, bar.h, 12, [...bar.color, 255]);
  x += barW + gap;
}

// ---- PNG encoding ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('media', { recursive: true });
writeFileSync('media/icon.png', png);
console.log(`wrote media/icon.png (${png.length} bytes)`);
