// Writes the content layer: creator portfolios and DragonFeed posts, both pointing at shared
// work-pool objects. Service-role, because the 1,484 depth creators never authenticate.
//
// See docs/superpowers/specs/2026-07-27-synthetic-content-pass-design.md §4.3-§4.4.
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolPublicUrl } from "../avatars/pool";
import { chunkIds, readRegistryIds } from "../avatars/apply";
import { portfolioIndices } from "./portfolio";
import type { FeedRow } from "./feed";

export interface PortfolioPlan {
  userId: string;
  urls: string[];
}

/** Pure. Empty pool means empty plan — never write an empty portfolio over a real one. */
export function planPortfolios(
  creatorIds: string[],
  workPaths: string[],
  supabaseUrl: string,
): PortfolioPlan[] {
  if (workPaths.length === 0) return [];
  return creatorIds.map((userId) => ({
    userId,
    urls: portfolioIndices(userId, workPaths.length).map((i) =>
      poolPublicUrl(supabaseUrl, workPaths[i]),
    ),
  }));
}

/** Every synthetic creator id, paged + ordered via the shared registry reader. */
export async function readSyntheticCreatorIds(svc: SupabaseClient): Promise<string[]> {
  const registry = new Set(await readRegistryIds(svc));
  const ids: string[] = [];
  for (const batch of chunkIds([...registry])) {
    const { data, error } = await svc.from("creator_profiles").select("user_id").in("user_id", batch);
    if (error) throw new Error(`readSyntheticCreatorIds: ${error.message}`);
    for (const r of data ?? []) ids.push(r.user_id);
  }
  return ids;
}

/** Every synthetic org id — the NOT NULL `target_org_id` a feed post needs. */
export async function readSyntheticOrgIds(svc: SupabaseClient): Promise<string[]> {
  const registry = new Set(await readRegistryIds(svc));
  const ids = new Set<string>();
  for (const batch of chunkIds([...registry])) {
    const { data, error } = await svc
      .from("org_members")
      .select("org_id, user_id")
      .eq("role", "owner")
      .in("user_id", batch);
    if (error) throw new Error(`readSyntheticOrgIds: ${error.message}`);
    for (const r of data ?? []) ids.add(r.org_id);
  }
  return [...ids];
}

export async function applyPortfolios(
  svc: SupabaseClient,
  plans: PortfolioPlan[],
): Promise<{ creators: number }> {
  let creators = 0;
  for (const plan of plans) {
    const { error } = await svc
      .from("creator_profiles")
      .update({ portfolio_urls: plan.urls })
      .eq("user_id", plan.userId);
    if (error) throw new Error(`applyPortfolios ${plan.userId}: ${error.message}`);
    creators++;
  }
  return { creators };
}

/**
 * Upserts in batches on the deterministic `id`, so re-running `content-apply` — after a partial
 * failure, or because an operator ran it twice — rewrites the same rows instead of appending
 * another full set of posts. A plain insert would grow the feed by ~500 duplicates per run.
 * The rows carry no boost fields, so the column defaults keep them off the landing hero.
 */
export async function insertFeedRows(svc: SupabaseClient, rows: FeedRow[]): Promise<{ posts: number }> {
  let posts = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await svc.from("dragonshare_posts").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`insertFeedRows batch ${i / BATCH + 1}: ${error.message}`);
    posts += batch.length;
  }
  return { posts };
}
