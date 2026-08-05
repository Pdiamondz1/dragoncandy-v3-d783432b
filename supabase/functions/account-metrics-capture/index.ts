// account-metrics-capture — scheduled (cron-invoked) account-level analytics.
//
// The sibling of content-performance-capture: that one matures PER-POST metrics
// from social_post_log; this one snapshots PER-ACCOUNT metrics (followers,
// engagement, reach, posts) into social_analytics_cache.
//
// WHY THIS EXISTS
// ---------------
// Account metrics were populated ONLY as a side effect of a human opening the
// Analytics tab (useAccountMetrics is a client-side React Query hook). So Donny —
// which is supposed to reason over performance proactively — could only ever see
// data for accounts someone had happened to browse, and `social_analytics_cache`
// sat at 0 rows. A dashboard that fills itself when watched is not a data source.
//
// Auth: cron passes Bearer <SUPABASE_SERVICE_ROLE_KEY> (or AIOS_INGEST_SECRET).
//       verify_jwt=false; we check the bearer ourselves. Mirrors
//       content-performance-capture exactly.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OUTSTAND_API_KEY,
//      OUTSTAND_BASE_URL (defaults to https://api.outstand.so/v1)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";
import { getAnalyticsWindow, type TimeRange } from "../_shared/analytics-window.ts";
import { resolveProviderId } from "../_shared/social-provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";

// Only the ranges the UI actually offers. Writing a window nobody queries would
// reproduce the write-only-cache bug this job exists downstream of.
const RANGES: TimeRange[] = ["7d", "30d", "90d"];

// Outstand's rate limits are dynamic and scale with connected accounts, so stay
// modest rather than assuming headroom. NOTE: content-performance-capture is
// fully sequential, so this job is the first to issue PARALLEL calls on the
// shared OUTSTAND_API_KEY — if the two ever overlap, that changes the load the
// key sees. Keep this low, and lower it before raising account volume.
const CONCURRENCY = 5;

// Hard wall-clock budget. Worst case per unit is the 15s fetch timeout, so at
// N accounts x 3 ranges / CONCURRENCY the run grows linearly and will eventually
// exceed the platform's edge-function limit. Each unit upserts as it succeeds
// rather than batching to the end, so stopping early keeps everything already
// captured — but bail deliberately with a logged summary instead of being killed
// mid-run with no record of how far we got.
const RUN_BUDGET_MS = 60_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function mapWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  let i = 0;
  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= items.length) return;
    await fn(items[idx]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

interface AccountRow {
  user_id: string;
  outstand_social_account_id: string;
  platform: string;
  provider: string | null;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!isAuthorizedIngest(req)) return json(401, { error: "unauthorized" });

  const OUTSTAND_API_KEY = Deno.env.get("OUTSTAND_API_KEY");
  if (!OUTSTAND_API_KEY) return json(503, { error: "outstand_not_configured" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();

  const { data: rows, error: rowsErr } = await admin
    .from("business_outstand_accounts")
    .select("user_id, outstand_social_account_id, platform, provider")
    .eq("status", "active");

  if (rowsErr) {
    console.error("account-metrics-capture: account fetch failed", rowsErr.message);
    return json(500, { error: "db_read_failed" });
  }

  // Account ids are only opaque WITHIN a provider, and this job talks to Outstand
  // directly with the org key. Skipping non-Outstand rows keeps us from asking
  // Outstand about an id that was never theirs.
  const allRows = (rows ?? []) as AccountRow[];
  const accounts = allRows.filter((r) => resolveProviderId(r.provider) === "outstand");

  // Say so when rows are skipped. A silent filter means a whole provider's
  // accounts could stop being captured with nothing anywhere to notice it —
  // "no rows appeared" would look identical to "no accounts connected".
  const skipped = allRows.length - accounts.length;
  if (skipped > 0) {
    console.warn(
      `account-metrics-capture: skipping ${skipped} non-Outstand account(s) — this job talks to Outstand directly and account ids are only opaque within a provider`,
    );
  }

  const deadline = Date.now() + RUN_BUDGET_MS;
  let captured = 0;
  let failed = 0;
  let skippedForTime = 0;
  const errors: Array<{ accountId: string; reason: string }> = [];

  await mapWithConcurrency(
    accounts,
    async (account) => {
      for (const range of RANGES) {
        if (Date.now() > deadline) {
          skippedForTime++;
          continue;
        }
        const { current } = getAnalyticsWindow(range, now);
        const since = Math.floor(current.start.getTime() / 1000);
        const until = Math.floor(current.end.getTime() / 1000);

        try {
          const res = await fetch(
            `${OUTSTAND_BASE_URL}/social-accounts/${account.outstand_social_account_id}/metrics?since=${since}&until=${until}`,
            {
              headers: { Authorization: `Bearer ${OUTSTAND_API_KEY}`, Accept: "application/json" },
              signal: AbortSignal.timeout(15_000),
            },
          );

          if (!res.ok) {
            failed++;
            const detail = `HTTP ${res.status}`;
            errors.push({ accountId: account.outstand_social_account_id, reason: detail });
            // Do NOT swallow. The client hook's `catch {}` is why an account
            // whose metrics never resolve looks identical to one with no data.
            console.error(
              `account-metrics-capture: ${account.outstand_social_account_id} (${range}) failed: ${detail}`,
            );
            continue;
          }

          const body = await res.json().catch(() => null);
          const payload = (body?.data ?? body) as Record<string, unknown> | null | undefined;

          // A 200 with an unparseable or empty body must be a FAILURE, never a
          // row of zeros. Without this check `{}` flows through the `??` chain
          // below and every metric silently becomes 0 — fabricated data, written
          // and counted as captured, in the exact table Donny reasons over.
          //
          // This is the same conflation that cost this project weeks: an absent
          // measurement read as a measured zero. A post with no views IS 0; a
          // response with no fields is NOT.
          if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
            failed++;
            const reason = "empty_or_unparseable_payload";
            errors.push({ accountId: account.outstand_social_account_id, reason });
            console.error(
              `account-metrics-capture: ${account.outstand_social_account_id} (${range}) ${reason}`,
            );
            continue;
          }

          const m = payload as Record<string, number>;

          // Field fallbacks mirror useAccountMetrics so the cron and the browser
          // agree on what a metric means. Outstand's per-network coverage varies
          // (YouTube reports no reach, TikTok no date range), so 0 here can be a
          // genuine "not reported by this platform" rather than a measured zero.
          const followers = m.followers ?? m.followerCount ?? 0;
          const engagement = m.engagementRate ?? 0;
          const reach = m.reach ?? m.impressions ?? 0;
          const posts = m.postsCount ?? 0;

          const base = {
            user_id: account.user_id,
            outstand_account_id: account.outstand_social_account_id,
            platform: account.platform ?? "unknown",
            period_start: current.start.toISOString(),
            period_end: current.end.toISOString(),
            fetched_at: new Date().toISOString(),
          };

          // metric_type values are the LIVE table contract — followers | engagement
          // | reach | posts. Not `engagement_rate`: a different string would fail to
          // conflict-match the existing rows and silently duplicate instead of update.
          const { error: upsertErr } = await admin.from("social_analytics_cache").upsert(
            [
              { ...base, metric_type: "followers", metric_value: followers },
              { ...base, metric_type: "engagement", metric_value: engagement },
              { ...base, metric_type: "reach", metric_value: reach },
              { ...base, metric_type: "posts", metric_value: posts },
            ],
            { onConflict: "user_id,outstand_account_id,metric_type,period_start,period_end" },
          );

          if (upsertErr) {
            failed++;
            errors.push({ accountId: account.outstand_social_account_id, reason: upsertErr.message });
            console.error("account-metrics-capture: upsert failed", upsertErr.message);
            continue;
          }

          captured++;
        } catch (e) {
          failed++;
          const reason = e instanceof Error ? e.message : String(e);
          errors.push({ accountId: account.outstand_social_account_id, reason });
          console.error(
            `account-metrics-capture: ${account.outstand_social_account_id} (${range}) threw: ${reason}`,
          );
        }
      }
    },
    CONCURRENCY,
  );

  console.log(
    `account-metrics-capture: ${accounts.length} accounts x ${RANGES.length} ranges -> ` +
      `${captured} captured, ${failed} failed, ${skippedForTime} skipped (budget)`,
  );

  return json(200, {
    status: "ok",
    accounts: accounts.length,
    ranges: RANGES.length,
    captured,
    failed,
    skipped_non_outstand: skipped,
    skipped_for_time: skippedForTime,
    errors: errors.slice(0, 20),
  });
});
