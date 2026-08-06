// reconcile-social-posts — scheduled (cron-invoked) sweep.
//
// outstand-webhook is the ONLY writer of social_post_log (see its
// recordPublishedPost). Every publish path writes its donny_scheduled_posts
// row AFTER the Outstand publish call returns, so a fast webhook delivery can
// beat that write, find no matching schedule row, and — since Outstand does
// not retry a 200 response — the post is permanently unmeasured. A webhook
// outage loses every post published during it, with no recovery.
//
// This function asks Outstand directly what published (GET /v1/posts,
// paginated) and re-drives the SAME matching logic recordPublishedPost
// applies, this time reading `status: 'published'` off the provider's own
// response instead of waiting for a delivery. It fixes DELIVERY ORDER, not
// ownership: a post with no matching donny_scheduled_posts row is counted
// (`unmatched`) and skipped, never synthesized from provider data. See
// reconcile.ts's header comment and
// .superpowers/sdd/2026-08-06-amplification-reconciliation/task-3-brief.md.
//
// Auth: cron passes Bearer <SUPABASE_SERVICE_ROLE_KEY> (the injected service/
// sb_secret key), exactly like content-performance-capture. verify_jwt=false;
// we check the bearer ourselves via isAuthorizedIngest.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OUTSTAND_API_KEY,
//      OUTSTAND_BASE_URL (defaults to https://api.outstand.so/v1)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  derivePublishedPlatforms,
  platformsToReconcile,
  pickScheduleMatch,
  resolvePublishedAt,
  isWithinActionWindow,
  withoutOwnerConflicts,
  type ProviderPost,
  type ExistingLogRow,
  type ScheduleCandidate,
} from "./reconcile.ts";
import { buildSocialPostLogRow, isGenuineScheduleAmbiguity } from "../_shared/social-post-log-row.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";

// Mirrors content-performance-capture's RUN_BUDGET_MS exactly. Every post's
// upsert happens as it's decided, so an early exit keeps everything reconciled
// so far — the next run picks up where this one left off (the window looks
// back further than any plausible run cadence, so nothing between runs is lost).
const RUN_BUDGET_MS = 60_000;

// Every provider fetch (list pages) gets this timeout — same value
// content-performance-capture uses for its per-post analytics fetch.
const FETCH_TIMEOUT_MS = 15_000;

// How far back to ask Outstand for posts. The brief asks to mirror
// content-performance-capture's 8-day measurement window unless there's a
// reason not to — there is one, and it's the SAME reason capture.ts documents
// for its own coarse created_at filter: `created_after` here maps to
// Outstand's post.createdAt, which for a post scheduled ahead of time is
// schedule-ACCEPT time, not publish time. A post scheduled up to
// SCHEDULE_LEAD_BUFFER_DAYS out (mirroring capture.ts's identical constant,
// itself sourced from CustomComposeForm's SCHEDULE_MAX_DAYS=30) that
// published within the last 8 days would otherwise fall outside an 8-day
// `created_after` cutoff and never be considered. Reusing capture.ts's exact
// buffer widens the floor enough to cover any lead time the product allows.
const RECONCILE_WINDOW_DAYS = 8;
const SCHEDULE_LEAD_BUFFER_DAYS = 30;

// GET /v1/posts accepts limit 1-100 (default 50); paginate at the max to
// minimize round trips against RUN_BUDGET_MS.
const PAGE_LIMIT = 100;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

interface FetchPostsPageResult {
  posts: ProviderPost[];
  ok: boolean;
}

/**
 * One page of GET /v1/posts. Defensively accepts either `posts` or `data` as
 * the array key: the `@outstand-so/ui` SDK's own usePosts() hook types its
 * refetch result as `{ posts, pagination }` (no `data` key), which is
 * stronger evidence than the vendor's own docs — this provider's docs have
 * already diverged from its behavior more than once (content-performance-
 * capture's header + capture.ts carry two such examples). `posts` is
 * preferred; `data` is a defensive fallback, never silently dropped.
 *
 * Each list item already carries a full `socialAccounts[]` — verified via
 * outstand-proxy's filterListBody/extractSocialAccountIds, existing
 * production code that reads `.socialAccounts` directly off `/posts` list
 * items to enforce per-tenant scoping — so no per-post GET /v1/posts/{id}
 * detail call is needed here.
 */
async function fetchPostsPage(apiKey: string, createdAfterIso: string, offset: number): Promise<FetchPostsPageResult> {
  const url = `${OUTSTAND_BASE_URL}/posts?created_after=${encodeURIComponent(createdAfterIso)}&limit=${PAGE_LIMIT}&offset=${offset}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[reconcile] Outstand posts fetch failed: status=${res.status} offset=${offset}`);
      return { posts: [], ok: false };
    }
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    const items = Array.isArray(body?.posts)
      ? body!.posts
      : Array.isArray(body?.data)
        ? body!.data
        : [];
    return { posts: items as ProviderPost[], ok: true };
  } catch (e) {
    console.warn(`[reconcile] Outstand posts fetch threw: offset=${offset}`, e);
    return { posts: [], ok: false };
  }
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
  const cutoff = new Date(
    now.getTime() - (RECONCILE_WINDOW_DAYS + SCHEDULE_LEAD_BUFFER_DAYS) * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Unit key for the summary below, since this run mixes three grains and a
  // reader comparing across them will draw the wrong conclusion otherwise:
  //   posts:     postsScanned, malformedPosts, noPublishedPlatforms,
  //              budgetTruncated, ambiguousMatches, postProcessingErrors
  //   platforms: platformsScanned, droppedAccounts, alreadyRecorded,
  //              newlyRecorded, unmatched, staleSkipped, scheduleLookupErrors,
  //              upsertErrors, ownerConflicts
  //   pages:     pagesFetched, fetchErrors, existingLookupErrors
  // platformsScanned is the platform-grain denominator (Important 2 review):
  // compare unmatched/newlyRecorded/etc against IT, never against postsScanned.
  let postsScanned = 0;
  let platformsScanned = 0;
  let alreadyRecorded = 0;
  let newlyRecorded = 0;
  let unmatched = 0;
  let fetchErrors = 0;
  let budgetTruncated = 0;
  // Beyond the brief's required counter set: DB-side failures are skips too
  // (Global Constraint: "every skip must increment a visible counter"), and
  // conflating them with provider fetchErrors would hide which side failed.
  let scheduleLookupErrors = 0;
  let existingLookupErrors = 0;
  let upsertErrors = 0;
  let ambiguousMatches = 0;
  // Defense-in-depth beyond the brief's minimum: donny_scheduled_posts' own
  // INSERT policy doesn't constrain metadata, so (same residual the webhook
  // already carries — see reconcile.ts's isWithinActionWindow/
  // withoutOwnerConflicts comments) a forged schedule row is a possible
  // input. These two counters name the cases this sweep refuses to act on
  // rather than resolving silently. Not a new authority: nowhere does this
  // sweep read an owner from anywhere other than a donny_scheduled_posts row.
  let staleSkipped = 0;
  let ownerConflicts = 0;
  // Provider-response defensiveness (review round 1): a null/non-object
  // element anywhere in a provider array must never be a silent skip.
  // malformedPosts: raw page.posts entries filtered out before processing
  // (null/non-object, or missing a usable string id). droppedAccounts: same
  // class of entry inside a post's own socialAccounts[], plus a published
  // account with no usable network (mirrors outstand-webhook's `dropped`).
  // noPublishedPlatforms: a scanned post that yielded zero published
  // platforms — routine for a still-pending post, but if Outstand ever
  // renames a field this number (not the all-zeros summary alone) is what
  // would reveal a totally broken run instead of a healthy quiet one.
  // postProcessingErrors: the try/catch safety net below — anything NOT
  // already anticipated by the guards above still gets counted, never a
  // silent 500 that kills the whole run with no summary logged.
  let malformedPosts = 0;
  let droppedAccounts = 0;
  let noPublishedPlatforms = 0;
  let postProcessingErrors = 0;

  const deadline = Date.now() + RUN_BUDGET_MS;
  let offset = 0;
  let pagesFetched = 0;
  let stoppedPagingForBudget = false;
  let stoppedPagingForFetchError = false;

  for (;;) {
    if (Date.now() > deadline) { stoppedPagingForBudget = true; break; }

    const page = await fetchPostsPage(OUTSTAND_API_KEY, cutoff, offset);
    if (!page.ok) {
      fetchErrors++;
      // An offset-paginated list can't safely resume past a failed page —
      // the next page's contents are undefined without this one. Stop rather
      // than silently skip a slice of the window; the next scheduled run
      // re-covers the same window from offset 0.
      stoppedPagingForFetchError = true;
      break;
    }
    pagesFetched++;
    if (page.posts.length === 0) break;

    // Filter null/non-object entries (or ones missing a usable string id)
    // BEFORE anything reads .id off them. Critical 1 (review round 1):
    // Outstand is documented, elsewhere in this codebase, to sometimes
    // return an array containing a bare null element (capture.ts's
    // classifyMeasurement comment, outstand-webhook-lib.ts's parseAccounts,
    // outstand-proxy's extractSocialAccountIds all guard for it) — this
    // sweep was the one reader of this provider that did not. An unguarded
    // `page.posts.map((p) => p.id)` throws TypeError on such an element,
    // and since nothing wraps this loop in a try/catch above this point,
    // that would kill the ENTIRE run — every later post in this page, every
    // later page — with no summary logged (the summary is built after this
    // loop exits normally). Counted, never silent.
    const rawPosts = page.posts;
    const posts = rawPosts.filter(
      (p): p is ProviderPost =>
        !!p && typeof p === "object" && typeof (p as ProviderPost).id === "string" && (p as ProviderPost).id.length > 0,
    );
    malformedPosts += rawPosts.length - posts.length;

    postsScanned += posts.length;

    // Batch-read what we already have for this page's posts. A plain-column
    // .in() filter (never a JSON-path expression — see the per-post
    // donny_scheduled_posts lookup below for why that one stays per-post) at
    // PAGE_LIMIT=100 stays under the header-overflow threshold this codebase
    // has hit before with unbounded .in() calls.
    const pageIds = Array.from(new Set(posts.map((p) => p.id)));
    const existingByPost = new Map<string, ExistingLogRow[]>();
    if (pageIds.length > 0) {
      const { data: existingRows, error: existingErr } = await admin
        .from("social_post_log")
        .select("outstand_post_id, platform, verified_at, user_id")
        .in("outstand_post_id", pageIds);
      if (existingErr) {
        // Not fatal — the upsert below is a full upsert (not ignoreDuplicates),
        // so treating every platform as unrecorded just re-writes an identical
        // row for anything already correct. Logged so a failing read doesn't
        // burn provider/DB budget invisibly.
        console.warn("[reconcile] social_post_log batch read failed", existingErr.message);
        existingLookupErrors++;
      } else {
        for (const row of (existingRows ?? []) as Array<{ outstand_post_id: string; platform: string; verified_at: string | null; user_id: string }>) {
          const list = existingByPost.get(row.outstand_post_id) ?? [];
          list.push({ platform: row.platform, verifiedAt: row.verified_at, userId: row.user_id });
          existingByPost.set(row.outstand_post_id, list);
        }
      }
    }

    for (const post of posts) {
      if (Date.now() > deadline) { budgetTruncated++; continue; }
      // post.id is guaranteed a non-empty string here — filtered above.

      // Belt-and-suspenders beyond the null-element guards already inside
      // derivePublishedPlatforms/resolvePublishedAt (Critical 1, review
      // round 1): those close the SPECIFIC, previously-seen failure mode,
      // but this try/catch is the backstop for anything not yet anticipated
      // — this provider's docs have diverged from its behavior more than
      // once elsewhere in this codebase. Converts "whole run dies, no
      // summary logged" into "this one post is counted and skipped, the run
      // continues."
      try {
        const existingForPost = existingByPost.get(post.id) ?? [];
        const { platforms: published, droppedAccounts: postDropped } = derivePublishedPlatforms(post);
        droppedAccounts += postDropped;
        platformsScanned += published.length;

        if (published.length === 0) {
          // Routine for a still-pending post (most of a wide discovery
          // window's posts haven't published yet) — but see this counter's
          // declaration comment: it's the number that would reveal a
          // provider field-rename breaking every post's parse, which
          // alreadyRecorded/newlyRecorded/unmatched alone cannot.
          noPublishedPlatforms++;
          continue;
        }

        const missing = platformsToReconcile(post, existingForPost);
        // alreadyRecorded = platforms this post published to that were
        // already verified — i.e. everything platformsToReconcile did NOT
        // return.
        alreadyRecorded += published.length - missing.length;

        if (missing.length === 0) continue;

        // Bound ACTION (not discovery — see the fetch loop) to a recent
        // window. Narrows how long a forged donny_scheduled_posts row stays
        // exploitable through this repeatedly-re-scanning endpoint, and
        // there is no measurement value past content-performance-capture's
        // own 7d horizon anyway. See reconcile.ts's isWithinActionWindow.
        const resolvedPublishedAt = resolvePublishedAt(post);
        if (!isWithinActionWindow(resolvedPublishedAt, now, RECONCILE_WINDOW_DAYS)) {
          staleSkipped += missing.length;
          continue;
        }

        // Re-drive the SAME schedule lookup recordPublishedPost performs —
        // the one and only place ownership is read from, and it's always
        // read off OUR OWN table, never off the provider payload.
        const { data: schedRows, error: schedErr } = await admin
          .from("donny_scheduled_posts")
          .select("user_id, campaign_id, platform, caption, hashtags, content_type, scheduled_at, metadata, created_at")
          .eq("metadata->>outstand_post_id", post.id)
          .order("created_at", { ascending: true });

        if (schedErr) {
          console.error(`[reconcile] schedule lookup failed: postId=${post.id}`, schedErr.message);
          scheduleLookupErrors += missing.length;
          continue;
        }
        if (!schedRows || schedRows.length === 0) {
          // No schedule row: same "unmatched" outcome recordPublishedPost
          // returns for this case. NEVER resolve an owner any other way —
          // see this file's header comment and reconcile.ts's.
          unmatched += missing.length;
          continue;
        }
        // Fires only on a GENUINE disagreement between candidates, not
        // routine multi-platform fan-out (useSponsorshipAmplification
        // writes one row per platform for a single amplification, identical
        // apart from `platform`, which isGenuineScheduleAmbiguity
        // deliberately never compares). Before this check, amplification
        // tripped this on every delivery.
        if (schedRows.length > 1 && isGenuineScheduleAmbiguity(schedRows)) {
          console.warn(`[reconcile] ${schedRows.length} scheduled posts match ${post.id} — using oldest (created_at asc)`);
          ambiguousMatches++;
        }
        const sched = pickScheduleMatch(schedRows as ScheduleCandidate[]);
        if (!sched) { unmatched += missing.length; continue; }

        // Refuse to silently reassign an existing (unverified) row's owner —
        // see reconcile.ts's withoutOwnerConflicts.
        const { safe, conflicts } = withoutOwnerConflicts(missing, existingForPost, sched.user_id);
        if (conflicts.length > 0) {
          console.error(
            `[reconcile] owner conflict: postId=${post.id} platforms=${conflicts.join(",")} — ` +
            `existing row's owner differs from the matched schedule row's user_id, refusing to overwrite`,
          );
          ownerConflicts += conflicts.length;
        }
        if (safe.length === 0) continue;

        // Prefer the provider's own timestamp so a post reconciled some time
        // after it actually published (the whole point of this sweep) still
        // ages correctly for content-performance-capture's milestone math —
        // "now" is the last resort, not the first choice. verified_at is
        // always "now": that column means "when WE confirmed it", matching
        // outstand-webhook's identical `new Date().toISOString()`.
        const publishedAt = resolvedPublishedAt ?? now.toISOString();
        const verifiedAt = now.toISOString();
        const rows = safe.map((platform) => buildSocialPostLogRow(post.id, platform, publishedAt, sched, verifiedAt));

        const { error: upsertErr } = await admin
          .from("social_post_log")
          .upsert(rows, { onConflict: "outstand_post_id,platform" });
        if (upsertErr) {
          console.error(`[reconcile] social_post_log upsert failed: postId=${post.id}`, upsertErr.message);
          upsertErrors += rows.length;
          continue;
        }
        newlyRecorded += rows.length;
      } catch (e) {
        console.error(`[reconcile] unexpected error processing postId=${post.id}`, e);
        postProcessingErrors++;
      }
    }

    if (page.posts.length < PAGE_LIMIT) break; // last page
    offset += PAGE_LIMIT;
  }

  if (stoppedPagingForBudget) {
    console.warn(`[reconcile] budget exceeded before paging completed: offset=${offset} pagesFetched=${pagesFetched}`);
  }
  if (stoppedPagingForFetchError) {
    console.warn(`[reconcile] stopped paging after a fetch error: offset=${offset} pagesFetched=${pagesFetched}`);
  }

  const summary = {
    // posts
    postsScanned,
    malformedPosts,
    noPublishedPlatforms,
    budgetTruncated,
    ambiguousMatches,
    postProcessingErrors,
    // platforms — compare these against platformsScanned, never postsScanned
    platformsScanned,
    droppedAccounts,
    alreadyRecorded,
    newlyRecorded,
    unmatched,
    staleSkipped,
    scheduleLookupErrors,
    upsertErrors,
    ownerConflicts,
    // pages
    pagesFetched,
    fetchErrors,
    existingLookupErrors,
    windowStart: cutoff,
  };

  // A quiet run — nothing missing — is success, per the brief. The one shape
  // that must NOT read as healthy: we never even reached Outstand (every page
  // fetch failed) despite being asked to. That's worth a 500 so anything that
  // checks the response (or the pg_net response log) can see it, mirroring
  // content-performance-capture's isCaptureRunFailed canary for the
  // deploy-before-migration failure class.
  if (pagesFetched === 0 && fetchErrors > 0) {
    console.error("[reconcile] run failed: could not fetch even one page from Outstand", summary);
    return json(500, { ok: false, ...summary });
  }

  return json(200, { ok: true, ...summary });
});
