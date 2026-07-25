// The persistent MARKETPLACE cohort (botmk_*). Distinct namespace from the live crew cohort
// (bot0##), the load cohort (botla…), and the depth pool (botseed_…) so every existing selector
// stays disjoint. Reuses the deterministic name pools + role mapping from ../personas; only the
// email scheme is new (role-tagged: botmk_b_<seed>_<i> business, botmk_c_<seed>_<i> creator).
import { generateCohort, type Persona, type Role } from "../personas";

const SYNTHETIC_DOMAIN = "@synthetic.dragoncandy.test";
export const MARKETPLACE_EMAIL_PREFIX = "botmk_";

/** True for a persistent marketplace-cohort email. Used by the session-capable readers to keep the
 *  persistent cohort OUT of the daily crew tick + single-runner load (mirrors isDepthPoolEmail). */
export function isMarketplaceEmail(email: string): boolean {
  return email.startsWith(MARKETPLACE_EMAIL_PREFIX);
}

/** botmk_b_<seed>_<i+1>@… (business) or botmk_c_<seed>_<i+1>@… (creator). 1-indexed like bot0##. */
export function marketplaceEmail(seed: number, role: Role, i: number): string {
  const tag = role === "business_client" ? "b" : "c";
  return `${MARKETPLACE_EMAIL_PREFIX}${tag}_${seed}_${i + 1}${SYNTHETIC_DOMAIN}`;
}

/**
 * Deterministic marketplace cohort: `businesses` restaurants + `creators` creators. Reuses
 * generateCohort's name/persona assignment per role-group (so display names stay curated + on-brand),
 * then remaps every email into the role-tagged botmk_ namespace. Businesses and creators are generated
 * as separate 100%-split groups so their indices — and thus emails — never collide.
 */
export function generateMarketplaceCohort(
  businesses: number,
  creators: number,
  seed: number,
  cohort = "marketplace",
): Persona[] {
  const bizPersonas = generateCohort(businesses, { creators: 0 }, seed, cohort).map((p, i) => ({
    ...p,
    email: marketplaceEmail(seed, "business_client", i),
  }));
  const creatorPersonas = generateCohort(creators, { creators: 1 }, seed + 1, cohort).map((p, i) => ({
    ...p,
    email: marketplaceEmail(seed, "content_creator", i),
  }));
  return [...bizPersonas, ...creatorPersonas];
}
