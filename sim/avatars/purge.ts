// Explicit pool cleanup + shared arg parsing for the three `avatars-*` commands.
//
// This is DELIBERATELY NOT wired into purge_synthetic_marketplace_cohort(): the pool is a durable,
// reusable asset library, not user data. A cohort purge leaves it in place so re-seeding costs $0.
// Removing it is a separate, explicit act. See the spec §4.5.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds } from "./apply";

export const BUCKET = "profile-assets";
export const POOL_PREFIXES = ["synthetic/faces", "synthetic/logos"] as const;

/** Low-quality 1024x1024 per-image rate. Only used for the --dry-run estimate. */
export const USD_PER_IMAGE = 0.011;

export interface AvatarArgs {
  count: number;
  dryRun: boolean;
  limit: number | null;
}

export function parseAvatarArgs(argv: string[]): AvatarArgs {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 ? argv[i + 1] : undefined;
  };

  const rawCount = flag("count");
  let count = 1500;
  if (rawCount !== undefined) {
    const parsed = Number(rawCount);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`--count must be a positive integer, got "${rawCount}"`);
    }
    count = parsed;
  }

  const rawLimit = flag("limit");
  let limit: number | null = null;
  if (rawLimit !== undefined) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`--limit must be a positive integer, got "${rawLimit}"`);
    }
    limit = parsed;
  }

  return { count, dryRun: argv.includes("--dry-run"), limit };
}

export function estimateSpendUsd(count: number): number {
  return count * USD_PER_IMAGE;
}

export interface PurgeResult {
  objectsDeleted: number;
  creatorsCleared: number;
  businessesCleared: number;
}

/**
 * Deletes the pool objects and nulls the columns that pointed at them, registry-scoped.
 * Storage removal is listed-then-removed in batches — `remove()` takes explicit paths, so a
 * prefix is enumerated first (the same discipline PR #340 had to learn for the marketplace
 * teardown, which silently left its objects behind).
 */
export async function purgePool(svc: SupabaseClient): Promise<PurgeResult> {
  const result: PurgeResult = { objectsDeleted: 0, creatorsCleared: 0, businessesCleared: 0 };

  for (const prefix of POOL_PREFIXES) {
    // list() is capped per call; page until a short page comes back.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await svc.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`purgePool list ${prefix}: ${error.message}`);
      const names = (data ?? []).map((o: { name: string }) => `${prefix}/${o.name}`);
      if (names.length === 0) break;

      for (const batch of chunkIds(names)) {
        const { data: removed, error: rmErr } = await svc.storage.from(BUCKET).remove(batch);
        if (rmErr) throw new Error(`purgePool remove ${prefix}: ${rmErr.message}`);
        result.objectsDeleted += removed?.length ?? 0;
      }
      if (names.length < 1000) break;
    }
  }

  const { data: reg, error: regErr } = await svc.from("synthetic_users").select("user_id");
  if (regErr) throw new Error(`purgePool registry: ${regErr.message}`);
  const ids = (reg ?? []).map((r: { user_id: string }) => r.user_id);

  for (const batch of chunkIds(ids)) {
    const { data: c, error: cErr } = await svc
      .from("creator_profiles")
      .update({ avatar_url: null })
      .in("user_id", batch)
      .select("user_id");
    if (cErr) throw new Error(`purgePool creators: ${cErr.message}`);
    result.creatorsCleared += c?.length ?? 0;

    const { data: b, error: bErr } = await svc
      .from("business_profiles")
      .update({ logo_url: null })
      .in("user_id", batch)
      .select("user_id");
    if (bErr) throw new Error(`purgePool businesses: ${bErr.message}`);
    result.businessesCleared += b?.length ?? 0;

    const { error: pErr } = await svc.from("profiles").update({ avatar_url: null }).in("id", batch);
    if (pErr) throw new Error(`purgePool profiles: ${pErr.message}`);
  }

  return result;
}
