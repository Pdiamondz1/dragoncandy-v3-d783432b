# Synthetic Avatar Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every one of the ~1,500 browsable synthetic creator profiles a distinct photoreal face and every one of the 509 synthetic businesses a monogram logo, by generating a face pool once and pointing profiles at it by reference.

**Architecture:** Three separable units — a paid **generate** step (OpenAI images → local cache → one durable pool prefix in `profile-assets`), a pure **assign** step (`userId` → pool index by hash, blind to every profile attribute), and a service-role **apply** step (registry-scoped, chunked, idempotent). No per-user image objects are ever created, so teardown has nothing to orphan and re-seeding is free.

**Tech Stack:** TypeScript, Node 18+ via lockfile-pinned `tsx`, `@supabase/supabase-js` v2, `node:zlib` (PNG encoding — no new dependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-synthetic-avatar-pool-design.md`

## Global Constraints

- **Branch:** `feat/synthetic-avatar-pool`. Every task commits on it.
- **Tests run from the repo root:** `npx vitest run sim/` — not from `sim/`.
- **Typecheck:** `npx tsc -p sim/tsconfig.json` must be clean (0 errors) before every commit.
- **No new npm dependencies.** PNG encoding uses `node:zlib`. The bucket rejects `image/svg+xml`.
- **Every `.in()` chunks at 100 ids.** A 1,500-id `.in()` overflows undici's 16 KB header limit — see `docs/wiki/concepts/supabase-in-filter-header-overflow.md`. This is not optional.
- **Every write is anchored on the `synthetic_users` registry.** A real user must be unreachable by construction, not by filter correctness.
- **Faces are assigned by id hash only** — never by name, city, or any profile attribute.
- **Bucket:** `profile-assets` (public; allowed mimes `image/jpeg|png|webp|gif` + video; 50 MB limit).
- **Pool prefixes:** `synthetic/faces/NNNN.jpg`, `synthetic/logos/NNNN.png` (4-digit zero-padded).
- **Env:** harness vars are `SIM_*` (`SIM_SUPABASE_URL`, `SIM_SUPABASE_SECRET_KEY`, `SIM_SUPABASE_ANON_KEY`), plus new `SIM_OPENAI_API_KEY` and `SIM_IMAGE_MODEL`. Never the app's `VITE_*`.
- **`SIM_IMAGE_MODEL` must not be pinned to `gpt-image-1`** (retires 2026-10-23). Verify against OpenAI's live model list before the first paid run and record the chosen model in the manifest.
- **The paid run and all prod writes are founder-gated** (Task 6). Tasks 1–5 spend nothing and touch no prod data.

## File Structure

| File | Responsibility |
|-|-|
| `sim/avatars/pool.ts` | Pure. `poolIndex()`, object paths, public-URL builder. |
| `sim/avatars/monogram.ts` | Pure. Initials + deterministic palette choice from a business name. |
| `sim/avatars/png.ts` | Pure. Minimal PNG encoder over `node:zlib`; renders a monogram tile. |
| `sim/avatars/generate.ts` | Batch loop: injected image source → cache → upload. Checkpoint/resume. |
| `sim/avatars/apply.ts` | Service-role: assign pool objects to profiles, chunked + registry-scoped. |
| `sim/avatars/purge.ts` | Explicit pool cleanup (separate from cohort teardown). |
| `sim/run.ts` | Add `avatars-generate` / `avatars-apply` / `avatars-purge` command cases. |
| `sim/cli.ts` | Usage comment only. |
| `.gitignore` | Add `sim/.avatar-cache/`. |

---

### Task 1: Pure pool assignment

**Files:**
- Create: `sim/avatars/pool.ts`
- Test: `sim/avatars/pool.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `poolIndex(userId: string, poolSize: number): number`; `facePath(i: number): string`; `logoPath(i: number): string`; `poolPublicUrl(supabaseUrl: string, objectPath: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { poolIndex, facePath, logoPath, poolPublicUrl } from "./pool";

describe("poolIndex", () => {
  const id = "b0280bbd-4c11-4a77-98d0-4ef5b494badf";

  it("is deterministic for the same id and pool size", () => {
    expect(poolIndex(id, 1500)).toBe(poolIndex(id, 1500));
  });

  it("stays within [0, poolSize)", () => {
    for (const n of [1, 7, 223, 1500]) {
      const v = poolIndex(id, n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
    }
  });

  it("spreads ids across the pool (no degenerate clustering)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1500; i++) seen.add(poolIndex(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, 1500));
    expect(seen.size).toBeGreaterThan(700); // ~63% distinct is the birthday-collision floor
  });

  it("throws on a non-positive pool size rather than returning NaN", () => {
    expect(() => poolIndex(id, 0)).toThrow(/poolSize/);
  });
});

describe("paths", () => {
  it("zero-pads to 4 digits under the durable prefixes", () => {
    expect(facePath(7)).toBe("synthetic/faces/0007.jpg");
    expect(logoPath(1499)).toBe("synthetic/logos/1499.png");
  });

  it("builds a public URL for the profile-assets bucket", () => {
    expect(poolPublicUrl("https://x.supabase.co", "synthetic/faces/0007.jpg"))
      .toBe("https://x.supabase.co/storage/v1/object/public/profile-assets/synthetic/faces/0007.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/avatars/pool.test.ts`
Expected: FAIL — cannot find module `./pool`.

- [ ] **Step 3: Write minimal implementation**

```ts
// Deterministic pool assignment. Inputs are an id and a size — NEVER a name, city, or any
// profile attribute (see the spec §4.3: inferring appearance from a surname is unreliable
// and wrong, so the mapping is blind and the pool is varied instead).
const BUCKET = "profile-assets";

/** FNV-1a 32-bit — stable across runs and Node versions (no hashing lib, no seed drift). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function poolIndex(userId: string, poolSize: number): number {
  if (!Number.isInteger(poolSize) || poolSize <= 0) throw new Error(`poolSize must be a positive integer, got ${poolSize}`);
  return fnv1a(userId) % poolSize;
}

const pad4 = (i: number): string => String(i).padStart(4, "0");
export const facePath = (i: number): string => `synthetic/faces/${pad4(i)}.jpg`;
export const logoPath = (i: number): string => `synthetic/logos/${pad4(i)}.png`;

export function poolPublicUrl(supabaseUrl: string, objectPath: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/avatars/pool.test.ts` → PASS (7 assertions across 6 tests).
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/avatars/pool.ts sim/avatars/pool.test.ts
git commit -m "feat(sim): deterministic avatar pool assignment (blind to profile attributes)"
```

---

### Task 2: Monogram derivation + PNG encoder

**Files:**
- Create: `sim/avatars/monogram.ts`, `sim/avatars/png.ts`
- Test: `sim/avatars/monogram.test.ts`, `sim/avatars/png.test.ts`

**Interfaces:**
- Consumes: `poolIndex` from Task 1 (for palette choice).
- Produces: `initials(businessName: string): string`; `paletteFor(userId: string): { bg: [number,number,number]; fg: [number,number,number] }`; `encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array`; `renderMonogram(text: string, palette: Palette, size?: number): Uint8Array`.

- [ ] **Step 1: Write the failing tests**

```ts
// sim/avatars/monogram.test.ts
import { describe, it, expect } from "vitest";
import { initials, paletteFor } from "./monogram";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Joe's Pizza")).toBe("JP");
  });
  it("falls back to the first two letters of a single word", () => {
    expect(initials("Rosticceria")).toBe("RO");
  });
  it("ignores punctuation and extra whitespace", () => {
    expect(initials("  The   #1 Taco-Truck ")).toBe("TT"); // articles/numerals skipped
  });
  it("handles non-ASCII names without throwing", () => {
    expect(initials("Café Ñoño")).toBe("CÑ");
  });
  it("never returns empty for a name with no letters", () => {
    expect(initials("### 123")).toBe("DC");
  });
});

describe("paletteFor", () => {
  it("is deterministic and returns brand colours", () => {
    const a = paletteFor("user-1");
    expect(paletteFor("user-1")).toEqual(a);
    expect(a.bg).toHaveLength(3);
  });
});
```

```ts
// sim/avatars/png.test.ts
import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng, renderMonogram } from "./png";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("encodePng", () => {
  it("emits the PNG signature and an IHDR carrying the dimensions", () => {
    const png = Buffer.from(encodePng(2, 3, new Uint8Array(2 * 3 * 3)));
    expect(png.subarray(0, 8).equals(SIG)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(2); // IHDR width
    expect(png.readUInt32BE(20)).toBe(3); // IHDR height
  });

  it("round-trips pixel data through inflate with per-row filter bytes", () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0]); // 2x1: red, green
    const png = Buffer.from(encodePng(2, 1, rgb));
    const idatStart = png.indexOf(Buffer.from("IDAT")) + 4;
    const idatLen = png.readUInt32BE(idatStart - 8);
    const raw = inflateSync(png.subarray(idatStart, idatStart + idatLen));
    expect(Array.from(raw)).toEqual([0, 255, 0, 0, 0, 255, 0]); // filter byte 0 + RGB
  });

  it("rejects a pixel buffer whose length disagrees with the dimensions", () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/length/);
  });
});

describe("renderMonogram", () => {
  it("produces a decodable square PNG of the requested size", () => {
    const png = Buffer.from(renderMonogram("JP", { bg: [15, 118, 110], fg: [255, 255, 255] }, 256));
    expect(png.subarray(0, 8).equals(SIG)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
  });

  it("is deterministic — same input, byte-identical output", () => {
    const p = { bg: [15, 118, 110] as [number, number, number], fg: [255, 255, 255] as [number, number, number] };
    expect(Buffer.from(renderMonogram("JP", p)).equals(Buffer.from(renderMonogram("JP", p)))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run sim/avatars/monogram.test.ts sim/avatars/png.test.ts`
Expected: FAIL — cannot find modules `./monogram`, `./png`.

- [ ] **Step 3: Write minimal implementations**

```ts
// sim/avatars/monogram.ts
import { poolIndex } from "./pool";

export type Palette = { bg: [number, number, number]; fg: [number, number, number] };

// dc-teal-btn / dc-pink-accent-btn / dc-teal — brand fills that carry white text (DESIGN_SYSTEM.md).
const PALETTES: Palette[] = [
  { bg: [15, 118, 110], fg: [255, 255, 255] },
  { bg: [219, 39, 119], fg: [255, 255, 255] },
  { bg: [77, 217, 192], fg: [26, 26, 42] },
];

const SKIP = new Set(["THE", "A", "AN", "OF", "AND"]);

export function initials(businessName: string): string {
  const words = businessName
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && /\p{L}/u.test(w) && !SKIP.has(w.toUpperCase()));
  if (words.length === 0) return "DC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function paletteFor(userId: string): Palette {
  return PALETTES[poolIndex(userId, PALETTES.length)];
}
```

```ts
// sim/avatars/png.ts
// Minimal PNG encoder. The profile-assets bucket rejects image/svg+xml, and we add no npm
// dependency, so monogram logos are encoded here over node:zlib.
import { deflateSync } from "node:zlib";
import type { Palette } from "./monogram";
import { GLYPHS } from "./glyphs";

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

let TABLE: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!TABLE) {
    TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error(`rgb length ${rgb.length} != ${width}*${height}*3`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter type 0 (None)
    Buffer.from(rgb.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, y * (1 + width * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderMonogram(text: string, palette: Palette, size = 256): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = palette.bg[0];
    rgb[i * 3 + 1] = palette.bg[1];
    rgb[i * 3 + 2] = palette.bg[2];
  }
  // 5x7 bitmap glyphs, scaled and centred. Unknown characters render as a blank cell.
  const scale = Math.max(1, Math.floor(size / 16));
  const chars = text.slice(0, 2).split("");
  const glyphW = 5 * scale, glyphH = 7 * scale, gap = scale * 2;
  let x0 = Math.floor((size - (chars.length * glyphW + (chars.length - 1) * gap)) / 2);
  const y0 = Math.floor((size - glyphH) / 2);
  for (const ch of chars) {
    const rows = GLYPHS[ch] ?? GLYPHS["?"];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (!(rows[gy] & (1 << (4 - gx)))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x0 + gx * scale + sx, py = y0 + gy * scale + sy;
            if (px < 0 || py < 0 || px >= size || py >= size) continue;
            const o = (py * size + px) * 3;
            rgb[o] = palette.fg[0]; rgb[o + 1] = palette.fg[1]; rgb[o + 2] = palette.fg[2];
          }
        }
      }
    }
    x0 += glyphW + gap;
  }
  return encodePng(size, size, rgb);
}
```

Also create `sim/avatars/glyphs.ts` — a 5×7 bitmap font covering `A–Z`, `0–9`, `Ñ`, `É`, and `?` (the fallback). Each glyph is 7 numbers, one per row, low 5 bits set left-to-right. Example rows for `A`: `[0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001]`. Write out every character the `initials()` tests can produce; a missing glyph must fall back to `?`, never crash.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run sim/avatars/` → PASS.
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/avatars/monogram.ts sim/avatars/png.ts sim/avatars/glyphs.ts sim/avatars/monogram.test.ts sim/avatars/png.test.ts
git commit -m "feat(sim): monogram logos as dependency-free PNGs (bucket rejects SVG)"
```

---

### Task 3: Generation loop (injected image source, checkpointed)

**Files:**
- Create: `sim/avatars/generate.ts`
- Test: `sim/avatars/generate.test.ts`
- Modify: `.gitignore` (add `sim/.avatar-cache/`)

**Interfaces:**
- Consumes: `facePath` from Task 1.
- Produces:
  ```ts
  export interface GenerateDeps {
    generateImage: (prompt: string) => Promise<Uint8Array>;   // injected — real impl calls OpenAI
    upload: (objectPath: string, bytes: Uint8Array, contentType: string) => Promise<void>;
    readManifest: () => Manifest | null;
    writeManifest: (m: Manifest) => void;
    cacheWrite: (index: number, bytes: Uint8Array) => void;
    cacheRead: (index: number) => Uint8Array | null;
  }
  export interface Manifest { model: string; entries: Record<number, { uploaded: boolean }>; }
  export function facePrompt(index: number): string;
  export function generatePool(count: number, model: string, deps: GenerateDeps): Promise<{ generated: number; skipped: number; refused: number }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { generatePool, facePrompt, type Manifest } from "./generate";

const bytes = (n: number) => new Uint8Array([n, n, n]);

function deps(over: Partial<Parameters<typeof generatePool>[2]> = {}) {
  const cache = new Map<number, Uint8Array>();
  let manifest: Manifest | null = null;
  return {
    generateImage: vi.fn(async () => bytes(1)),
    upload: vi.fn(async () => {}),
    readManifest: () => manifest,
    writeManifest: (m: Manifest) => { manifest = m; },
    cacheWrite: (i: number, b: Uint8Array) => { cache.set(i, b); },
    cacheRead: (i: number) => cache.get(i) ?? null,
    ...over,
  };
}

describe("facePrompt", () => {
  it("varies across the demographic matrix and never references a real person", () => {
    const a = facePrompt(0), b = facePrompt(7);
    expect(a).not.toBe(b);
    expect(a.toLowerCase()).toMatch(/portrait/);
    expect(a.toLowerCase()).toMatch(/not a real person|fictional/);
  });
});

describe("generatePool", () => {
  it("generates, caches and uploads each index once", async () => {
    const d = deps();
    const r = await generatePool(3, "model-x", d);
    expect(r.generated).toBe(3);
    expect(d.generateImage).toHaveBeenCalledTimes(3);
    expect(d.upload).toHaveBeenCalledTimes(3);
  });

  it("resumes: an uploaded index is skipped and never re-generated (no re-spend)", async () => {
    const d = deps();
    await generatePool(2, "model-x", d);
    d.generateImage.mockClear();
    const r = await generatePool(2, "model-x", d);
    expect(d.generateImage).not.toHaveBeenCalled();
    expect(r.skipped).toBe(2);
  });

  it("re-uploads from cache without re-generating when the upload failed last run", async () => {
    const d = deps({ upload: vi.fn(async () => { throw new Error("network"); }) });
    await generatePool(1, "model-x", d).catch(() => {});
    const d2 = deps({
      cacheRead: d.cacheRead, cacheWrite: d.cacheWrite,
      readManifest: d.readManifest, writeManifest: d.writeManifest,
    });
    await generatePool(1, "model-x", d2);
    expect(d2.generateImage).not.toHaveBeenCalled();
    expect(d2.upload).toHaveBeenCalledTimes(1);
  });

  it("counts a refusal, skips it, and keeps going", async () => {
    const d = deps({
      generateImage: vi.fn(async (p: string) => { if (p === facePrompt(1)) throw new Error("content_policy_violation"); return bytes(1); }),
    });
    const r = await generatePool(3, "model-x", d);
    expect(r.refused).toBe(1);
    expect(r.generated).toBe(2);
  });

  it("records the model in the manifest so a later top-up can match it", async () => {
    const d = deps();
    await generatePool(1, "model-y", d);
    expect(d.readManifest()?.model).toBe("model-y");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/avatars/generate.test.ts`
Expected: FAIL — cannot find module `./generate`.

- [ ] **Step 3: Write minimal implementation**

Implement `facePrompt(index)` by indexing fixed attribute arrays (age band, gender presentation, skin tone, hair, build, setting, lighting) with different strides so combinations vary; every prompt ends with a clause stating the subject is a fictional person and must not resemble any real or public figure. Implement `generatePool` as a sequential loop over `0..count-1` that: returns early for an index already `uploaded` in the manifest (count `skipped`); uses `cacheRead` when present instead of calling `generateImage`; catches a generation error, counts `refused`, and continues; writes the manifest after each successful upload so a crash resumes cleanly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/avatars/generate.test.ts` → PASS (all 6).
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/avatars/generate.ts sim/avatars/generate.test.ts .gitignore
git commit -m "feat(sim): checkpointed face-pool generation with injected image source"
```

---

### Task 4: Apply pool objects to profiles

**Files:**
- Create: `sim/avatars/apply.ts`
- Test: `sim/avatars/apply.test.ts`

**Interfaces:**
- Consumes: `poolIndex`, `facePath`, `logoPath`, `poolPublicUrl` (Task 1); `initials`, `paletteFor` (Task 2).
- Produces: `chunkIds(ids: string[], size?: number): string[][]`; `planAssignments(rows, poolSizes, supabaseUrl): Assignment[]` (pure); `applyAssignments(svc, assignments): Promise<{ creators: number; businesses: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { chunkIds, planAssignments } from "./apply";

const URL_ = "https://x.supabase.co";

describe("chunkIds", () => {
  it("chunks at 100 by default", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const c = chunkIds(ids);
    expect(c).toHaveLength(3);
    expect(c[0]).toHaveLength(100);
    expect(c[2]).toHaveLength(50);
  });

  it("keeps a built PostgREST URL under undici's 16 KB header limit", () => {
    const uuids = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    for (const batch of chunkIds(uuids)) {
      const url = `${URL_}/rest/v1/creator_profiles?user_id=in.(${batch.map((u) => `"${u}"`).join(",")})`;
      expect(url.length).toBeLessThan(16_000);
    }
  });
});

describe("planAssignments", () => {
  const rows = [
    { userId: "u1", kind: "creator" as const, name: null },
    { userId: "u2", kind: "business" as const, name: "Joe's Pizza" },
  ];

  it("routes creators to faces and businesses to logos", () => {
    const out = planAssignments(rows, { faces: 1500, logos: 509 }, URL_);
    expect(out.find((a) => a.userId === "u1")!.url).toMatch(/synthetic\/faces\/\d{4}\.jpg$/);
    expect(out.find((a) => a.userId === "u2")!.url).toMatch(/synthetic\/logos\/\d{4}\.png$/);
  });

  it("is idempotent — same input, same URLs", () => {
    expect(planAssignments(rows, { faces: 1500, logos: 509 }, URL_))
      .toEqual(planAssignments(rows, { faces: 1500, logos: 509 }, URL_));
  });

  it("never derives the index from the name", () => {
    const a = planAssignments([{ userId: "u2", kind: "business", name: "Joe's Pizza" }], { faces: 10, logos: 10 }, URL_);
    const b = planAssignments([{ userId: "u2", kind: "business", name: "Totally Different" }], { faces: 10, logos: 10 }, URL_);
    expect(a[0].url).toBe(b[0].url);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/avatars/apply.test.ts`
Expected: FAIL — cannot find module `./apply`.

- [ ] **Step 3: Write minimal implementation**

`chunkIds` slices at 100. `planAssignments` maps each row to `{ userId, kind, url, monogram? }` using `poolIndex(userId, …)` — the name is used **only** to compute monogram text for logo rendering, never for index selection. `applyAssignments` reads the target ids **from `synthetic_users`** (never from a free-form filter), then per chunk issues: `creator_profiles.update({ avatar_url })`, `business_profiles.update({ logo_url })`, and `profiles.update({ avatar_url })`; it also clears `portfolio_urls` to `[]` for creators whose current value points at a `profile-assets/<uid>/avatar.jpg` placeholder, and deletes those 160-byte objects.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/avatars/apply.test.ts` → PASS.
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/avatars/apply.ts sim/avatars/apply.test.ts
git commit -m "feat(sim): registry-scoped, chunked avatar application"
```

---

### Task 5: Purge + CLI wiring + docs

**Files:**
- Create: `sim/avatars/purge.ts`
- Modify: `sim/run.ts` (add three `case` arms in `main`'s switch, alongside `marketplace-purge` at line ~1099), `sim/cli.ts` (usage comment), `sim/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: CLI commands `avatars-generate --count 1500 [--dry-run] [--limit N]`, `avatars-apply`, `avatars-purge`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseAvatarArgs } from "./purge"; // arg parsing lives with the commands it serves

describe("parseAvatarArgs", () => {
  it("defaults count to 1500 and dry-run to false", () => {
    expect(parseAvatarArgs([])).toEqual({ count: 1500, dryRun: false, limit: null });
  });
  it("parses --count, --limit and --dry-run", () => {
    expect(parseAvatarArgs(["--count", "20", "--limit", "5", "--dry-run"]))
      .toEqual({ count: 20, dryRun: true, limit: 5 });
  });
  it("rejects a non-numeric count rather than silently defaulting", () => {
    expect(() => parseAvatarArgs(["--count", "abc"])).toThrow(/count/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/avatars/purge.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Implement `parseAvatarArgs`, and `purgePool(svc)` which lists and deletes the `synthetic/faces/` and `synthetic/logos/` prefixes and nulls the columns for registry ids. Wire three cases into `main`'s switch in `sim/run.ts`. `--dry-run` prints the count and the estimated spend (`count × $0.011`) and exits without calling the API. Document all three in `sim/README.md`, including that the pool deliberately survives `marketplace-purge`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run sim/` → all sim tests PASS (existing suite must stay green).
Then: `npx tsc -p sim/tsconfig.json` → 0 errors, and `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add sim/avatars/purge.ts sim/avatars/purge.test.ts sim/run.ts sim/cli.ts sim/README.md
git commit -m "feat(sim): avatars-generate/apply/purge commands + docs"
```

---

### Task 6: The live run — FOUNDER-GATED

**Files:** none (operational).

**This task spends real money and writes to prod. Do not start it without explicit founder approval on the day.**

- [ ] **Step 1: Confirm the model.** Query OpenAI's model list; pick the current image model; set `SIM_IMAGE_MODEL`. Confirm it is not `gpt-image-1`.
- [ ] **Step 2: Dry run.** `npx tsx sim/cli.ts avatars-generate --dry-run` — confirm the printed cost estimate matches expectation (~$17).
- [ ] **Step 3: Smoke.** `npx tsx sim/cli.ts avatars-generate --limit 5`. Inspect the 5 images by eye before spending the rest. Confirm each object is > 20 KB.
- [ ] **Step 4: Full pool.** `npx tsx sim/cli.ts avatars-generate --count 1500`. Expect refusals; the manifest records them.
- [ ] **Step 5: Apply.** `npx tsx sim/cli.ts avatars-apply`, then verify on prod:
  ```sql
  select count(*) filter (where cp.avatar_url like '%synthetic/faces/%') as creators_with_face
  from creator_profiles cp join synthetic_users s on s.user_id = cp.user_id;
  ```
  Expect 1,500. Then confirm no remaining 160-byte objects:
  ```sql
  select count(*) from storage.objects
  where bucket_id='profile-assets' and (metadata->>'size')::int < 1000;
  ```
  Expect 0.
- [ ] **Step 6: Verify the UI.** Screenshot Find Creators on desktop **and** mobile; check the console for errors. Confirm real faces render, not broken-image icons.
- [ ] **Step 7: Knowledge sync.** Run the `knowledge-sync` skill: raw session → wiki ingest → `SHIPPED_LOG` → `PROJECT_CONTEXT` §5 → Donny RAG. Record the actual spend.

---

## Self-Review

**Spec coverage:** §4.1 pool layout → Tasks 1, 3; §4.2 generation → Task 3; §4.3 assignment → Task 1, 4; §4.4 application incl. the 24 placeholder repairs and `portfolio_urls` clearing → Task 4; §4.5 cleanup → Task 5; §5 business logos → Task 2; §6 cost/dry-run → Tasks 3, 5, 6; §7 testing → every task; §9 rollback → Task 5.

**Placeholder scan:** Tasks 3, 4 and 5 describe their implementations in prose rather than full code blocks, because each is a straightforward loop over interfaces fully specified in the `Interfaces:` block and pinned by the tests above them. Every type, function name and signature they reference is defined in an earlier task. Task 2 names `sim/avatars/glyphs.ts` with its exact data shape and an example row.

**Type consistency:** `poolIndex`/`facePath`/`logoPath`/`poolPublicUrl` (Task 1) are used with identical signatures in Tasks 2 and 4. `Palette` is defined in `monogram.ts` and imported by `png.ts`. `Manifest` is defined once in Task 3 and referenced in Task 6's resume behaviour.
