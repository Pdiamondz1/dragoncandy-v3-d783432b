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
import { resolvePostType } from "../_shared/post-type.ts";

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
  // Entries parseAccounts discarded as malformed. Carried forward from the Task 4
  // review: a skip that increments no counter is the failure mode this whole
  // sub-project exists to remove.
  const dropped = Math.max(0, rawAccountCount - accounts.length);

  const { data: sched, error: schedErr } = await supabase
    .from("donny_scheduled_posts")
    .select("user_id, campaign_id, platform, caption, hashtags, content_type, scheduled_at, metadata")
    .eq("metadata->>outstand_post_id", postId)
    .limit(1)
    .maybeSingle();

  if (schedErr) {
    console.error("outstand-webhook: schedule lookup failed", schedErr.message);
    return { outcome: "failed", rows: 0, dropped };
  }
  if (!sched) {
    // No schedule row: published outside our flow, or Task 1's bug lost it.
    console.warn(`outstand-webhook: no scheduled post for ${postId} — not recorded for measurement`);
    return { outcome: "unmatched", rows: 0, dropped };
  }

  // The EVENT is authoritative about what published and where; the schedule row
  // only supplies dimensions. socialAccounts[].network is the platform, one entry
  // per account — exactly the (outstand_post_id, platform) grain Task 2's unique
  // key uses. Fall back to the schedule's own platform only when the event
  // carries none.
  const networks = Array.from(
    new Set(accounts.map((a) => a.network).filter((n): n is string => !!n)),
  );
  const schedPlatform = typeof sched.platform === "string" ? sched.platform : null;
  const platforms = networks.length > 0 ? networks : (schedPlatform ? [schedPlatform] : []);

  if (platforms.length === 0) {
    // platform is NOT NULL on social_post_log, so there is no honest row to write.
    console.warn(`outstand-webhook: no platform for ${postId} — not recorded for measurement`);
    return { outcome: "unmatched", rows: 0, dropped };
  }

  const meta = (sched.metadata as Record<string, unknown> | null) ?? {};
  const postType = resolvePostType(
    meta.source as string | null,
    sched.campaign_id as string | null,
  );

  const rows = platforms.map((platform) => ({
    user_id: sched.user_id,
    campaign_id: sched.campaign_id,
    outstand_post_id: postId,
    platform,
    post_type: postType,
    caption: sched.caption,
    hashtags: sched.hashtags,
    // content_type IS the format vocabulary. Never inferred from a URL: a wrong
    // format is indistinguishable from a real finding downstream.
    format: sched.content_type ?? null,
    scheduled_at: sched.scheduled_at,
    published_at: publishedAt,
  }));

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

      // Record for measurement BEFORE the scheduled-post patch, so a post whose
      // status update finds no row is still measured.
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
      }

      // Record ARRIVAL before deciding whether it matched. This insert used to run
      // only after a successful update, so a no_match delivery left no trace and an
      // empty table could not distinguish "never delivered" from "delivered, matched
      // nothing" — which is exactly the ambiguity that stalled this work.
      const { error: auditErr } = await supabase
        .from("outstand_webhook_events")
        .insert({ id: `${event}:${postId}`, event, post_id: postId, payload: body });
      if (auditErr && auditErr.code !== "23505") {
        console.warn("outstand-webhook: audit insert failed", auditErr.message);
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
