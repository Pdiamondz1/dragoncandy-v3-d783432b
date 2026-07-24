// Bulk-seed planning + the ACTIVE-cohort generator for the `bulk-seed` subcommand.
//
// `bulk-seed` splits a total synthetic population of N into two lanes:
//   • a DEPTH pool   — bulk-inserted by the service-role seed_synthetic_cohort RPC; these users
//     NEVER authenticate (they exist only to make listings/browse look populated).
//   • an ACTIVE cohort — minted one-by-one via mintBot, so each has a real, session-capable auth
//     user the behavior engine can act as over its own JWT.
//
// planSeed decides the split; generateActiveCohort builds the active personas; assertActiveNamespaceFree
// is the pre-flight guard. The run.ts handler (cmdBulkSeed) orchestrates the RPC + the mint loop.
//
// EMAIL-NAMESPACE COLLISION (load-bearing): generateCohort (personas.ts) emits index-based emails
// bot001…botNNN@synthetic.dragoncandy.test REGARDLESS of the cohort label — and the live daily
// workflow already minted bot001…bot025. Reusing that scheme would duplicate-email on createUser and
// trip the fail-loud. So the active cohort gets a DISTINCT namespace —
// botla<seed>_<i>@synthetic.dragoncandy.test — still under @synthetic.dragoncandy.test so
// assertSyntheticEmail / handle_new_user's LIKE / the synthetic_users auto-tag all still fire. (The
// depth pool has its own third namespace, botseed_<cohort>_<i>, minted inside the RPC.) Keeping this
// remap here leaves personas.ts untouched, matching the plan's "Reuse (no change)" file structure.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCohort, type Persona, type CohortSplit } from "./personas";

const SYNTHETIC_DOMAIN = "@synthetic.dragoncandy.test";

export interface SeedPlan {
  /** Users bulk-seeded via the RPC (depth pool; never authenticate). */
  depthCount: number;
  /** Users minted individually via mintBot (session-capable active cohort). */
  activeCount: number;
}

/**
 * Split a total population `n` into an ACTIVE cohort (capped at `activeMax`) and a DEPTH pool (the
 * remainder). Semantics: `activeCount = min(activeMax, n)` and `depthCount = n - activeCount` — the
 * active cohort is drawn from the same total, and depth is everything left over. Both are floored at
 * 0 (and inputs floored to ints), so a nonsensical/negative input can never yield a negative count
 * or a fractional loop bound.
 */
export function planSeed(n: number, activeMax: number): SeedPlan {
  const total = Math.max(0, Math.floor(n));
  const cap = Math.max(0, Math.floor(activeMax));
  const activeCount = Math.min(cap, total);
  const depthCount = total - activeCount;
  return { depthCount, activeCount };
}

/** The distinct active-cohort email for 0-based index `i` at `seed`: botla<seed>_<i+1>@synthetic… */
export function activeEmail(seed: number, i: number): string {
  return `botla${seed}_${i + 1}${SYNTHETIC_DOMAIN}`;
}

/** Email prefix minted by the depth-pool RPC (seed_synthetic_cohort): botseed_<cohort>_<i>@… .
 *  Depth-pool users are DB-only weight to make listings look populated — they NEVER authenticate. */
export const DEPTH_POOL_EMAIL_PREFIX = "botseed_";

/**
 * True for a depth-pool email (bulk-inserted, NOT session-capable). The live daily cohort (bot0##)
 * and the active load cohort (botla…) are session-capable and do NOT match — the `load` driver uses
 * this to drive traffic only through bots that can actually hold a JWT, never the inert depth pool
 * (which would otherwise fire one magiclink+verify per depth user and trip the per-IP auth 429 wall).
 */
export function isDepthPoolEmail(email: string): boolean {
  return email.startsWith(DEPTH_POOL_EMAIL_PREFIX);
}

/**
 * Build the session-capable ACTIVE cohort. Reuses generateCohort's deterministic role/name/personaKey
 * assignment, then REMAPS each email into the distinct botla<seed>_<i> namespace so it can never
 * collide with the live bot### cohort. Only the email changes; role/persona/cohort are unchanged.
 */
export function generateActiveCohort(
  activeCount: number,
  split: CohortSplit,
  seed: number,
  cohort: string,
): Persona[] {
  return generateCohort(activeCount, split, seed, cohort).map((p, i) => ({
    ...p,
    email: activeEmail(seed, i),
  }));
}

/**
 * Pre-flight guard: FAIL if any of the active cohort's emails already exist on prod. bulk-seed is a
 * one-shot (purge before re-seeding) — a present namespace means a prior run's rows are still live and
 * the mint loop would otherwise duplicate-email fail-loud mid-way, half-seeded. Uses profiles.email
 * (handle_new_user mirrors auth.users.email into profiles for every synthetic signup). Service-role
 * read; the empty cohort short-circuits (no query).
 */
export async function assertActiveNamespaceFree(svc: SupabaseClient, active: Persona[]): Promise<void> {
  if (active.length === 0) return;
  const emails = active.map((p) => p.email);
  const { data, error } = await svc.from("profiles").select("email").in("email", emails);
  if (error) throw new Error(`[bulk-seed] active-namespace pre-flight query failed: ${error.message}`);
  const existing = (data ?? []) as { email: string }[];
  if (existing.length > 0) {
    throw new Error(
      `[bulk-seed] active namespace already present on prod (${existing.length} email(s), e.g. ${existing[0].email}) — purge before re-seeding`,
    );
  }
}
