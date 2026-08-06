// outstand-webhook — inbound Outstand webhook: advances donny_scheduled_posts
// scheduled → published/failed, and flags expired account tokens for reconnect.
//
// Auth: HMAC-SHA256 over the raw body, header X-Outstand-Signature: sha256=<hex>,
//       secret OUTSTAND_WEBHOOK_SECRET. verify_jwt = false (see config.toml).
// ENV: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OUTSTAND_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseOutstandEvent,
  verifyOutstandSignature,
  type OutstandSocialAccount,
} from "../_shared/outstand-webhook-lib.ts";
import { buildSocialPostLogRow } from "../_shared/social-post-log-row.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_WEBHOOK_SECRET = Deno.env.get("OUTSTAND_WEBHOOK_SECRET")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Record a published post for measurement.
 *
 * THE CHOKE POINT. Publishing paths kept forgetting to write social_post_log —
 * PostingPlanReview and confirm-posting-schedule never did — so most posts were
 * never measured. The webhook sees every published post regardless of origin,
 * which makes coverage structural rather than something each new path must
 * remember. Same reasoning as create-notification.
 *
 * Returns 'recorded' | 'unmatched' | 'failed' so the caller can count outcomes.
 * An unmatched post is a VISIBLE hole, never a silent one.
 */
async function recordPublishedPost(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  publishedAt: string,
  accounts: OutstandSocialAccount[],
  rawAccountCount: number,
): Promise<{ outcome: "recorded" | "unmatched" | "failed"; rows: number; dropped: number }> {
  // Entries parseAccounts discarded as malformed, plus (below) entries that
  // parsed fine but carry no network. Carried forward from the Task 4 review: a
  // skip that increments no counter is the failure mode this whole sub-project
  // exists to remove.
  let dropped = Math.max(0, rawAccountCount - accounts.length);

  // No .limit(1).maybeSingle() here — that made the pick framework-arbitrary
  // whenever more than one schedule row shared an outstand_post_id, silently
  // applying one row's caption/hashtags/format to every platform in the event.
  // Fetch every candidate, order deterministically, and surface ambiguity as a
  // visible number instead of an invisible coin-flip.
  const { data: schedRows, error: schedErr } = await supabase
    .from("donny_scheduled_posts")
    .select("user_id, campaign_id, platform, caption, hashtags, content_type, scheduled_at, metadata")
    .eq("metadata->>outstand_post_id", postId)
    .order("created_at", { ascending: true });

  if (schedErr) {
    console.error("outstand-webhook: schedule lookup failed", schedErr.message);
    return { outcome: "failed", rows: 0, dropped };
  }
  if (!schedRows || schedRows.length === 0) {
    // No schedule row: published outside our flow. Since Task 16,
    // DonnyProvider.tsx's schedule-driven paths (including DragonShare) always
    // write outstand_post_id into donny_scheduled_posts.metadata before
    // publishing, so they match above and never reach here — what's left is
    // useSponsorshipAmplification.ts, which writes social_post_log directly and
    // creates no donny_scheduled_posts row at all (it has zero rows on prod as
    // of this writing), plus whatever Task 1's original bug may still lose.
    //
    // A fallback used to live here (Tasks 12/14/15/16) that stamped verified_at
    // on a pre-existing social_post_log row for this postId, scoped to owners
    // resolved from accounts[].accountId via business_outstand_accounts.
    // Removed 2026-08-05 (Task 18, Codex P1): that ownership resolution is
    // client-asserted, not server-established — business_outstand_accounts'
    // own INSERT policy constrains user_id/business_id but not
    // outstand_social_account_id, so any authenticated user can claim any
    // provider account id, and an attacker who knew a real post id and account
    // id could get their own planted row stamped and read another tenant's
    // analytics through it. Four consecutive review rounds each found a real
    // defect inside that fallback while patching around this hole instead of
    // closing it. Amplification posts are simply not measured until
    // provider-account ownership is server-established — see
    // docs/runbooks/social-measurement-spine-deploy.md.
    console.warn(`outstand-webhook: no scheduled post for ${postId} — not recorded for measurement`);
    return { outcome: "unmatched", rows: 0, dropped };
  }
  if (schedRows.length > 1) {
    console.warn(
      `outstand-webhook: ${schedRows.length} scheduled posts match ${postId} — using oldest (created_at asc)`,
    );
  }
  const sched = schedRows[0];

  // The EVENT is authoritative about what published and where; the schedule row
  // only supplies dimensions. socialAccounts[].network is the platform, one entry
  // per account — exactly the (outstand_post_id, platform) grain Task 2's unique
  // key uses. Fall back to the schedule's own platform only when the event
  // carries none.
  const accountsWithNetwork = accounts.filter((a) => !!a.network);
  // A parsed-but-networkless entry is silently invisible past this point unless
  // counted here — same "no skip without a counter" rule as the malformed ones.
  dropped += accounts.length - accountsWithNetwork.length;
  const networks = Array.from(new Set(accountsWithNetwork.map((a) => a.network as string)));
  const schedPlatform = typeof sched.platform === "string" ? sched.platform : null;
  const platforms = networks.length > 0 ? networks : (schedPlatform ? [schedPlatform] : []);

  if (platforms.length === 0) {
    // platform is NOT NULL on social_post_log, so there is no honest row to write.
    console.warn(`outstand-webhook: no platform for ${postId} — not recorded for measurement`);
    return { outcome: "unmatched", rows: 0, dropped };
  }

  // Row construction — post_type resolution, dragonshare_post_id derivation
  // (mirrors DonnyProvider.tsx's publishDraft: only DragonShare-sourced
  // drafts carry a dragonshare_post_id, read from metadata.post_id when
  // metadata.source is 'dragonshare_social_hook'; carrying it here closes a
  // race where the webhook's schedule-matched upsert wins as the INSERT
  // (Outstand's delivery beats the client's own social_post_log insert):
  // without this, that insert had no dragonshare_post_id, the BEFORE INSERT
  // trigger (resolve_social_post_log_brief, 20260611150657) had nothing to
  // derive source_brief_id from, and the client's own insert then lost the
  // unique-key race and errored — permanently dropping brief->outcome
  // attribution), format mapping — lives in the SHARED buildSocialPostLogRow
  // (_shared/social-post-log-row.ts), also used by reconcile-social-posts, so
  // the two writers can never disagree about what belongs at a given
  // (outstand_post_id, platform) key. verified_at is computed fresh per
  // platform inside this map, preserving this function's exact pre-extraction
  // behavior (each row got its own independent new Date() call).
  const rows = platforms.map((platform) =>
    buildSocialPostLogRow(postId, platform, publishedAt, sched, new Date().toISOString()),
  );

  const { error: upsertErr } = await supabase
    .from("social_post_log")
    .upsert(rows, { onConflict: "outstand_post_id,platform" });

  if (upsertErr) {
    console.error("outstand-webhook: social_post_log upsert failed", upsertErr.message);
    return { outcome: "failed", rows: 0, dropped };
  }
  return { outcome: "recorded", rows: rows.length, dropped };
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const signature = req.headers.get("x-outstand-signature");
  if (!(await verifyOutstandSignature(rawBody, signature, OUTSTAND_WEBHOOK_SECRET))) {
    console.error("outstand-webhook: invalid signature");
    return json(401, { error: "Unauthorized — invalid signature" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const { event, postId, accountId, publishedAt, timestamp, socialAccounts, accounts } = parseOutstandEvent(body);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event === "post.published" || event === "post.error") {
      if (!postId) return json(400, { error: "Missing postId" });
      const newStatus = event === "post.published" ? "published" : "failed";

      // Record ARRIVAL before anything else in this branch, including the
      // measurement write below. This insert used to run only after a successful
      // update, so a no_match delivery left no trace and an empty table could not
      // distinguish "never delivered" from "delivered, matched nothing" — which is
      // exactly the ambiguity that stalled this work. MUST stay first: if
      // recordPublishedPost throws at the network level (not a returned
      // {error}), the outer catch returns 500 before reaching this insert, and
      // that failure class silently reintroduces the exact gap this insert
      // exists to close. Do not move the measurement write ahead of it again.
      const { error: auditErr } = await supabase
        .from("outstand_webhook_events")
        .insert({ id: `${event}:${postId}`, event, post_id: postId, payload: body });
      if (auditErr && auditErr.code !== "23505") {
        console.warn("outstand-webhook: audit insert failed", auditErr.message);
      }

      // Record for measurement BEFORE the scheduled-post patch below, so a post
      // whose status update finds no row is still measured.
      if (event === "post.published") {
        const rawAccountCount = Array.isArray(socialAccounts) ? socialAccounts.length : 0;
        const res = await recordPublishedPost(
          supabase,
          postId,
          publishedAt ?? timestamp ?? new Date().toISOString(),
          accounts,
          rawAccountCount,
        );
        console.log(
          `outstand-webhook: measurement record for ${postId}: ${res.outcome} rows=${res.rows}` +
          (res.dropped > 0 ? ` droppedAccounts=${res.dropped}` : ""),
        );
        if (res.outcome === "failed") {
          // recordPublishedPost failed on a transient DB read/write (schedule
          // lookup error or social_post_log upsert error) — not a data-shape
          // problem, so it's worth Outstand's free retry (up to 5 attempts,
          // backoff) rather than losing the measurement permanently to a 200.
          // Safe to retry: the audit insert above ignores 23505 (already ran,
          // unconditionally, before this branch), the social_post_log upsert is
          // keyed on (outstand_post_id, platform), and the status update below
          // is guarded by .neq('status','published') — nothing here double-applies.
          console.error(`outstand-webhook: measurement write failed for postId=${postId}, returning 500 for retry`);
          return json(500, { status: "failed", outcome: res.outcome, post_id: postId });
        }
      }

      // Guarded: only advance rows that aren't already published.
      const { data: rows } = await supabase
        .from("donny_scheduled_posts")
        .select("id, metadata")
        .eq("metadata->>outstand_post_id", postId)
        .neq("status", "published");

      if (!rows || rows.length === 0) {
        console.log(`outstand-webhook: no scheduled post for ${postId} (foreign/already published)`);
        return json(200, { status: "no_match", post_id: postId });
      }

      for (const row of rows) {
        const meta = (row.metadata as Record<string, unknown>) ?? {};
        const patch: Record<string, unknown> = {
          status: newStatus,
          metadata: { ...meta, publish_result: socialAccounts ?? null },
          updated_at: new Date().toISOString(),
        };
        // publishedAt is absent from the documented payload; the event carries a
        // top-level timestamp. Falling straight to now() recorded when WE processed
        // the delivery — up to 5 minutes late once retries back off.
        if (newStatus === "published") {
          patch.published_at = publishedAt ?? timestamp ?? new Date().toISOString();
        }
        await supabase
          .from("donny_scheduled_posts")
          .update(patch)
          .eq("id", row.id)
          .neq("status", "published");
      }

      return json(200, { status: "processed", event, post_id: postId });
    }

    if (event === "account.token_expired") {
      if (accountId) {
        await supabase
          .from("business_outstand_accounts")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("outstand_social_account_id", accountId);
      }
      return json(200, { status: "processed", event });
    }

    console.log(`outstand-webhook: ignoring event ${event}`);
    return json(200, { status: "ignored", event });
  } catch (err) {
    console.error("outstand-webhook: processing failed", (err as Error).message);
    return json(500, { error: "Processing failed" });
  }
});
