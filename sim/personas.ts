// Deterministic persona generation for the Synthetic Weight Engine.
//
// No faker: curated, on-brand name pools + a seeded PRNG (mulberry32) so a given
// (n, split, seed) always yields the identical cohort. Determinism is load-bearing —
// it makes cohorts reproducible, the tests exact, and re-runs idempotent.
//
// Emails are the source-of-truth synthetic tag: every persona is
// bot<NNN>@synthetic.dragoncandy.test, the domain the Phase 0 spine keys on
// (handle_new_user auto-registers these into public.synthetic_users on mint).

export type Role = "business_client" | "content_creator";

export type PersonaKey =
  | "hoboken_restaurant"
  | "luxury_lifestyle_creator"
  | "nyc_genz_creator";

export interface Persona {
  /** bot<NNN>@synthetic.dragoncandy.test — the synthetic source-of-truth tag. */
  email: string;
  /** Display name → profiles.full_name via user_metadata.full_name at mint. */
  fullName: string;
  /** business_client | content_creator → user_metadata.role (the field handle_new_user reads). */
  role: Role;
  personaKey: PersonaKey;
  /** Cohort label → synthetic_users.cohort, for the /internal/simulation SHOW view. */
  cohort: string;
}

export interface CohortSplit {
  /** Fraction of the cohort that are creators (0..1); the remainder are businesses. */
  creators: number;
}

/** business_client for restaurants; content_creator for both creator archetypes. */
export function personaRole(key: PersonaKey): Role {
  return key === "hoboken_restaurant" ? "business_client" : "content_creator";
}

// Curated pools. Sized comfortably larger than the max draws per archetype so a
// single cohort rarely repeats a display name (harmless if it does — emails are unique).
const NAME_POOLS: Record<PersonaKey, readonly string[]> = {
  hoboken_restaurant: [
    "Carmine's Hoboken",
    "Pier Thirteen Tavern",
    "Washington Street Pizza",
    "Elysian Cafe",
    "Grimaldi's on First",
    "Bwe Kafe",
    "Anthony David's",
    "Amanda's Restaurant",
    "The Brass Rail",
    "Halifax Hoboken",
    "Antique Bar & Bakery",
    "Leo's Grandevous",
    "Court Street Kitchen",
    "Hoboken Hot House",
  ],
  luxury_lifestyle_creator: [
    "Isabella Moreau",
    "Sofia Laurent",
    "Valentina Rossi",
    "Camille Dubois",
    "Aria Castellano",
    "Bianca Fontaine",
    "Elena Marchetti",
    "Josephine Vale",
    "Natalia Cruz",
    "Gabriella Santos",
    "Vivienne Laroche",
    "Anaïs Bellini",
  ],
  nyc_genz_creator: [
    "Zoe Kim",
    "Mateo Rivera",
    "Ava Chen",
    "Liam Park",
    "Maya Patel",
    "Noah Brooks",
    "Lily Nguyen",
    "Diego Torres",
    "Chloe Adams",
    "Ethan Wu",
    "Priya Shah",
    "Jayden Reyes",
  ],
};

/** mulberry32 — a tiny, fast, seedable PRNG. Same seed → same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a deterministic cohort of `n` personas at the given creator/business split.
 * Businesses are all Hoboken restaurants; creators alternate luxury / gen-z (balanced).
 * Emails are index-based (bot001…botNNN) so the cohort maps 1:1 to a single mint.
 */
export function generateCohort(
  n: number,
  split: CohortSplit,
  seed: number,
  cohort = "phase1",
): Persona[] {
  const rng = mulberry32(seed);
  const creatorCount = Math.round(n * split.creators);
  const businessCount = n - creatorCount;

  const keys: PersonaKey[] = [];
  for (let i = 0; i < businessCount; i++) keys.push("hoboken_restaurant");
  for (let i = 0; i < creatorCount; i++) {
    keys.push(i % 2 === 0 ? "luxury_lifestyle_creator" : "nyc_genz_creator");
  }

  return keys.map((key, i) => {
    const pool = NAME_POOLS[key];
    const fullName = pool[Math.floor(rng() * pool.length)];
    return {
      email: `bot${String(i + 1).padStart(3, "0")}@synthetic.dragoncandy.test`,
      fullName,
      role: personaRole(key),
      personaKey: key,
      cohort,
    };
  });
}
