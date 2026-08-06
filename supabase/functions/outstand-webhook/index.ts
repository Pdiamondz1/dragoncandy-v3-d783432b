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
import { buildSocialPostLogRow, isGenuineScheduleAmbiguity } from "../_shared/social-post-log-row.ts";
import { applyOwnershipBinding } from "../_shared/outstand-post-ownership.ts";

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
 *
 * OWNERSHIP IS PERMISSIVE HERE (Task 4, 2026-08-06) — deliberately, and unlike
 * reconcile-social-posts, which is strict. This function is the deployed choke
 * point for every live publish, and every post published before outstand-proxy
 * started minting outstand_post_ownership bindings has none and never will.
 * Demanding a binding here would stop measuring that entire existing population
 * outright. So: PREFER the binding when present (and reject a schedule row that
 * disagrees with it, exactly as the sweep does), FALL BACK to today's
 * schedule-row match when absent — and report which one was used on every
 * delivery via the `ownership` field, so the legacy population is a number
 * somebody can count in the logs rather than an assumption. The sweep is strict
 * because it is brand new: no live traffic depends on it recording anything, so
 * it can demand the binding from day one without losing coverage that exists.
 *
 * `ownership` values (emitted as `ownership=<v>` in the caller's single summary
 * log line — greppable, one line per delivery, which is what a per-request
 * function can offer in place of a run summary):
 *   binding                     — a server-established binding matched and the
 *                                 schedule row agreed. Trustworthy.
 *   legacy_schedule             — no binding exists; user_id came from the
 *                                 client-writable schedule row. THIS is the
 *                                 fallback counter: its rate is the legacy
 *                                 population, and it should trend to zero.
 *   legacy_schedule_unreadable  — the binding READ failed (incl. the migration
 *                                 not yet applied). Same fallback, but for a
 *                                 different reason; separated so a broken query
 *                                 can never hide inside the expected number.
 *   conflict                    — a binding exists and NOT ONE candidate
 *                                 schedule row agrees with it. Nothing is
 *                                 recorded.
 *   not_evaluated               — returned before ownership was consulted (the
 *                                 schedule lookup errored, or matched no rows).
 *
 * `rejectedScheduleRows` is the second half of the forgery signal, and the more
 * important one: it counts candidate rows discarded for contradicting the
 * binding EVEN WHEN a legitimate row survived and the post was recorded
 * correctly. `conflict` only fires when an attacker's row is the ONLY one;
 * `rejectedScheduleRows` fires on the far more likely case where the plant was
 * neutralised, which would otherwise leave no trace at all.
 */
async function recordPublishedPost(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  publishedAt: string,
  accounts: OutstandSocialAccount[],
  rawAccountCount: number,
): Promise<{
  outcome: "recorded" | "unmatched" | "failed";
  rows: number;
  dropped: number;
  ownership:
    | "binding"
    | "legacy_schedule"
    | "legacy_schedule_unreadable"
    | "conflict"
    | "not_evaluated";
  rejectedScheduleRows: number;
}> {
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
    return { outcome: "failed", rows: 0, dropped, ownership: "not_evaluated", rejectedScheduleRows: 0 };
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
    return { outcome: "unmatched", rows: 0, dropped, ownership: "not_evaluated", rejectedScheduleRows: 0 };
  }
  // SERVER-ESTABLISHED OWNERSHIP (Task 4). Until now the ONLY thing deciding
  // which user_id got credited for a published post was
  // donny_scheduled_posts.metadata->>'outstand_post_id' — and `authenticated`
  // holds INSERT+UPDATE on every column of that table (verified on prod via
  // information_schema.column_privileges; its RLS policies constrain user_id
  // and nothing else). So anyone could plant a row naming any post id, have it
  // win the `created_at asc` pick below, and get content-performance-capture to
  // spend the org-wide OUTSTAND_API_KEY fetching a stranger's analytics and
  // file them under their own user_id. outstand_post_ownership is the fix:
  // outstand-proxy writes it on a 2xx POST /posts from ctx.userId
  // (auth.getUser(), not a body field) plus the id in Outstand's own response —
  // both halves unforgeable by a client.
  //
  // A read error degrades to the legacy fallback rather than failing the
  // delivery. Deliberate: this is a live path, a 500 here burns Outstand's five
  // retries, and before migration 20260806184500 is applied this table does not
  // exist — a hard failure would take measurement from "as good as yesterday"
  // to "nothing" for the entire window between deploy and migration. The
  // separate `legacy_schedule_unreadable` label keeps that case from hiding
  // inside the expected `legacy_schedule` number.
  const { data: bindingRow, error: bindingErr } = await supabase
    .from("outstand_post_ownership")
    .select("user_id")
    .eq("outstand_post_id", postId)
    .maybeSingle();
  if (bindingErr) {
    console.error("outstand-webhook: ownership binding lookup failed", bindingErr.message);
  }
  const bindingUserId = bindingErr ? null : ((bindingRow?.user_id as string | undefined) ?? null);

  // Discard any candidate whose user_id the binding contradicts, keeping the
  // rest in the query's created_at-asc order. A forged row can never survive
  // by accident: donny_scheduled_posts' INSERT policy is
  // WITH CHECK (user_id = auth.uid()) and its UPDATE policy is
  // USING (user_id = auth.uid()) with no WITH CHECK (Postgres reuses USING for
  // the new row), so a planted row always carries the planter's own id, which
  // cannot equal the real creator's binding. And because every survivor
  // satisfies user_id === bindingUserId, buildSocialPostLogRow keeps reading
  // sched.user_id and the row's user_id is still server-established, by
  // construction — the shared row builder needs no new parameter and stays pure.
  // See _shared/outstand-post-ownership.ts for why rejection is per-ROW, not
  // per-post.
  const owner = applyOwnershipBinding(bindingUserId, schedRows);
  if (owner.rejected > 0) {
    // Fires even when the attack was neutralised (a legitimate row survived) —
    // a neutralised forgery that incremented nothing would be invisible.
    console.error(
      `outstand-webhook: discarded ${owner.rejected} donny_scheduled_posts row(s) for ${postId} ` +
      `whose user_id the server-established ownership binding (${bindingUserId}) contradicts`,
    );
  }
  if (owner.kind === "conflict") {
    // NOT 'failed': returning 500 would make Outstand retry five times against
    // data that cannot get better. Nothing is recorded, and it is loud.
    console.error(
      `outstand-webhook: ownership conflict for ${postId} — no donny_scheduled_posts row agrees ` +
      `with the server-established binding (${bindingUserId}); refusing to record for measurement`,
    );
    return { outcome: "unmatched", rows: 0, dropped, ownership: "conflict", rejectedScheduleRows: owner.rejected };
  }
  const ownership = owner.kind === "binding"
    ? "binding" as const
    : (bindingErr ? "legacy_schedule_unreadable" as const : "legacy_schedule" as const);

  // DELIBERATE BEHAVIOR CHANGE #1 (review round 1): fires only on a GENUINE
  // disagreement between candidates now, not routine multi-platform fan-out.
  // This warning predates amplification writing schedule rows at all (zero
  // rows on prod before this branch's Task 1, per the comment above) — once
  // useSponsorshipAmplification started writing one row per platform for a
  // single post (identical apart from `platform`, which
  // isGenuineScheduleAmbiguity deliberately never compares), the SAME
  // pre-existing warning logic would have fired on every multi-platform
  // amplification delivery, making a real ambiguity indistinguishable from
  // routine operation. Gated here rather than left as noise.
  //
  // Runs over the BINDING-FILTERED candidates (Task 4), not the raw query
  // result: a planted row is a forgery, already counted above as `rejected` —
  // reporting it a second time as an "ambiguity" would put a security event in
  // the wrong bucket and re-noise the warning this gate was added to quiet.
  if (owner.candidates.length > 1 && isGenuineScheduleAmbiguity(owner.candidates)) {
    console.warn(
      `outstand-webhook: ${owner.candidates.length} scheduled posts match ${postId} — using oldest (created_at asc)`,
    );
  }
  const sched = owner.candidates[0];

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
    return { outcome: "unmatched", rows: 0, dropped, ownership, rejectedScheduleRows: owner.rejected };
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
  //
  // DELIBERATE BEHAVIOR CHANGE #2 (2026-08-06 extraction) from this
  // function's pre-extraction row-construction code — everything else about
  // row content is byte-identical: a non-string metadata.post_id used to
  // pass through via an unchecked cast, which would fail dragonshare_post_id's
  // uuid-column coercion and error the WHOLE upsert (every platform's row for
  // this post lost, not just the one field). The shared function now guards
  // with typeof and writes null instead — the post still gets measured, only
  // the brief-attribution link is missing. See social-post-log-row.ts's
  // buildSocialPostLogRow doc comment for the full reasoning. Requires this
  // function to be redeployed for this branch's changes to take effect at all
  // (it now imports from _shared/social-post-log-row.ts).
  const rows = platforms.map((platform) =>
    buildSocialPostLogRow(postId, platform, publishedAt, sched, new Date().toISOString()),
  );

  const { error: upsertErr } = await supabase
    .from("social_post_log")
    .upsert(rows, { onConflict: "outstand_post_id,platform" });

  if (upsertErr) {
    console.error("outstand-webhook: social_post_log upsert failed", upsertErr.message);
    return { outcome: "failed", rows: 0, dropped, ownership, rejectedScheduleRows: owner.rejected };
  }
  return { outcome: "recorded", rows: rows.length, dropped, ownership, rejectedScheduleRows: owner.rejected };
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
        // `ownership=` is emitted on EVERY delivery, not only the interesting
        // ones: counting how often the legacy schedule-row fallback is still
        // load-bearing is only possible if the healthy case prints a value too.
        // See recordPublishedPost's doc comment for the vocabulary.
        console.log(
          `outstand-webhook: measurement record for ${postId}: ${res.outcome} rows=${res.rows}` +
          ` ownership=${res.ownership}` +
          (res.rejectedScheduleRows > 0 ? ` rejectedScheduleRows=${res.rejectedScheduleRows}` : "") +
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
