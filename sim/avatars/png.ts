// Minimal PNG encoder. The profile-assets bucket's allowed_mime_types are image/jpeg|png|webp|gif
// (+ video) — image/svg+xml is REJECTED at the Storage API — and the harness adds no npm
// dependency, so monogram logos are rasterised and encoded here over node:zlib.
import { deflateSync } from "node:zlib";
import type { Palette } from "./monogram";
import { GLYPHS } from "./glyphs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let CRC_TABLE: number[] | null = null;

function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Truecolour (RGB, 8-bit) PNG, filter type 0 on every row. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  if (rgb.length !== width * height * 3) {
    throw new Error(`rgb length ${rgb.length} does not match ${width}x${height}x3`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour
  // ihdr[10..12] = compression/filter/interlace = 0

  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: None
    Buffer.from(rgb.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, y * stride + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Up to two glyphs, scaled and centred on a solid brand fill. Unmapped characters fall back to
 *  "?" rather than throwing — a odd business name must never break the run. */
export function renderMonogram(text: string, palette: Palette, size = 256): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = palette.bg[0];
    rgb[i * 3 + 1] = palette.bg[1];
    rgb[i * 3 + 2] = palette.bg[2];
  }

  const chars = [...text].slice(0, 2);
  if (chars.length === 0) return encodePng(size, size, rgb);

  const scale = Math.max(1, Math.floor(size / 16));
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const gap = scale * 2;
  let x0 = Math.floor((size - (chars.length * glyphW + (chars.length - 1) * gap)) / 2);
  const y0 = Math.floor((size - glyphH) / 2);

  for (const ch of chars) {
    const rows = GLYPHS[ch] ?? GLYPHS["?"];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (!(rows[gy] & (1 << (4 - gx)))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x0 + gx * scale + sx;
            const py = y0 + gy * scale + sy;
            if (px < 0 || py < 0 || px >= size || py >= size) continue;
            const o = (py * size + px) * 3;
            rgb[o] = palette.fg[0];
            rgb[o + 1] = palette.fg[1];
            rgb[o + 2] = palette.fg[2];
          }
        }
      }
    }
    x0 += glyphW + gap;
  }

  return encodePng(size, size, rgb);
}
