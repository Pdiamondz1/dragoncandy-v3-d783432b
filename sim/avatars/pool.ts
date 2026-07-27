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

export const facePath = (i: number): string => `synthetic/faces/${pad4(i)}.jpg`;
export const logoPath = (i: number): string => `synthetic/logos/${pad4(i)}.png`;

export function poolPublicUrl(supabaseUrl: string, objectPath: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
