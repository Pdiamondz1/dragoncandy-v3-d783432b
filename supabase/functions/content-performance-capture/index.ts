// content-performance-capture — scheduled (cron-invoked) loop.
// Enumerates recently-published posts from social_post_log, pulls Outstand's
// per-post analytics directly with the org key (no proxy — ownership is already
// known from our own table), and inserts append-only maturation snapshots.
//
// Auth: cron passes Bearer <SUPABASE_SERVICE_ROLE_KEY> (the injected service/
// sb_secret key). verify_jwt=false; we check the bearer ourselves.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OUTSTAND_API_KEY,
//      OUTSTAND_BASE_URL (defaults to https://api.outstand.so/v1)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { milestonesDue, classifyMeasurement, isCaptureRunFailed, metricsForPlatform, reasonForPlatform, effectivePublishedAt, type Milestone } from "./capture.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";

// Each post costs one external call. Bail deliberately with a logged summary
// rather than being killed mid-run with no record of how far we got — every
// post is upserted as it succeeds, so an early exit keeps what was captured.
// Mirrors account-metrics-capture's RUN_BUDGET_MS exactly.
const RUN_BUDGET_MS = 60_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

interface PostRow {
  id: string;
  user_id: string;
  campaign_id: string | null;
  outstand_post_id: string;
  platform: string;
  post_type: string;
  format: string | null;
  source_brief_id: string | null;
  created_at: string;
  published_at: string | null;
  verified_at: string | null;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Auth gate — only the cron (service-role or AIOS_INGEST_SECRET bearer) may
  // invoke. See _shared/ingest-auth.ts.
  if (!isAuthorizedIngest(req)) return json(401, { error: "unauthorized" });

  const OUTSTAND_API_KEY = Deno.env.get("OUTSTAND_API_KEY");
  if (!OUTSTAND_API_KEY) return json(503, { error: "outstand_not_configured" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();

  // 1. Posts younger than 8 days (since they actually PUBLISHED — see
  // effectivePublishedAt below) are still maturing.
  //
  // The filter below is a COARSE PRE-FILTER on `created_at`, not the real
  // 8-day maturation boundary — the real boundary is enforced per-row in
  // code (step 2, via effectivePublishedAt + milestonesDue), because
  // PostgREST has no way to express `coalesce(published_at, verified_at,
  // created_at)` in a `.gte()` filter without a generated column/migration.
  // Why `created_at` alone isn't safe as the SQL-side filter:
  // useSponsorshipAmplification's `scheduledAt` path inserts its
  // social_post_log row the moment Outstand ACCEPTS the schedule, not when
  // the post actually goes live — so `created_at` can predate the real
  // publish by the whole schedule lead time, and a tight `created_at`
  // cutoff would silently drop a long-lead post out of this query entirely
  // (never measured, no error, no counter). There is no product-enforced
  // maximum lead time for amplification's `scheduledAt` specifically; the
  // nearest documented precedent is the general-compose flow's
  // `SCHEDULE_MAX_DAYS = 30` (src/components/outstand/CustomComposeForm.tsx).
  // Reusing that number here widens the floor enough to cover any lead time
  // the product already allows elsewhere. A post scheduled further out than
  // that still falls outside this window — a known, bounded gap, not a
  // silent one — and the per-row check below still correctly no-ops on the
  // (majority) rows this widening re-fetches that were already fully
  // settled, at the cost of some wasted reads, never a wrong answer.
  const SCHEDULE_LEAD_BUFFER_DAYS = 30;
  const cutoff = new Date(now.getTime() - (8 + SCHEDULE_LEAD_BUFFER_DAYS) * 24 * 60 * 60 * 1000).toISOString();

  // PAGE the query. PostgREST silently truncates an unbounded .select() at its
  // default page size, so past that limit the job would quietly measure only
  // the first page and skip the rest — no error, just posts that never get
  // metrics. Mirrors account-metrics-capture's pagination exactly.
  const PAGE = 500;
  const posts: PostRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: postsErr } = await admin
      .from("social_post_log")
      .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, format, source_brief_id, created_at, published_at, verified_at")
      // Only measure what a signed Outstand event confirmed. An unstamped row is
      // client-asserted: its outstand_post_id was never checked by anything, and
      // fetching it would spend an org-wide-key API call on a post we cannot tie to
      // this user. Counted below rather than silently dropped.
      .not("verified_at", "is", null)
      .gte("created_at", cutoff)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (postsErr) {
      console.error("[capture] social_post_log fetch failed", postsErr.message);
      return json(500, { error: "db_read_failed" });
    }
    posts.push(...((page ?? []) as PostRow[]));
    if (!page || page.length < PAGE) break;
  }

  // Excluded by the gate above, in the same (coarse, created_at-based) window.
  // A filter that hides rows without saying so is the failure mode this whole
  // sub-project exists to remove — queried separately rather than fetched,
  // since we only need the count.
  const { count: unverifiedCount, error: unverifiedErr } = await admin
    .from("social_post_log")
    .select("id", { count: "exact", head: true })
    .is("verified_at", null)
    .gte("created_at", cutoff);
  if (unverifiedErr) {
    console.warn("[capture] unverified-row count failed", unverifiedErr.message);
  }

  let inserted = 0, skipped = 0, fetchErrors = 0, insertErrors = 0, skippedForTime = 0;
  const unmeasured: Record<string, number> = {};

  const deadline = Date.now() + RUN_BUDGET_MS;
  for (const p of posts) {
    if (Date.now() > deadline) {
      skippedForTime++;
      continue;
    }

    // 2. Which milestones already captured for THIS post+platform? Scoped by
    // platform too, matching the row grain below — an unscoped query would
    // see platform A's already-inserted '24h' row while processing platform
    // B's social_post_log row (same outstand_post_id) and wrongly treat B's
    // '24h' as already captured, reproducing the exact defect this task
    // fixes one layer down.
    const { data: existing, error: existingErr } = await admin
      .from("content_performance")
      .select("milestone")
      .eq("outstand_post_id", p.outstand_post_id)
      .eq("platform", p.platform);
    if (existingErr) {
      // Not fatal — the upsert below is onConflict+ignoreDuplicates, so treating
      // every milestone as due again just re-fetches Outstand and no-ops on
      // insert. Logged so a failing read doesn't burn API budget invisibly.
      console.warn(`[capture] captured-milestones read failed: postId=${p.outstand_post_id} platform=${p.platform}`, existingErr.message);
    }
    const captured = new Set<Milestone>((existing ?? []).map((r) => r.milestone as Milestone));

    // Age from when the post actually PUBLISHED, not when its social_post_log
    // row was created — see effectivePublishedAt's doc comment in capture.ts.
    // For an amplification row scheduled days ahead, created_at is schedule-
    // ACCEPT time; using it here made the first capture after the real publish
    // believe the post was already days old and fire every milestone at once.
    const due = milestonesDue(effectivePublishedAt(p), now, captured);
    if (due.length === 0) { skipped++; continue; }

    // 3. Fetch analytics once; reuse for every due milestone this run.
    // Signal mirrors account-metrics-capture's identical call (15s) — without
    // it a single hung fetch stalls straight past RUN_BUDGET_MS, since the
    // deadline is only re-checked BETWEEN posts, never during one. A timeout
    // throws and lands in the catch below like any other fetch failure —
    // counted as fetchErrors, never crashing the run.
    let payload: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`${OUTSTAND_BASE_URL}/posts/${p.outstand_post_id}/analytics`, {
        headers: { Authorization: `Bearer ${OUTSTAND_API_KEY}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn(`[capture] Outstand analytics fetch failed: postId=${p.outstand_post_id} status=${res.status}`);
        fetchErrors++; continue;
      }
      const body = await res.json().catch(() => null);
      payload = (body?.data ?? body) as Record<string, unknown> | null;
    } catch (e) {
      console.warn(`[capture] Outstand analytics fetch threw: postId=${p.outstand_post_id}`, e);
      fetchErrors++; continue;
    }
    if (!payload) {
      console.warn(`[capture] Outstand analytics returned empty payload: postId=${p.outstand_post_id}`);
      fetchErrors++; continue;
    }

    // Outstand returns all-zero aggregated_metrics for three DIFFERENT unmeasured
    // states, only one of which sets metrics_error (spec §0b, vendor-confirmed).
    // Writing those zeros would be indistinguishable from a real zero-engagement
    // post and would silently poison every downstream aggregate. Skip and count.
    const verdict = classifyMeasurement(payload);
    if (!verdict.measured) {
      unmeasured[verdict.state] = (unmeasured[verdict.state] ?? 0) + 1;
      console.warn(
        `[capture] unmeasured post: postId=${p.outstand_post_id} state=${verdict.state}` +
        (verdict.reason ? ` reason=${verdict.reason}` : ''),
      );
      continue;
    }

    // Read THIS platform's own metrics_by_account[] entry, never the
    // cross-account aggregated_metrics -- Outstand sums the aggregate across
    // every connected account on the post, so using it per-platform would
    // make every fanned-out platform's row claim the whole post's engagement
    // (the "worse than a drop" half of Task 11). classifyMeasurement already
    // confirmed SOME account on this post was measured; metricsForPlatform can
    // still legitimately return null for THIS platform (its own entry is
    // state 1/3, or classification matched a different account) -- same "no
    // reading" as any other unmeasured skip, never write a fabricated row.
    const m = metricsForPlatform(payload, p.platform);
    if (!m) {
      unmeasured['no_platform_metrics'] = (unmeasured['no_platform_metrics'] ?? 0) + 1;
      // classifyMeasurement already said SOME account was measured, so this
      // is a fixable integration gap (e.g. a platform-vocabulary mismatch
      // between social_post_log.platform and Outstand's network), not
      // routine vendor noise -- naming the cause turns the warning from
      // visible into actionable (fix round 1, coordinator review).
      const reason = reasonForPlatform(payload, p.platform);
      console.warn(
        `[capture] no per-platform metrics: postId=${p.outstand_post_id} platform=${p.platform}` +
        (reason ? ` reason=${reason}` : ''),
      );
      continue;
    }
    const rows = due.map((milestone) => ({
      social_post_log_id: p.id,
      user_id: p.user_id,
      campaign_id: p.campaign_id,
      source_brief_id: p.source_brief_id,
      outstand_post_id: p.outstand_post_id,
      platform: p.platform,
      post_type: p.post_type,
      format: p.format,
      ...m,
      raw: payload,
      milestone,
      is_settled: milestone === "7d",
    }));

    // 4. Idempotent insert (unique index drops dupes from overlapping runs).
    // ignoreDuplicates + .select() returns ONLY the rows actually inserted, so a
    // re-run over already-captured milestones correctly reports inserted=0.
    const { data: insRows, error: insErr } = await admin
      .from("content_performance")
      .upsert(rows, { onConflict: "outstand_post_id,platform,milestone", ignoreDuplicates: true })
      .select("id");
    if (insErr) {
      console.error(`[capture] content_performance insert failed: postId=${p.outstand_post_id}`, insErr.message);
      insertErrors++; continue;
    }
    inserted += insRows?.length ?? 0;
  }

  if ((unverifiedCount ?? 0) > 0) {
    console.warn(`[capture] ${unverifiedCount} unverified row(s) in window — excluded, never measured`);
  }

  // A total attribution blackout (classifyMeasurement said "measured" but
  // metricsForPlatform found no reading for THIS platform on every one of
  // them) is a fixable integration bug, not routine vendor noise -- e.g. a
  // platform-vocabulary mismatch (donny_scheduled_posts.platform allows
  // 'twitter'; Outstand's network is 'x') would silently blackout that
  // platform for its whole 8-day measurement window. isCaptureRunFailed
  // deliberately does NOT fold this in (fix round 1, coordinator review):
  // a partial blackout alongside real inserts is still a run that made
  // progress and must stay 200, but it must not read as clean either.
  const noPlatformMetricsCount = unmeasured['no_platform_metrics'] ?? 0;
  if (noPlatformMetricsCount > 0) {
    console.error(
      `[capture] ${noPlatformMetricsCount} post(s) had a measured payload but no reading for ` +
      `their own platform (no_platform_metrics) — check for a platform-vocabulary mismatch ` +
      `between social_post_log.platform and Outstand's network field`,
    );
  }

  const summary = {
    posts: posts.length,
    inserted,
    skipped,
    skippedForTime,
    fetchErrors,
    insertErrors,
    unmeasured,
    unverified: unverifiedCount ?? null,
  };

  // A run that saw posts, had inserts fail, and inserted NOTHING is otherwise
  // indistinguishable from a clean run to the cron, which fires-and-forgets
  // net.http_post and reads no response body. That is exactly the shape a
  // deploy-before-migration mistake produces (every insert rejected). Report
  // it as a failure so anything that DOES check the response (or the pg_net
  // response log) can see it — a genuinely empty run still returns 200.
  if (isCaptureRunFailed({ postsSeen: posts.length, inserted, insertErrors })) {
    console.error(
      `[capture] run failed: posts=${posts.length} inserted=0 insertErrors=${insertErrors} ` +
      `fetchErrors=${fetchErrors} skipped=${skipped} skippedForTime=${skippedForTime}`,
    );
    return json(500, { ok: false, ...summary });
  }

  return json(200, { ok: true, ...summary });
});
