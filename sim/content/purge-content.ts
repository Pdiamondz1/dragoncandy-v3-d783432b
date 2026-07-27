// Teardown for the content layer. Removes exactly what this pass wrote and nothing else:
// the work pool, the portfolios that reference it, and the posts that reference it.
//
// Deliberately NOT part of marketplace-purge — the pool is a durable asset library, so a cohort
// purge leaves it in place and a re-seed stays free (same rule as the faces pool).
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds, readRegistryIds } from "../avatars/apply";
import { listPrefix, BUCKET } from "../avatars/purge";

export const WORK_PREFIX = "synthetic/work";

export interface ContentPurgeResult {
  objectsDeleted: number;
  portfoliosCleared: number;
  postsDeleted: number;
}

export async function purgeContent(svc: SupabaseClient): Promise<ContentPurgeResult> {
  const result: ContentPurgeResult = { objectsDeleted: 0, portfoliosCleared: 0, postsDeleted: 0 };

  // Enumerate every page BEFORE deleting — deleting while advancing the offset shortens the
  // listing underneath the cursor and skips objects.
  const names = await listPrefix(svc, WORK_PREFIX);
  for (const batch of chunkIds(names)) {
    const { data, error } = await svc.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`purgeContent remove: ${error.message}`);
    result.objectsDeleted += data?.length ?? 0;
  }

  const ids = await readRegistryIds(svc);

  for (const batch of chunkIds(ids)) {
    // Posts: registry-scoped AND pool-scoped, so a real post — or a synthetic post this pass did
    // not create — is never in the delete set.
    const { data: posts, error: postErr } = await svc
      .from("dragonshare_posts")
      .delete()
      .in("creator_id", batch)
      .like("content_file_path", `%${WORK_PREFIX}/%`)
      .select("id");
    if (postErr) throw new Error(`purgeContent posts: ${postErr.message}`);
    result.postsDeleted += posts?.length ?? 0;

    // Portfolios: `.like` on an array column is not available, so read the current values and
    // write back only the rows that actually reference the pool.
    const { data: creators, error: readErr } = await svc
      .from("creator_profiles")
      .select("user_id, portfolio_urls")
      .in("user_id", batch);
    if (readErr) throw new Error(`purgeContent read portfolios: ${readErr.message}`);

    for (const row of creators ?? []) {
      const urls: string[] = row.portfolio_urls ?? [];
      const kept = urls.filter((u) => !u.includes(`${WORK_PREFIX}/`));
      if (kept.length === urls.length) continue; // nothing of ours in there
      const { error: updErr } = await svc
        .from("creator_profiles")
        .update({ portfolio_urls: kept })
        .eq("user_id", row.user_id);
      if (updErr) throw new Error(`purgeContent clear portfolio ${row.user_id}: ${updErr.message}`);
      result.portfoliosCleared++;
    }
  }

  return result;
}
