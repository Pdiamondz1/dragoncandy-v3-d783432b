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
 * Returns 'recorded' | 'unmatched' | 'verified_existing' | 'owner_pending' | 'failed'
 * so the caller can count outcomes. An unmatched post is a VISIBLE hole, never a
 * silent one. 'owner_pending' is distinct from 'unmatched': it means this IS one
 * of our posts (an owner resolved from accounts[].accountId) but no row existed
 * yet to stamp — almost certainly a race against the client's own
 * social_post_log insert (see the no-schedule-row branch below) — and the
 * caller must turn that into a 500 so Outstand redelivers, never a 200.
 */
async function recordPublishedPost(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  publishedAt: string,
  accounts: OutstandSocialAccount[],
  rawAccountCount: number,
): Promise<
  { outcome: "recorded" | "unmatched" | "verified_existing" | "owner_pending" | "failed"; rows: number; dropped: number }
> {
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
    // What IS available: stamp verified_at on a social_post_log row a client
    // ALREADY wrote for this outstand_post_id. That row's outstand_post_id is
    // client-asserted, but a signed post.published event proves a post with
    // that id actually published — stamping on that signature preserves the
    // property this gate was built for (a fabricated post id never produces a
    // signed event, so blind enumeration and the quota-burn angle still die
    // here).
    //
    // CORRECTION (2026-08-05): the first version of this stamp matched on
    // outstand_post_id alone with no check on who wrote the row, on the theory
    // that this was "no worse than before". That was wrong — before this stamp
    // existed, a planted row for a real-but-unscheduled post id could not be
    // verified through this path at all; an unscoped stamp is a NEW way to get
    // one verified. An attacker who knows a real Outstand post id with no
    // schedule row could get their own planted row stamped, and
    // content-performance-capture would then fetch another tenant's analytics
    // under the attacker's user_id. Fixed by resolving the post's plausible
    // owner(s) from the event itself before stamping: accounts[].accountId is
    // the Outstand-side account id that published, and
    // business_outstand_accounts maps that id to the user who connected it.
    // Only rows whose user_id is among those resolved owners get stamped; if no
    // owner resolves (or the lookup errors), nothing is stamped.
    //
    // BE HONEST ABOUT WHAT THIS DOES AND DOES NOT ACHIEVE. It is NOT a full
    // close. business_outstand_accounts' own INSERT policy
    // (20260506140000_outstand_account_links.sql) constrains user_id and
    // business_id to the caller's own identity but does NOT constrain
    // outstand_social_account_id — a determined attacker can insert their own
    // business_outstand_accounts row claiming a real victim's account id,
    // which then resolves to the ATTACKER's own user_id here and passes this
    // check. What this fix removes is the no-ownership-check-at-all case:
    // forging a verified row now additionally requires knowing AND claiming
    // the real Outstand account id, not just the real post id — a required
    // forgery step, not a closed hole. The actual close is server-established
    // provider-account ownership (never client-asserted), tracked separately:
    // docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md.
    //
    // Matched on outstand_post_id ALONE, not (outstand_post_id, platform):
    // there is still no schedule row on this path, so there is still no single
    // network name to scope the match to (an amplify call fans one post out to
    // however many platforms were selected). useSponsorshipAmplification.ts now
    // writes real platform names (fixed 2026-08-05, Task 13 —
    // docs/runbooks/social-measurement-spine-deploy.md), so this simply stamps
    // every owner-matched row this webhook event's post produced, whatever
    // platforms those are.
    const accountIds = Array.from(
      new Set(accounts.map((a) => a.accountId).filter((id): id is string => !!id)),
    );
    if (accountIds.length === 0) {
      console.warn(`outstand-webhook: no account id on event for ${postId} — not stamping any pre-existing rows`);
      return { outcome: "unmatched", rows: 0, dropped };
    }

    const { data: owners, error: ownerErr } = await supabase
      .from("business_outstand_accounts")
      .select("user_id")
      .in("outstand_social_account_id", accountIds);

    if (ownerErr) {
      // Fail closed: a broken lookup must never fall through to an unscoped
      // stamp. Better a real post's verification is delayed a retry than a
      // planted row slips through because ownership resolution errored.
      console.error("outstand-webhook: account owner lookup failed", ownerErr.message);
      return { outcome: "failed", rows: 0, dropped };
    }
    const ownerIds = Array.from(
      new Set((owners ?? []).map((o) => o.user_id as string | null).filter((id): id is string => !!id)),
    );
    if (ownerIds.length === 0) {
      console.warn(`outstand-webhook: no account owner resolved for ${postId} — not stamping any pre-existing rows`);
      return { outcome: "unmatched", rows: 0, dropped };
    }

    const { data: stamped, error: stampErr } = await supabase
      .from("social_post_log")
      .update({ verified_at: new Date().toISOString() })
      .eq("outstand_post_id", postId)
      .in("user_id", ownerIds)
      .is("verified_at", null)
      .select("id");

    if (stampErr) {
      console.error("outstand-webhook: verified_at stamp failed", stampErr.message);
      return { outcome: "failed", rows: 0, dropped };
    }
    if (stamped && stamped.length > 0) {
      return { outcome: "verified_existing", rows: stamped.length, dropped };
    }

    // Reaching here means an owner DID resolve (the ownerIds.length === 0 case
    // returned above) but the stamp UPDATE touched zero rows — this is one of
    // OUR posts, not a foreign one, so 'unmatched' was the wrong outcome for
    // it (Task 15, Codex P1): a real DragonCandy post would be silently lost
    // forever whenever Outstand's post.published delivery beat the client's
    // own social_post_log insert to land — a genuine race, since
    // useSponsorshipAmplification.ts and DonnyProvider's DragonShare path both
    // publish through Outstand and only afterward insert their row. It can
    // also mean the row already exists but was verified by an earlier
    // delivery of this same event (excluded here by `.is('verified_at',
    // null)`) — a harmless case that costs a few wasted retries, not a wrong
    // outcome. Either way the caller must return non-2xx so Outstand
    // redelivers (up to 5 attempts, backoff to 5 min) and a later attempt can
    // stamp the row once it exists.
    console.warn(
      `outstand-webhook: owner resolved but no row to stamp for ${postId} — requesting retry (client insert likely still in flight)`,
    );
    return { outcome: "owner_pending", rows: 0, dropped };
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
        // match) / 'unmatched' (no schedule row, and either no account id on
        // the event or no owner resolved for it — genuinely foreign, or an
        // account we don't know) / 'verified_existing' (no schedule row, but a
        // client-written social_post_log row for this postId got stamped —
        // see the comment at the stamp UPDATE) / 'owner_pending' (no schedule
        // row, an owner DID resolve — this is OUR post — but no row existed
        // yet to stamp; see the comment at that return) / 'failed'. Kept as
        // one log line, distinguished by ${res.outcome}, so a count-by-outcome
        // over these logs tells all five apart without a separate branch per
        // case.
        console.log(
          `outstand-webhook: measurement record for ${postId}: ${res.outcome} rows=${res.rows}` +
          (res.dropped > 0 ? ` droppedAccounts=${res.dropped}` : ""),
        );
        if (res.outcome === "failed" || res.outcome === "owner_pending") {
          // Both ask Outstand to redeliver (500, up to 5 attempts, backoff to
          // 5 min) rather than losing the measurement permanently to a 200.
          // 'failed' is a transient DB read/write error (schedule lookup,
          // verified_at stamp, or social_post_log upsert). 'owner_pending' is
          // the no-schedule-row race (Task 15, Codex P1): the event's
          // accounts[].accountId resolved to one of our users, so this is
          // definitely our post, but publish-then-insert client paths
          // (useSponsorshipAmplification, DonnyProvider's DragonShare leg) can
          // have Outstand's post.published delivery beat their own
          // social_post_log insert — without this branch that row would carry
          // a permanently null verified_at and content-performance-capture
          // would skip it forever. Deliberately narrower than the old
          // 'unmatched' catch-all: a genuinely foreign post (no owner
          // resolves) still returns 200 below, since retrying that can never
          // help and would burn five deliveries per foreign post.
          // Safe to retry either way: the audit insert above ignores 23505
          // (already ran, unconditionally, before this branch); the
          // social_post_log upsert is keyed on (outstand_post_id, platform);
          // the verified_at stamp UPDATE is guarded by .is('verified_at',
          // null), so a retry after a partial stamp just finds 0 rows left to
          // stamp (falls back into this same retry, never double-applies);
          // and the status update below is guarded by .neq('status',
          // 'published') — nothing here double-applies.
          console.error(
            `outstand-webhook: measurement ${res.outcome === "owner_pending" ? "pending (owner resolved, no row yet)" : "write failed"} for postId=${postId}, returning 500 for retry`,
          );
          return json(500, { status: res.outcome === "owner_pending" ? "pending" : "failed", outcome: res.outcome, post_id: postId });
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
