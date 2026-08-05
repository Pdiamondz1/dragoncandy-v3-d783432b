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
 * Returns 'recorded' | 'unmatched' | 'verified_existing' | 'failed' so the caller
 * can count outcomes. An unmatched post is a VISIBLE hole, never a silent one.
 */
async function recordPublishedPost(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  publishedAt: string,
  accounts: OutstandSocialAccount[],
  rawAccountCount: number,
): Promise<{ outcome: "recorded" | "unmatched" | "verified_existing" | "failed"; rows: number; dropped: number }> {
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
    // No schedule row: published outside our flow (e.g.
    // useSponsorshipAmplification.ts, which writes social_post_log directly and
    // creates no donny_scheduled_posts row at all — Task 12 finding), or Task 1's
    // bug lost it. Either way there's no schedule row to source caption/format/
    // campaign dimensions from, and user_id is NOT NULL and unknowable on this
    // path, so there is no honest new row to insert here.
    //
    // What IS available and safe: stamp verified_at on a social_post_log row a
    // client ALREADY wrote for this outstand_post_id. That row's
    // outstand_post_id is client-asserted, but a signed post.published event
    // proves a post with that id actually published — stamping on that
    // signature preserves the property this gate was built for (a fabricated
    // post id never produces a signed event, so blind enumeration and the
    // quota-burn angle still die here). It does NOT close the targeted case
    // where an attacker already knows a real post id and planted a row
    // referencing it — that was never closed by this gate and is tracked
    // separately: docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md.
    // Do not read this as a full fix for that.
    //
    // Matched on outstand_post_id ALONE, deliberately not (outstand_post_id,
    // platform): useSponsorshipAmplification.ts:42 writes an Outstand ACCOUNT id
    // into `platform`, while this event's platforms (from
    // socialAccounts[].network, above) are network names — a platform-scoped
    // match would never hit the very rows this exists to reach. Known open
    // item: docs/runbooks/social-measurement-spine-deploy.md.
    const { data: stamped, error: stampErr } = await supabase
      .from("social_post_log")
      .update({ verified_at: new Date().toISOString() })
      .eq("outstand_post_id", postId)
      .is("verified_at", null)
      .select("id");

    if (stampErr) {
      console.error("outstand-webhook: verified_at stamp failed", stampErr.message);
      return { outcome: "failed", rows: 0, dropped };
    }
    if (stamped && stamped.length > 0) {
      return { outcome: "verified_existing", rows: stamped.length, dropped };
    }

    // No schedule row AND no pre-existing social_post_log row: published
    // outside our flow, or Task 1's bug lost it.
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
    // Service-role only. This is what makes the row trustworthy enough to spend an
    // API call on — see the migration comment.
    verified_at: new Date().toISOString(),
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
        // outcome is one of 'recorded' (new row(s) inserted from a schedule
        // match) / 'unmatched' (no schedule row and nothing pre-existing to
        // stamp) / 'verified_existing' (no schedule row, but a client-written
        // social_post_log row for this postId got stamped — see the comment at
        // the stamp UPDATE) / 'failed'. Kept as one log line, distinguished by
        // ${res.outcome}, so a count-by-outcome over these logs tells all four
        // apart without a separate branch per case.
        console.log(
          `outstand-webhook: measurement record for ${postId}: ${res.outcome} rows=${res.rows}` +
          (res.dropped > 0 ? ` droppedAccounts=${res.dropped}` : ""),
        );
        if (res.outcome === "failed") {
          // recordPublishedPost failed on a transient DB read/write (schedule
          // lookup error, verified_at stamp error, or social_post_log upsert
          // error) — not a data-shape problem, so it's worth Outstand's free
          // retry (up to 5 attempts, backoff) rather than losing the
          // measurement permanently to a 200.
          // Safe to retry: the audit insert above ignores 23505 (already ran,
          // unconditionally, before this branch); the social_post_log upsert is
          // keyed on (outstand_post_id, platform); the verified_at stamp UPDATE
          // is guarded by .is('verified_at', null), so a retry after a partial
          // stamp just finds 0 rows left to stamp (reads as 'unmatched', never
          // double-applies); and the status update below is guarded by
          // .neq('status','published') — nothing here double-applies.
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
