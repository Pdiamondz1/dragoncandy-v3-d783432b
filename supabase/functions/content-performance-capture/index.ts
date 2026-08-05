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
import { milestonesDue, normalizeAnalytics, classifyMeasurement, type Milestone } from "./capture.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
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

  // 1. Posts younger than 8 days are still maturing.
  const cutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts, error: postsErr } = await admin
    .from("social_post_log")
    .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, source_brief_id, created_at")
    .gte("created_at", cutoff);
  if (postsErr) return json(500, { error: "enumerate_failed", detail: postsErr.message });

  let inserted = 0, skipped = 0, fetchErrors = 0, insertErrors = 0;
  const unmeasured: Record<string, number> = {};

  for (const p of posts ?? []) {
    // 2. Which milestones already captured for this post?
    const { data: existing } = await admin
      .from("content_performance")
      .select("milestone")
      .eq("outstand_post_id", p.outstand_post_id);
    const captured = new Set<Milestone>((existing ?? []).map((r) => r.milestone as Milestone));

    const due = milestonesDue(new Date(p.created_at), now, captured);
    if (due.length === 0) { skipped++; continue; }

    // 3. Fetch analytics once; reuse for every due milestone this run.
    let payload: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`${OUTSTAND_BASE_URL}/posts/${p.outstand_post_id}/analytics`, {
        headers: { Authorization: `Bearer ${OUTSTAND_API_KEY}`, Accept: "application/json" },
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

    const m = normalizeAnalytics(payload);
    const rows = due.map((milestone) => ({
      social_post_log_id: p.id,
      user_id: p.user_id,
      campaign_id: p.campaign_id,
      source_brief_id: p.source_brief_id,
      outstand_post_id: p.outstand_post_id,
      platform: p.platform,
      post_type: p.post_type,
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
      .upsert(rows, { onConflict: "outstand_post_id,milestone", ignoreDuplicates: true })
      .select("id");
    if (insErr) {
      console.error(`[capture] content_performance insert failed: postId=${p.outstand_post_id}`, insErr.message);
      insertErrors++; continue;
    }
    inserted += insRows?.length ?? 0;
  }

  return json(200, { ok: true, posts: posts?.length ?? 0, inserted, skipped, fetchErrors, insertErrors, unmeasured });
});
