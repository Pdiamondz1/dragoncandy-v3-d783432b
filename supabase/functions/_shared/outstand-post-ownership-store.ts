// _shared/outstand-post-ownership-store.ts — the ONE writer of
// outstand_post_ownership.
//
// Separate from _shared/outstand-post-ownership.ts on purpose: that module is
// PURE (no Deno/Supabase/IO) so Vitest can exercise the two rules that fail
// silently if wrong — where the created post id lives, and what to do when a
// schedule row contradicts the binding. This file is the IO half, and lives on
// its own so importing the writer can never drag a runtime dependency into the
// tested module. (The `import type` below is erased at build time, so nothing
// here resolves an https:// import at test time either.)
//
// TWO gateways create posts, and both must mint the binding or the strict
// reconcile sweep silently skips whatever the missing one produced while still
// reporting a healthy run:
//   * outstand-proxy   — the live SDK path (POST /posts), id read off the raw
//                        upstream response via extractCreatedPostId.
//   * social-proxy     — the provider-agnostic contract gateway's `createPost`
//                        op, id read off the adapter's already-normalised
//                        PostResult.providerPostId.
// Their id SOURCES differ; the write, and every property that makes it
// trustworthy, must not. Hence one function.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Record the server-established owner of a just-created provider post.
 *
 * `userId` MUST be server-derived (both callers pass ctx.userId, from
 * auth.getUser() on the caller's own JWT) and `postId` MUST come from the
 * provider's own response — never from the request body. Those two facts are
 * the entire reason this table is trustworthy where
 * donny_scheduled_posts.metadata is not; a caller that sourced either from
 * client input would silently turn this into the same forgeable claim.
 *
 * NEVER THROWS, and callers must not let it change what the user gets back. By
 * the time this runs the post already exists upstream — the publish SUCCEEDED.
 * Throwing would report a failure for a post that really shipped and strand it
 * in an unrecoverable UI state. A failed binding write costs exactly one thing:
 * that post becomes unmeasurable-by-binding (reconcile-social-posts will skip
 * it; outstand-webhook falls back to its legacy schedule-row match), which is
 * why every failure path here logs at console.error rather than swallowing.
 *
 * Idempotent: `ignoreDuplicates` maps to ON CONFLICT DO NOTHING on the
 * outstand_post_id primary key, so a retried publish is a no-op, not a 23505.
 *
 * @param logPrefix the calling function's name, so a log line names its source.
 */
export async function recordPostOwnership(
  admin: SupabaseClient,
  postId: string,
  userId: string,
  logPrefix: string,
): Promise<void> {
  const { data: inserted, error } = await admin
    .from("outstand_post_ownership")
    .upsert(
      { outstand_post_id: postId, user_id: userId },
      { onConflict: "outstand_post_id", ignoreDuplicates: true },
    )
    .select("outstand_post_id");

  if (error) {
    // Includes the pre-migration case: until
    // 20260806184500_outstand_post_ownership.sql is applied this table does not
    // exist, every call lands here, and NOTHING gets a binding. Hence naming
    // the table and the consequence explicitly rather than logging a bare error.
    console.error(
      `${logPrefix}: failed to write outstand_post_ownership for postId=${postId} — this post ` +
      `will not be measurable by binding (reconcile-social-posts will skip it; outstand-webhook ` +
      `will use its legacy schedule match):`,
      error.message,
    );
    return;
  }

  if (inserted && inserted.length > 0) return; // inserted cleanly, nothing to check

  // ON CONFLICT DO NOTHING returns no rows, so "nothing inserted" is ambiguous
  // between *this user's retried publish* (the idempotency we want) and *this id
  // is already bound to somebody else*. In the second case one user's post has
  // just been credited to another — a provider id collision or id reuse — and
  // first-writer-wins would make that permanent and completely invisible. Only
  // reached on the conflict path, so it costs nothing on a normal publish.
  const { data: existing, error: readBackErr } = await admin
    .from("outstand_post_ownership")
    .select("user_id")
    .eq("outstand_post_id", postId)
    .maybeSingle();
  if (readBackErr) {
    console.error(
      `${logPrefix}: could not read back the existing ownership binding for postId=${postId}:`,
      readBackErr.message,
    );
  } else if (existing && existing.user_id !== userId) {
    console.error(
      `${logPrefix}: ownership binding collision for postId=${postId} — already bound to ` +
      `${existing.user_id}, this publish was made by ${userId}. The binding is NOT being changed ` +
      `(first writer wins); this post's measurement will be credited to the existing owner. A ` +
      `provider post id was reused or collided.`,
    );
  }
}
