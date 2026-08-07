// _shared/outstand-media-ownership-store.ts — mint the media ownership binding.
//
// WHY A SHARED STORE RATHER THAN AN INLINE UPSERT. TWO gateways create Outstand
// media through the org key — outstand-proxy (`POST /media/upload`) and
// social-proxy (`uploadMedia`) — and BOTH must mint, or media created through
// the un-minting one is orphaned: strict enforcement then 403s its own uploader
// on confirm and delete, and filters it out of their list. That is exactly the
// two-gateway shape _shared/outstand-post-ownership-store.ts was extracted to
// solve for posts, and the first version of the media work repeated the mistake
// by inlining the upsert in one gateway only.
//
// Keeping it here means "a gateway that creates media" and "a gateway that
// records who owns it" cannot drift apart silently.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MediaOwnershipResult {
  minted: boolean;
  reason?: "no_id" | "conflict" | "error";
}

/**
 * Record that `userId` uploaded `mediaId`.
 *
 * FIRST WRITER WINS, and the conflict is LOGGED rather than swallowed.
 * `ON CONFLICT DO NOTHING` is what makes an already-bound id impossible to
 * steal, but on its own it is also silent — and silence is precisely what a
 * pre-claim attempt would want. So a conflict is read back and reported when it
 * names a different user, matching what the post store already does. A conflict
 * naming the SAME user is an ordinary retry and says nothing.
 *
 * Never throws: the upload already exists at the provider by the time this runs,
 * so a failure here must not be reported to the caller as a failed upload. It
 * returns a result the caller can log instead.
 */
export async function recordMediaOwnership(
  admin: SupabaseClient,
  mediaId: string | null,
  userId: string,
): Promise<MediaOwnershipResult> {
  if (!mediaId || !userId) return { minted: false, reason: "no_id" };

  const { error } = await admin
    .from("outstand_media_ownership")
    .upsert(
      { outstand_media_id: mediaId, user_id: userId },
      { onConflict: "outstand_media_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error(`outstand media ownership: upsert failed for ${mediaId}`, error.message);
    return { minted: false, reason: "error" };
  }

  // ignoreDuplicates makes a conflict indistinguishable from an insert in the
  // return value, so ask who actually holds it.
  const { data, error: readErr } = await admin
    .from("outstand_media_ownership")
    .select("user_id")
    .eq("outstand_media_id", mediaId)
    .maybeSingle();

  if (readErr) {
    // The write may well have landed; we just cannot confirm the holder.
    console.warn(`outstand media ownership: could not verify holder of ${mediaId}`, readErr.message);
    return { minted: true };
  }

  const holder = (data as { user_id?: unknown } | null)?.user_id;
  if (typeof holder === "string" && holder !== userId) {
    // Loud on purpose. Either the provider reused an id, or something tried to
    // pre-claim one. Both are worth a human look, and neither should be inferred
    // from an absence of log lines.
    console.error(
      `outstand media ownership: CONFLICT — ${mediaId} is already bound to a different user; ` +
        `upload by ${userId} left unbound`,
    );
    return { minted: false, reason: "conflict" };
  }

  return { minted: true };
}
