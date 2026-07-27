// Points synthetic profiles at pool objects. Runs as SERVICE-ROLE: the depth lane (1,484 of the
// 1,500 creators) never authenticates, so the seeder's existing as-the-bot upload path cannot
// reach it. See docs/superpowers/specs/2026-07-26-synthetic-avatar-pool-design.md §4.4.
import type { SupabaseClient } from "@supabase/supabase-js";
import { logoObjectPath, poolIndex, poolPublicUrl } from "./pool";
import { initials, paletteFor, type Palette } from "./monogram";

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
  /** Creators only — carried so the placeholder entry can be removed WITHOUT touching real media. */
  portfolioUrls?: string[] | null;
  /** The value being replaced — the placeholder object path is derived from it, not guessed. */
  currentAvatarUrl?: string | null;
}

/**
 * Removes only the old per-user placeholder (`…/<uid>/avatar.jpg`, the 160-byte 8x8 JPEG the
 * seeder fell back to) from a creator's portfolio. Returns null when nothing changes.
 *
 * Blanket-clearing the array would delete real portfolio media this command never created —
 * marketplace seeding or later synthetic content. Apply must only undo what the placeholder put
 * there. (Codex second review round 4, 2026-07-26.)
 */
export function stripPlaceholderPortfolio(urls: string[] | null | undefined, userId: string): string[] | null {
  if (!urls || urls.length === 0) return null;
  const kept = urls.filter((u) => placeholderObjectPath(u, userId) === null);
  return kept.length === urls.length ? null : kept;
}

/**
 * If `url` is this user's per-user placeholder object, returns its storage path — otherwise null.
 *
 * The extension is taken FROM THE URL, never assumed: the seeder names the object
 * `<uid>/avatar${asset.ext}`, so a non-JPEG asset in `sim/marketplace/assets/` produces
 * `avatar.png`. Deleting only `avatar.jpg` would strip such an entry from the portfolio while
 * orphaning the object in storage. (Codex second review round 6, 2026-07-26.)
 */
export function placeholderObjectPath(url: string, userId: string): string | null {
  const m = url.match(/\/object\/public\/profile-assets\/(.+)$/);
  if (!m) return null;
  const objectPath = m[1].split("?")[0];
  return /^[^/]+\/avatar\.[A-Za-z0-9]+$/.test(objectPath) && objectPath.startsWith(`${userId}/`)
    ? objectPath
    : null;
}

export interface Assignment {
  userId: string;
  kind: ProfileKind;
  url: string;
  /** Businesses only — what to rasterise, and where. */
  monogram?: string;
  palette?: Palette;
  objectPath?: string;
  /** Creators only — the current portfolio, so apply can strip just the placeholder entry. */
  portfolioUrls?: string[] | null;
  /** The URL being replaced, so its storage object is located rather than guessed. */
  currentAvatarUrl?: string | null;
}

export interface PoolInputs {
  /**
   * The ACTUAL face object paths present in storage — not a count. A count is unsafe on two
   * counts: a refusal leaves a gap (index 7 may not exist), and a single `list()` page caps at
   * 1000, so a 1,500-face pool would silently strand a third of the paid images.
   * (Codex second review, 2026-07-26.)
   */
  facePaths: string[];
}

export function chunkIds(ids: string[], size: number = CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Pure.
 *
 * Creators: a FACE is chosen by hashing the user id into the list of real pool objects — never
 * from the name, city, or any other attribute (spec §4.3).
 *
 * Businesses: a LOGO is content-addressed from the monogram + palette. Here the name legitimately
 * determines the image, because the image IS the name's initials — the blind-assignment rule
 * exists to stop us inferring a person's appearance, which does not apply to a lettermark.
 */
export function planAssignments(rows: ProfileRow[], pools: PoolInputs, supabaseUrl: string): Assignment[] {
  if (pools.facePaths.length === 0) throw new Error("planAssignments: the face pool is empty");

  return rows.map((row) => {
    if (row.kind === "creator") {
      const path = pools.facePaths[poolIndex(row.userId, pools.facePaths.length)];
      return {
        userId: row.userId,
        kind: row.kind,
        url: poolPublicUrl(supabaseUrl, path),
        portfolioUrls: row.portfolioUrls ?? null,
        currentAvatarUrl: row.currentAvatarUrl ?? null,
      };
    }
    const monogram = initials(row.name ?? "");
    const palette = paletteFor(row.userId);
    const objectPath = logoObjectPath(monogram, palette.bg.join(","));
    return {
      userId: row.userId,
      kind: row.kind,
      url: poolPublicUrl(supabaseUrl, objectPath),
      monogram,
      palette,
      objectPath,
      currentAvatarUrl: row.currentAvatarUrl ?? null,
    };
  });
}

/** PostgREST caps an unbounded select at 1,000 rows — MEASURED against this project, not assumed:
 *  `GET /rest/v1/public_creator_profiles?select=user_id` returns exactly 1000. The registry holds
 *  2,025 rows, so an unpaged read would silently assign images to half the cohort and leave the
 *  rest blank — the same silent-truncation shape as the `.in()` header overflow.
 *  (Codex second review round 2, 2026-07-26.) */
export const PAGE = 1000;

/** Pages a range-based reader until a short page comes back. Injected reader keeps this testable. */
export async function paginate<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = PAGE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

/** Every synthetic user id, paged. This is the anchor that makes a real user unreachable. */
export async function readRegistryIds(svc: SupabaseClient): Promise<string[]> {
  return paginate(async (from, to) => {
    const { data, error } = await svc.from("synthetic_users").select("user_id").range(from, to);
    if (error) throw new Error(`readRegistryIds: ${error.message}`);
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  });
}

/**
 * Reads the target profiles ANCHORED ON THE REGISTRY — the id list comes from `synthetic_users`,
 * so a real user is unreachable by construction rather than by filter correctness.
 */
export async function readSyntheticProfiles(svc: SupabaseClient): Promise<ProfileRow[]> {
  const ids = await readRegistryIds(svc);

  const rows: ProfileRow[] = [];
  for (const batch of chunkIds(ids)) {
    const { data: creators, error: cErr } = await svc
      .from("creator_profiles")
      .select("user_id, portfolio_urls, avatar_url")
      .in("user_id", batch);
    if (cErr) throw new Error(`readSyntheticProfiles creators: ${cErr.message}`);
    for (const c of creators ?? []) {
      rows.push({
        userId: c.user_id,
        kind: "creator",
        name: null,
        portfolioUrls: c.portfolio_urls ?? null,
        currentAvatarUrl: c.avatar_url ?? null,
      });
    }

    const { data: businesses, error: bErr } = await svc
      .from("business_profiles")
      .select("user_id, business_name, logo_url")
      .in("user_id", batch);
    if (bErr) throw new Error(`readSyntheticProfiles businesses: ${bErr.message}`);
    for (const b of businesses ?? []) {
      rows.push({
        userId: b.user_id,
        kind: "business",
        name: b.business_name ?? null,
        currentAvatarUrl: b.logo_url ?? null,
      });
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
      // Only strip the placeholder entry; real portfolio media is left alone.
      const cleaned = stripPlaceholderPortfolio(a.portfolioUrls, a.userId);
      const patch: Record<string, unknown> = { avatar_url: a.url };
      if (cleaned !== null) {
        patch.portfolio_urls = cleaned;
        result.placeholdersCleared++;
      }
      const { error } = await svc.from("creator_profiles").update(patch).eq("user_id", a.userId);
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

  // Delete the per-user placeholder objects the old seeder created. Paths are derived from the URLs
  // that actually referenced them (any extension), never guessed. Best-effort per object: a missing
  // object is not an error, and a storage hiccup must not undo the DB work above.
  const paths = [
    ...new Set(
      assignments.flatMap((a) =>
        [a.currentAvatarUrl ?? "", ...(a.portfolioUrls ?? [])]
          .map((u) => placeholderObjectPath(u, a.userId))
          .filter((p): p is string => p !== null),
      ),
    ),
  ];
  if (paths.length === 0) return result;

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
