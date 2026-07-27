// Monogram derivation for synthetic BUSINESS logos. A photoreal human face is the wrong image
// for a restaurant, so businesses get a brand-palette monogram mark instead (spec §5).
import { poolIndex } from "./pool";

export type Palette = { bg: [number, number, number]; fg: [number, number, number] };

// dc-teal-btn / dc-pink-accent-btn / dc-teal — brand fills that carry legible text
// (docs/DESIGN_SYSTEM.md). dc-teal is light, so it takes the dark dc-dark foreground.
const PALETTES: Palette[] = [
  { bg: [15, 118, 110], fg: [255, 255, 255] },
  { bg: [219, 39, 119], fg: [255, 255, 255] },
  { bg: [77, 217, 192], fg: [26, 26, 42] },
];

/** Articles and conjunctions that shouldn't win an initial ("The Taco Truck" -> TT, not TT... TT). */
const SKIP = new Set(["THE", "A", "AN", "OF", "AND", "EL", "LA", "LOS", "LAS"]);

export function initials(businessName: string): string {
  // Apostrophes are REMOVED rather than turned into a space: "Joe's Pizza" must read as two
  // words (Joes/Pizza -> JP), not three (Joe/s/Pizza -> JS). Every other non-alphanumeric
  // becomes a separator, so "Taco-Truck" splits.
  const cleaned = businessName.replace(/['’`]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length > 0 && /\p{L}/u.test(w) && !SKIP.has(w.toUpperCase()));

  if (words.length === 0) return "DC"; // a name with no letters at all still gets a mark
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Deterministic palette choice — same id, same colours on every run (idempotent re-seed). */
export function paletteFor(userId: string): Palette {
  return PALETTES[poolIndex(userId, PALETTES.length)];
}
