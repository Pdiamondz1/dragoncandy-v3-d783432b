// Points synthetic profiles at pool objects. Runs as SERVICE-ROLE: the depth lane (1,484 of the
// 1,500 creators) never authenticates, so the seeder's existing as-the-bot upload path cannot
// reach it. See docs/superpowers/specs/2026-07-26-synthetic-avatar-pool-design.md §4.4.
import type { SupabaseClient } from "@supabase/supabase-js";
import { facePath, logoPath, poolIndex, poolPublicUrl } from "./pool";
import { initials } from "./monogram";

/** An unbounded `.in()` serialises every id into the URL, and PostgREST echoes the URI back in the
 *  Content-Location RESPONSE header — past ~400 ids that overflows undici's 16 KB maxHeaderSize and
 *  surfaces as an opaque `TypeError: fetch failed`. 100 leaves ~4x margin.
 *  See docs/wiki/concepts/supabase-in-filter-header-overflow.md. */
export const CHUNK = 100;

export type ProfileKind = "creator" | "business";

export interface ProfileRow {
  userId: string;
  kind: ProfileKind;
  name: string | null;
}

export interface Assignment {
  userId: string;
  kind: ProfileKind;
  url: string;
  /** Businesses only — the text to rasterise onto the logo tile. */
  monogram?: string;
}

export interface PoolSizes {
  faces: number;
  logos: number;
}

export function chunkIds(ids: string[], size: number = CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Pure. The name is used ONLY to derive monogram text — never to pick the pool index. */
export function planAssignments(rows: ProfileRow[], pools: PoolSizes, supabaseUrl: string): Assignment[] {
  return rows.map((row) => {
    if (row.kind === "creator") {
      const path = facePath(poolIndex(row.userId, pools.faces));
      return { userId: row.userId, kind: row.kind, url: poolPublicUrl(supabaseUrl, path) };
    }
    const path = logoPath(poolIndex(row.userId, pools.logos));
    return {
      userId: row.userId,
      kind: row.kind,
      url: poolPublicUrl(supabaseUrl, path),
      monogram: initials(row.name ?? ""),
    };
  });
}

/**
 * Reads the target profiles ANCHORED ON THE REGISTRY — the id list comes from `synthetic_users`,
 * so a real user is unreachable by construction rather than by filter correctness.
 */
export async function readSyntheticProfiles(svc: SupabaseClient): Promise<ProfileRow[]> {
  const { data: reg, error: regErr } = await svc.from("synthetic_users").select("user_id");
  if (regErr) throw new Error(`readSyntheticProfiles registry: ${regErr.message}`);
  const ids = (reg ?? []).map((r: { user_id: string }) => r.user_id);

  const rows: ProfileRow[] = [];
  for (const batch of chunkIds(ids)) {
    const { data: creators, error: cErr } = await svc
      .from("creator_profiles")
      .select("user_id")
      .in("user_id", batch);
    if (cErr) throw new Error(`readSyntheticProfiles creators: ${cErr.message}`);
    for (const c of creators ?? []) rows.push({ userId: c.user_id, kind: "creator", name: null });

    const { data: businesses, error: bErr } = await svc
      .from("business_profiles")
      .select("user_id, business_name")
      .in("user_id", batch);
    if (bErr) throw new Error(`readSyntheticProfiles businesses: ${bErr.message}`);
    for (const b of businesses ?? []) {
      rows.push({ userId: b.user_id, kind: "business", name: b.business_name ?? null });
    }
  }
  return rows;
}

export interface ApplyResult {
  creators: number;
  businesses: number;
  placeholdersCleared: number;
}

/**
 * Writes the role table AND `profiles.avatar_url` together, so messaging and crew surfaces (which
 * read `profiles` first, falling back to the role table) match the browse page.
 *
 * Also repairs the pre-existing placeholders: the ~24 profiles seeded before this pool existed
 * point at a 160-byte 8x8 JPEG at `profile-assets/<uid>/avatar.jpg`, and those creators carry that
 * same object as their entire `portfolio_urls`. The URL is repointed, the array cleared (a
 * "portfolio" holding one 160-byte square is worse than an honest empty state), and the stale
 * object deleted.
 */
export async function applyAssignments(
  svc: SupabaseClient,
  assignments: Assignment[],
): Promise<ApplyResult> {
  const result: ApplyResult = { creators: 0, businesses: 0, placeholdersCleared: 0 };

  for (const a of assignments) {
    if (a.kind === "creator") {
      const { error } = await svc
        .from("creator_profiles")
        .update({ avatar_url: a.url, portfolio_urls: [] })
        .eq("user_id", a.userId);
      if (error) throw new Error(`applyAssignments creator ${a.userId}: ${error.message}`);
      result.creators++;
    } else {
      const { error } = await svc
        .from("business_profiles")
        .update({ logo_url: a.url })
        .eq("user_id", a.userId);
      if (error) throw new Error(`applyAssignments business ${a.userId}: ${error.message}`);
      result.businesses++;
    }

    const { error: pErr } = await svc.from("profiles").update({ avatar_url: a.url }).eq("id", a.userId);
    if (pErr) throw new Error(`applyAssignments profile ${a.userId}: ${pErr.message}`);
  }

  // Delete the per-user placeholder objects the old seeder created. Best-effort per object: a
  // missing object is not an error, and a storage hiccup must not undo the DB work above.
  const paths = assignments.map((a) => `${a.userId}/avatar.jpg`);
  for (const batch of chunkIds(paths)) {
    const { data, error } = await svc.storage.from("profile-assets").remove(batch);
    if (error) {
      console.warn(`[avatars] placeholder cleanup skipped for a batch: ${error.message}`);
      continue;
    }
    result.placeholdersCleared += data?.length ?? 0;
  }

  return result;
}
