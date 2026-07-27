// Explicit pool cleanup + shared arg parsing for the three `avatars-*` commands.
//
// This is DELIBERATELY NOT wired into purge_synthetic_marketplace_cohort(): the pool is a durable,
// reusable asset library, not user data. A cohort purge leaves it in place so re-seeding costs $0.
// Removing it is a separate, explicit act. See the spec §4.5.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds, readRegistryIds } from "./apply";

export const BUCKET = "profile-assets";
export const FACES_PREFIX = "synthetic/faces";
export const LOGOS_PREFIX = "synthetic/logos";
export const POOL_PREFIXES = [FACES_PREFIX, LOGOS_PREFIX] as const;

/** Low-quality 1024x1024 per-image rate. Only used for the --dry-run estimate. */
export const USD_PER_IMAGE = 0.011;

export interface AvatarArgs {
  count: number;
  dryRun: boolean;
  limit: number | null;
}

/**
 * Reads a numeric flag, distinguishing ABSENT from PRESENT-BUT-EMPTY.
 *
 * `--count` as the final argument (or followed by another flag) must not fall back to the default:
 * on `avatars-generate` that turns a typo into the full 1,500-image PAID run. A flag the operator
 * typed is a flag they meant to set. (Codex second review round 8, 2026-07-26.)
 */
function numericFlag(argv: string[], name: string, fallback: number | null): number | null {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;

  const raw = argv[i + 1];
  if (raw === undefined || raw.startsWith("--")) {
    throw new Error(`--${name} was given without a value`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

export function parseAvatarArgs(argv: string[]): AvatarArgs {
  return {
    count: numericFlag(argv, "count", 1500) as number,
    limit: numericFlag(argv, "limit", null),
    dryRun: argv.includes("--dry-run"),
  };
}

export function estimateSpendUsd(count: number): number {
  return count * USD_PER_IMAGE;
}

/** Storage `list()` caps at 1000 rows per call, so every consumer must page. Returns full paths. */
export async function listPrefix(svc: SupabaseClient, prefix: string): Promise<string[]> {
  const names: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await svc.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`listPrefix ${prefix}: ${error.message}`);
    const page = data ?? [];
    for (const o of page) names.push(`${prefix}/${(o as { name: string }).name}`);
    if (page.length < PAGE) return names;
  }
}

export interface PurgeResult {
  objectsDeleted: number;
  creatorsCleared: number;
  businessesCleared: number;
  /** Rows the `sync_brand_logo_from_business_profile` trigger propagated a pool URL into. */
  orgsCleared: number;
  orgUnitsCleared: number;
}

/**
 * Deletes the pool objects and nulls the columns that pointed at them, registry-scoped.
 * Storage removal is listed-then-removed in batches — `remove()` takes explicit paths, so a
 * prefix is enumerated first (the same discipline PR #340 had to learn for the marketplace
 * teardown, which silently left its objects behind).
 */
export async function purgePool(svc: SupabaseClient): Promise<PurgeResult> {
  const result: PurgeResult = {
    objectsDeleted: 0,
    creatorsCleared: 0,
    businessesCleared: 0,
    orgsCleared: 0,
    orgUnitsCleared: 0,
  };

  for (const prefix of POOL_PREFIXES) {
    // Enumerate EVERY page before deleting anything. Deleting as you advance the offset skips
    // objects: the listing shortens under you, so `offset: 1000` on the second pass lands past the
    // end and leaves ~500 of a 1,500-face pool behind. (Codex second review, 2026-07-26.)
    const names = await listPrefix(svc, prefix);
    for (const batch of chunkIds(names)) {
      const { data: removed, error: rmErr } = await svc.storage.from(BUCKET).remove(batch);
      if (rmErr) throw new Error(`purgePool remove ${prefix}: ${rmErr.message}`);
      result.objectsDeleted += removed?.length ?? 0;
    }
  }

  // Paged for the same reason apply is: an unbounded select stops at 1,000 rows, which would
  // delete the whole pool but leave ~1,000 profiles pointing at objects that no longer exist.
  const ids = await readRegistryIds(svc);

  // Only clear values that actually POINT AT THE POOL. Nulling every synthetic avatar would
  // clobber images this command never created — the marketplace seeder's own uploads, a partial
  // apply, or anything a future seeder sets. Rollback must undo exactly what it did.
  // (Codex second review round 3, 2026-07-26.)
  for (const batch of chunkIds(ids)) {
    const { data: c, error: cErr } = await svc
      .from("creator_profiles")
      .update({ avatar_url: null })
      .in("user_id", batch)
      .like("avatar_url", `%${FACES_PREFIX}%`)
      .select("user_id");
    if (cErr) throw new Error(`purgePool creators: ${cErr.message}`);
    result.creatorsCleared += c?.length ?? 0;

    const { data: b, error: bErr } = await svc
      .from("business_profiles")
      .update({ logo_url: null })
      .in("user_id", batch)
      .like("logo_url", `%${LOGOS_PREFIX}%`)
      .select("user_id");
    if (bErr) throw new Error(`purgePool businesses: ${bErr.message}`);
    result.businessesCleared += b?.length ?? 0;

    // profiles.avatar_url carries either a face (creators) or a logo (businesses).
    for (const prefix of [FACES_PREFIX, LOGOS_PREFIX]) {
      const { error: pErr } = await svc
        .from("profiles")
        .update({ avatar_url: null })
        .in("id", batch)
        .like("avatar_url", `%${prefix}%`);
      if (pErr) throw new Error(`purgePool profiles: ${pErr.message}`);
    }
  }

  // `business_profiles.logo_url` does not live alone: the SECURITY DEFINER trigger
  // `sync_brand_logo_from_business_profile` copies it into `organizations.logo_url` and
  // `org_units.logo_url` for the owner's org. Nulling the source does NOT undo that — the trigger
  // returns early when the new value is NULL — so those rows would keep pointing at objects this
  // command just deleted. Verified against the live function definition on prod.
  // (Codex second review round 11, 2026-07-26.)
  //
  // The `like` on the pool prefix is the scope: only this pool's URLs can match, so no real
  // organisation's logo is reachable.
  const { data: orgs, error: oErr } = await svc
    .from("organizations")
    .update({ logo_url: null })
    .like("logo_url", `%${LOGOS_PREFIX}%`)
    .select("id");
  if (oErr) throw new Error(`purgePool organizations: ${oErr.message}`);
  result.orgsCleared = orgs?.length ?? 0;

  const { data: units, error: uErr } = await svc
    .from("org_units")
    .update({ logo_url: null })
    .like("logo_url", `%${LOGOS_PREFIX}%`)
    .select("id");
  if (uErr) throw new Error(`purgePool org_units: ${uErr.message}`);
  result.orgUnitsCleared = units?.length ?? 0;

  return result;
}
