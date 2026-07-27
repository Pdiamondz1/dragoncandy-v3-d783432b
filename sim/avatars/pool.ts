// Deterministic assignment of shared pool images to synthetic profiles.
//
// The pool is a DURABLE, SHARED asset library: faces/logos are uploaded once under
// `synthetic/…` and every profile's avatar_url points straight at a pool object. No per-user
// copy is ever made, which is what makes teardown safe by construction (there is nothing
// per-user to orphan — the URL dies with the row) and makes a re-seed after a cohort purge
// cost $0. See docs/superpowers/specs/2026-07-26-synthetic-avatar-pool-design.md §4.1.
//
// Assignment inputs are a user id and a pool size — NEVER a name, city, or any other profile
// attribute. Inferring someone's likely appearance from a surname is unreliable and wrong; the
// pool is demographically varied and the mapping is blind (§4.3).

const BUCKET = "profile-assets";

/** FNV-1a 32-bit. Stable across runs, Node versions and platforms — no hashing dependency and
 *  no seed to drift, so a re-run produces byte-identical assignments (idempotency). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function poolIndex(userId: string, poolSize: number): number {
  if (!Number.isInteger(poolSize) || poolSize <= 0) {
    throw new Error(`poolSize must be a positive integer, got ${poolSize}`);
  }
  return fnv1a(userId) % poolSize;
}

const pad4 = (i: number): string => String(i).padStart(4, "0");

/** The extension follows the ACTUAL bytes (see sniffImageType) — a model may return PNG or WEBP. */
export const facePath = (i: number, ext: string = "jpg"): string => `synthetic/faces/${pad4(i)}.${ext}`;

/**
 * Logo objects are CONTENT-ADDRESSED, not slot-indexed: the path is derived from what is drawn on
 * the tile (monogram text + palette), so two businesses can never be handed the same object while
 * expecting different initials.
 *
 * A slot-indexed path (`logos/0007.png` chosen by an id hash) collides — with ~509 businesses over
 * ~512 slots, collisions are near-certain, and the first business to render a slot would win while
 * every colliding business silently displayed ITS initials. Content addressing makes a collision
 * mean "identical image", which is correct and dedupes for free. (Codex second review, 2026-07-26.)
 */
export function logoObjectPath(monogram: string, paletteKey: string): string {
  return `synthetic/logos/${fnv1a(`${monogram}|${paletteKey}`).toString(16).padStart(8, "0")}.png`;
}

export function poolPublicUrl(supabaseUrl: string, objectPath: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
