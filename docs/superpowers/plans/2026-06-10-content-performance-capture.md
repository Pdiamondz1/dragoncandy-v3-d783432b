# Content-Performance Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture per-post social-media performance (views/likes/reach/engagement) into a new append-only Supabase table on a daily schedule, so Donny's future content-strategy recommender has a real signal to learn from — and light up the orphaned account-level dashboard as a free add-on.

**Architecture:** Ledger-first. A `content_performance` table + RLS lands and is verified before any capture code. A `content-performance-capture` Deno edge function enumerates recently-published posts from `social_post_log`, pulls Outstand's `/posts/{id}/analytics` directly (service-role, org key — no proxy), and inserts maturation snapshots (T+24h/72h/7d) idempotently. A **Vault-based** `pg_cron` job fires it daily (the repo's `app.settings` GUC cron pattern is dead in prod, so we deliberately avoid it). Pure capture logic is split into a dependency-free module so it's Vitest-testable, mirroring `outstand-reconcile/reconcile.ts`.

**Tech Stack:** Supabase Postgres + RLS, `pg_cron` + `pg_net` + Vault, Deno edge function (`esm.sh` supabase-js), Vitest for the pure logic. Outstand REST API (flat-fee; no Claude/OpenAI calls → outside the 15%-of-revenue AI cap).

**Spec:** `docs/superpowers/specs/2026-06-10-content-performance-capture-design.md`

**Environments:** staging `mhffqrawgizhprbobcta` → prod `zocahiffooqdybdhguqv`. Always staging-first.

---

## File Structure

| Path | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/20260610140000_content_performance.sql` | The `content_performance` table, indexes, RLS (read-own, no user writes) | Create |
| `supabase/functions/content-performance-capture/capture.ts` | **Pure, I/O-free** logic: `milestonesDue()` + `normalizeAnalytics()`. No Deno/Node/Supabase imports. | Create |
| `supabase/functions/content-performance-capture/capture.test.ts` | Vitest unit tests for `capture.ts` | Create |
| `supabase/functions/content-performance-capture/index.ts` | Deno entry: auth gate → enumerate → fetch Outstand → insert snapshots → summary | Create |
| `supabase/config.toml` | Register `content-performance-capture` with `verify_jwt = false` | Modify |
| `supabase/migrations/20260610150000_content_performance_capture_cron.sql` | Vault-based `pg_cron` daily schedule | Create |
| `docs/wiki/entities/outstand.md` + `docs/wiki/analyses/content-engine-data-audit.md` | Wiki flag: `toast-token-refresh` dead-GUC cron likely not running in prod | Modify |

**Operational (no new files):** replay existing `20260508000000_social_analytics_cache.sql` + `20260509000000_fix_analytics_cache_columns.sql` onto prod (Task 6).

---

## Task 1: `content_performance` table + RLS (ledger-first — lands before any capture code)

**Files:**
- Create: `supabase/migrations/20260610140000_content_performance.sql`

- [ ] **Step 1: Write the migration**

```sql
-- content_performance — append-only per-post performance snapshots captured as
-- engagement matures (T+24h / T+72h / T+7d). Driven by social_post_log; written
-- only by the service-role capture loop (users cannot forge performance numbers).
create table if not exists public.content_performance (
  id                  uuid primary key default gen_random_uuid(),
  social_post_log_id  uuid references public.social_post_log(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid references public.campaigns(id),
  outstand_post_id    text not null,
  platform            text not null,
  post_type           text not null,
  views               numeric,
  likes               numeric,
  comments            numeric,
  shares              numeric,
  saves               numeric,
  reach               numeric,
  engagement_rate     numeric,
  raw                 jsonb not null default '{}'::jsonb,
  milestone           text not null check (milestone in ('24h','72h','7d')),
  is_settled          boolean not null default false,
  captured_at         timestamptz not null default now()
);

-- Append-only grain: at most one snapshot per post per milestone (idempotent re-runs).
create unique index if not exists uniq_content_perf_post_milestone
  on public.content_performance (outstand_post_id, milestone);

create index if not exists idx_content_perf_user
  on public.content_performance (user_id, captured_at);
create index if not exists idx_content_perf_campaign
  on public.content_performance (campaign_id);
create index if not exists idx_content_perf_post
  on public.content_performance (outstand_post_id);

alter table public.content_performance enable row level security;

-- Read: owner only (TO authenticated + ownership predicate — not role-only, which would be IDOR).
drop policy if exists "Users read own content performance" on public.content_performance;
create policy "Users read own content performance"
  on public.content_performance for select
  to authenticated
  using ( (select auth.uid()) = user_id );

-- No INSERT/UPDATE/DELETE policies: the only writer is the service-role capture
-- loop (bypasses RLS). This keeps the metric trustworthy.
```

- [ ] **Step 2: Apply to STAGING and verify structure**

Use Supabase MCP `execute_sql` against project `mhffqrawgizhprbobcta` with the SQL above. Then verify:

Run (MCP `execute_sql`, staging):
```sql
select column_name, data_type from information_schema.columns
where table_name = 'content_performance' order by ordinal_position;
```
Expected: 18 columns matching the migration.

- [ ] **Step 3: Run security advisors on staging**

Run: Supabase MCP `get_advisors` (type `security`) against staging.
Expected: no new ERROR-level findings for `content_performance`. If "RLS enabled but Data API exposure" or "table exposed without grant" appears, add an explicit `grant select on public.content_performance to authenticated;` to the migration and re-apply (read stays gated by the RLS policy). Resolve before proceeding.

- [ ] **Step 4: Prove RLS — owner sees own, others see none, nobody can insert**

Run (MCP `execute_sql`, staging) — seed one row as service-role, then test visibility:
```sql
-- service-role insert (bypasses RLS) should succeed:
insert into public.content_performance
  (user_id, outstand_post_id, platform, post_type, views, milestone)
  values ('00000000-0000-0000-0000-000000000001','TEST_POST','instagram','standalone',100,'24h');
-- confirm exactly one row, then clean up:
select count(*) from public.content_performance where outstand_post_id = 'TEST_POST';
delete from public.content_performance where outstand_post_id = 'TEST_POST';
```
Expected: insert succeeds, count = 1, cleanup removes it. (Full authenticated-user RLS proof happens in Task 7 against real seeded data.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610140000_content_performance.sql
git commit -m "feat(db): content_performance table + RLS (Content Engine Phase A keystone)"
```

---

## Task 2: Pure capture logic (TDD) — `capture.ts` + `capture.test.ts`

Mirrors `supabase/functions/outstand-reconcile/reconcile.ts`: **no Deno/Node/Supabase/I/O imports**, so Vitest runs it directly.

**Files:**
- Create: `supabase/functions/content-performance-capture/capture.ts`
- Test: `supabase/functions/content-performance-capture/capture.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { milestonesDue, normalizeAnalytics, type Milestone } from './capture';

const HOURS = 60 * 60 * 1000;
const at = (h: number) => new Date(Date.UTC(2026, 5, 10, 0, 0, 0) + h * HOURS);

describe('milestonesDue', () => {
  it('returns no milestones before 24h', () => {
    expect(milestonesDue(at(0), at(23), new Set())).toEqual([]);
  });
  it('returns 24h once the post is a day old', () => {
    expect(milestonesDue(at(0), at(25), new Set())).toEqual(['24h']);
  });
  it('returns all crossed-but-uncaptured milestones in order (handles a >1-day cron gap)', () => {
    expect(milestonesDue(at(0), at(200), new Set())).toEqual(['24h', '72h', '7d']);
  });
  it('skips milestones already captured', () => {
    expect(milestonesDue(at(0), at(200), new Set<Milestone>(['24h', '72h']))).toEqual(['7d']);
  });
  it('returns nothing once all milestones are captured', () => {
    expect(milestonesDue(at(0), at(500), new Set<Milestone>(['24h', '72h', '7d']))).toEqual([]);
  });
});

describe('normalizeAnalytics', () => {
  it('maps canonical Outstand fields', () => {
    const m = normalizeAnalytics({ views: 9100, likes: 380, comments: 12, shares: 4, saves: 7, reach: 8000, engagementRate: 4.3 });
    expect(m).toEqual({ views: 9100, likes: 380, comments: 12, shares: 4, saves: 7, reach: 8000, engagement_rate: 4.3 });
  });
  it('coalesces field-name variants and impressions→reach', () => {
    const m = normalizeAnalytics({ viewCount: 50, likeCount: 5, impressions: 200, engagement_rate: 1.1 });
    expect(m.views).toBe(50);
    expect(m.likes).toBe(5);
    expect(m.reach).toBe(200);
    expect(m.engagement_rate).toBe(1.1);
  });
  it('returns nulls for missing metrics (never throws on a sparse payload)', () => {
    const m = normalizeAnalytics({});
    expect(m).toEqual({ views: null, likes: null, comments: null, shares: null, saves: null, reach: null, engagement_rate: null });
  });
});
```

- [ ] **Step 2: Run tests, verify they FAIL**

Run: `npx vitest run supabase/functions/content-performance-capture/capture.test.ts`
Expected: FAIL — `./capture` has no such exports.

- [ ] **Step 3: Implement `capture.ts`**

```ts
// Pure, dependency-free capture logic. Imported by both the Deno edge function
// (index.ts) and the Vitest unit test, so it must NOT reference Deno, Node,
// Supabase, or any I/O.

export type Milestone = '24h' | '72h' | '7d';

const MILESTONE_HOURS: Record<Milestone, number> = { '24h': 24, '72h': 72, '7d': 168 };
const ORDER: Milestone[] = ['24h', '72h', '7d'];

/**
 * Milestones a post is due for: age past the threshold AND not yet captured.
 * "First observation after the threshold" semantics — with a once-daily cron a
 * post can cross two thresholds between runs, so all uncaptured-but-crossed
 * milestones are returned (in order) and inserted the first time observed.
 */
export function milestonesDue(
  createdAt: Date,
  now: Date,
  alreadyCaptured: Set<Milestone>,
): Milestone[] {
  const ageHours = (now.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
  return ORDER.filter((m) => ageHours >= MILESTONE_HOURS[m] && !alreadyCaptured.has(m));
}

export interface NormalizedMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  engagement_rate: number | null;
}

function pick(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Map Outstand's (unconfirmed, variant-prone) analytics payload to our columns.
 * Tolerant of field-name variants; the full payload is stored separately in `raw`
 * by the caller, so any unmapped metric is never lost.
 */
export function normalizeAnalytics(raw: Record<string, unknown>): NormalizedMetrics {
  const o = raw ?? {};
  return {
    views: pick(o, ['views', 'viewCount', 'video_views', 'plays']),
    likes: pick(o, ['likes', 'likeCount', 'like_count']),
    comments: pick(o, ['comments', 'commentCount', 'comment_count']),
    shares: pick(o, ['shares', 'shareCount', 'share_count']),
    saves: pick(o, ['saves', 'saveCount', 'saved']),
    reach: pick(o, ['reach', 'impressions', 'reachCount']),
    engagement_rate: pick(o, ['engagementRate', 'engagement_rate']),
  };
}
```

- [ ] **Step 4: Run tests, verify they PASS**

Run: `npx vitest run supabase/functions/content-performance-capture/capture.test.ts`
Expected: PASS — all 12 tests green. (NOTE: `vite.config.ts` excludes `supabase/**` by default; this task also adds a surgical carve-out so pure vitest-style edge-logic tests actually run — excluding only the Deno-style `_shared` tests by path.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/content-performance-capture/capture.ts supabase/functions/content-performance-capture/capture.test.ts
git commit -m "feat(capture): pure milestone + analytics-normalization logic with tests"
```

---

## Task 3: The capture edge function — `index.ts`

Self-contained (no `_shared` imports — avoids the MCP transitive-bundling gotcha). Authorizes via the service-role/`sb_secret` bearer the cron passes (matches `donny-knowledge-sync`).

**Files:**
- Create: `supabase/functions/content-performance-capture/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write `index.ts`**

```ts
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
import { milestonesDue, normalizeAnalytics, type Milestone } from "./capture.ts";

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

  // Auth gate — only the cron (service-role bearer) may invoke.
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${SERVICE_KEY}`) return json(401, { error: "unauthorized" });

  const OUTSTAND_API_KEY = Deno.env.get("OUTSTAND_API_KEY");
  if (!OUTSTAND_API_KEY) return json(503, { error: "outstand_not_configured" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();

  // 1. Posts younger than 8 days are still maturing.
  const cutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts, error: postsErr } = await admin
    .from("social_post_log")
    .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, created_at")
    .gte("created_at", cutoff);
  if (postsErr) return json(500, { error: "enumerate_failed", detail: postsErr.message });

  let inserted = 0, skipped = 0, fetchErrors = 0;

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
      if (!res.ok) { fetchErrors++; continue; }
      const body = await res.json().catch(() => null);
      payload = (body?.data ?? body) as Record<string, unknown> | null;
    } catch (_e) { fetchErrors++; continue; }
    if (!payload) { fetchErrors++; continue; }

    const m = normalizeAnalytics(payload);
    const rows = due.map((milestone) => ({
      social_post_log_id: p.id,
      user_id: p.user_id,
      campaign_id: p.campaign_id,
      outstand_post_id: p.outstand_post_id,
      platform: p.platform,
      post_type: p.post_type,
      ...m,
      raw: payload,
      milestone,
      is_settled: milestone === "7d",
    }));

    // 4. Idempotent insert (unique index drops dupes from overlapping runs).
    const { error: insErr, count } = await admin
      .from("content_performance")
      .upsert(rows, { onConflict: "outstand_post_id,milestone", ignoreDuplicates: true, count: "exact" });
    if (insErr) { fetchErrors++; continue; }
    inserted += count ?? rows.length;
  }

  return json(200, { ok: true, posts: posts?.length ?? 0, inserted, skipped, fetchErrors });
});
```

> **Post-review hardening (applied during execution — the committed file is canonical):**
> (1) The idempotent insert uses `.upsert(rows, { onConflict, ignoreDuplicates: true }).select("id")` and
> `inserted += insRows?.length ?? 0` — NOT `count: "exact"`. With `ignoreDuplicates` and no `.select()`,
> PostgREST returns no `count`, so the old `count ?? rows.length` overcounted on every run (incl.
> all-duplicate re-runs), breaking the idempotency signal. `.select()` returns only actually-inserted rows.
> (2) Added `console.warn` on all three Outstand-fetch failure paths (non-2xx, throw, empty payload) and a
> `console.error` on insert failure — first call to an unconfirmed endpoint, so failures must be diagnosable.
> Insert errors count in a separate `insertErrors` bucket; summary is `{ok, posts, inserted, skipped, fetchErrors, insertErrors}`.

- [ ] **Step 2: Register the function in `config.toml`**

Append to `supabase/config.toml`:
```toml
[functions.content-performance-capture]
verify_jwt = false
```

- [ ] **Step 3: Typecheck the pure module still compiles with the import**

Run: `npx vitest run supabase/functions/content-performance-capture/capture.test.ts`
Expected: PASS (unchanged — confirms the `./capture.ts` exports `index.ts` relies on are intact).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/content-performance-capture/index.ts supabase/config.toml
git commit -m "feat(capture): content-performance-capture edge function (cron-invoked, service-role)"
```

---

## Task 4: Vault-based `pg_cron` schedule

The repo's existing cron (`toast-token-refresh`) reads `current_setting('app.settings.*')` GUCs that are **unset in prod** → silently dead. This job reads the service key from **Vault** instead.

**Files:**
- Create: `supabase/migrations/20260610150000_content_performance_capture_cron.sql`

- [ ] **Step 1: Confirm Vault is available (both envs)**

Run (MCP `execute_sql`, staging then prod):
```sql
select extname from pg_extension where extname = 'supabase_vault';
```
Expected: one row. If absent, enable it (`create extension if not exists supabase_vault;`) before continuing — note this in the deploy checklist for prod too.

- [ ] **Step 2: Register the secret out-of-band (NOT committed) — staging first**

Run (MCP `execute_sql`, staging) with the staging service/`sb_secret` key:
```sql
select vault.create_secret('<STAGING_SERVICE_OR_SB_SECRET_KEY>', 'content_capture_key');
```
Expected: returns a uuid. (Repeat on prod during Task 7 deploy with the prod key.)

> ⚠️ Prerequisite gate: the cron produces a **null bearer** (and a silent 401) if `content_capture_key` doesn't exist — the exact failure this slice exists to escape. Do not run Step 3 until this secret exists in the target env.

- [ ] **Step 3: Write the cron migration**

```sql
-- Daily per-post performance capture. Vault-based (NOT the dead app.settings GUC
-- pattern). Requires: vault secret 'content_capture_key' = service/sb_secret key.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'content-performance-capture',
  '0 9 * * *',                         -- daily 09:00 UTC
  $$
  select net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/content-performance-capture',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                 from vault.decrypted_secrets
                                                 where name = 'content_capture_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
```

> The committed file uses the literal `PROJECT_REF` placeholder. When applying, substitute the env's ref: staging `mhffqrawgizhprbobcta`, prod `zocahiffooqdybdhguqv`. (Two envs, one file — substitute at apply time; do not hardcode prod into the committed migration.)

- [ ] **Step 4: Apply to STAGING and verify the job exists**

Apply via MCP `execute_sql` (staging, with the ref substituted). Then:
```sql
select jobname, schedule, active from cron.job where jobname = 'content-performance-capture';
```
Expected: one active row, schedule `0 9 * * *`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610150000_content_performance_capture_cron.sql
git commit -m "feat(db): Vault-based pg_cron for content-performance-capture"
```

---

## Task 5: Wiki flag — `toast-token-refresh` dead-GUC cron

Pure documentation (the loop's guardrail: code findings become wiki flags, not silent fixes).

**Files:**
- Modify: `docs/wiki/entities/outstand.md` (or `concepts/migration-replay-drift.md` if Outstand has no cron section — pick the page that already discusses cron/GUC drift)
- Modify: `docs/wiki/analyses/content-engine-data-audit.md`

- [ ] **Step 1: Add the flag to the data-audit analysis**

Under the audit's "Prod migration drift" section, append:
```markdown
- **`toast-token-refresh` cron likely dead in prod (flag, 2026-06-10).** It fires via
  `pg_cron` + `net.http_post` reading `current_setting('app.settings.supabase_url' / '.service_role_key')`
  — the same unset-GUC pattern recorded as silently dead in prod. Toast tokens may therefore not be
  refreshing. Not fixed here (Toast is deferred and additionally blocked on pending Toast API access);
  verify (`cron.job_run_details`) and migrate onto the Vault-cron recipe when Toast enablement resumes.
```

- [ ] **Step 2: Cross-reference from the chosen entity/concept page**

Add a one-line "Known Issues" bullet on the Outstand (or Migration Replay Drift) page pointing at the audit flag, and ensure `[[Content Engine Data Audit]]` resolves in `index.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/wiki/
git commit -m "docs(wiki): flag toast-token-refresh dead-GUC cron (likely not running in prod)"
```

---

## Task 6: Ship `social_analytics_cache` to prod (free add-on — operational, no new code)

The table exists in migrations but was never applied to prod, so `useAccountMetrics` silently no-ops there. Apply the existing migrations to **staging first to confirm clean replay, then prod**.

**Files:** none created — replays `20260508000000_social_analytics_cache.sql` + `20260509000000_fix_analytics_cache_columns.sql`.

- [ ] **Step 1: Check current state in both envs**

Run (MCP `execute_sql`, staging AND prod):
```sql
select to_regclass('public.social_analytics_cache') as exists;
```
Expected: staging likely non-null (already has it); **prod null** (the bug).

- [ ] **Step 2: Apply to prod**

Apply the two migration files' SQL via MCP `execute_sql` against prod `zocahiffooqdybdhguqv`. The `fix_analytics_cache_columns` migration `truncate`s then alters column types — harmless on an empty/new prod table.

- [ ] **Step 3: Verify + advisors**

Run (MCP `execute_sql`, prod):
```sql
select to_regclass('public.social_analytics_cache') as exists;
```
Expected: non-null. Then run MCP `get_advisors` (security) on prod; confirm no new ERROR findings for the table (it already ships user-scoped RLS).

- [ ] **Step 4: Commit (doc note only — migrations already exist)**

```bash
git commit --allow-empty -m "chore(db): replay social_analytics_cache onto prod (was never applied)"
```

---

## Task 7: End-to-end verification & deploy (staging → prod)

**Files:** none — deployment + verification.

- [ ] **Step 1: Deploy the edge function to STAGING**

Deploy `content-performance-capture` via MCP `deploy_edge_function` to staging. Bundle BOTH files (`index.ts`, `capture.ts`). Confirm a boot probe: `curl -s -X POST <staging-fn-url>` with no auth → expect `401 {"error":"unauthorized"}` (proves it booted and the auth gate works).

- [ ] **Step 2: Seed a real post + run capture manually (staging)**

Insert one `social_post_log` row with a **real** Outstand `outstand_post_id` (one that exists for a connected staging account) and `created_at` set ~25h in the past (so `24h` is due). Then invoke:
```bash
curl -s -X POST <staging-fn-url> -H "Authorization: Bearer <STAGING_SERVICE_KEY>"
```
Expected: `{"ok":true,"posts":>=1,"inserted":>=1,...}`. Inspect the inserted `content_performance` row — confirm metrics populated (or null with full `raw` if Outstand's shape differs) and `milestone='24h'`. **This is where the unconfirmed Outstand payload shape gets validated** — if fields land in `raw` but not the columns, adjust `normalizeAnalytics` field lists (Task 2) and redeploy.

- [ ] **Step 3: Prove idempotency + RLS (staging)**

Re-run the curl from Step 2 → `inserted:0` for that milestone (unique index held). Then, as an authenticated non-owner test user, `select * from content_performance` → 0 rows; as `anon` → 0 rows; as the owner → their row visible.

- [ ] **Step 4: Promote to PROD — secret, function, migrations, cron (in order)**

1. Register the prod Vault secret: `select vault.create_secret('<PROD_SERVICE_KEY>', 'content_capture_key');`
2. Apply `20260610140000_content_performance.sql` to prod; run `get_advisors`.
3. Deploy `content-performance-capture` to prod (both files); 401 boot probe.
4. Apply `20260610150000_..._cron.sql` to prod with ref `zocahiffooqdybdhguqv` substituted.

- [ ] **Step 5: Confirm the cron actually fires (prod) — the whole point**

After the next scheduled run (or trigger once manually via the curl), run (MCP `execute_sql`, prod):
```sql
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'content-performance-capture')
order by start_time desc limit 3;
```
Expected: a `succeeded` run (not the dead-GUC silence). If `social_post_log` has real recent posts, confirm `content_performance` rows appear.

- [ ] **Step 6: Confirm the free add-on in prod**

Load the creator `AnalyticsTab` in prod (test creator account). Confirm `social_analytics_cache` now persists:
```sql
select count(*) from public.social_analytics_cache;
```
Expected: > 0 after the dashboard loads (was permanently 0 before).

- [ ] **Step 7: Final build hygiene + tests**

Run: `npm run build`
Expected: green (backend + migrations only; no frontend change).
Run: `npx vitest run supabase/functions/content-performance-capture/capture.test.ts`
Expected: 12 passing.

- [ ] **Step 8: Commit any normalization adjustments + push the branch**

```bash
git add -A && git commit -m "test(capture): align normalizeAnalytics with verified Outstand payload" --allow-empty
git push -u origin feat/autoresearch-skill-slice1
```
Then open a PR (do not auto-merge; human ship gate per QA discipline).

---

## Definition of Done

- `content_performance` exists in **staging + prod** with read-own RLS and no user-write policies.
- `content-performance-capture` deployed to both envs; 401 without the service bearer; inserts real snapshots.
- Vault-based cron is **registered and verified firing** in prod (`cron.job_run_details` shows `succeeded`).
- `social_analytics_cache` exists in prod; dashboard persists.
- `toast-token-refresh` dead-GUC cron flagged in the wiki.
- `npm run build` green; `capture.test.ts` 8/8 passing.
- No frontend changes; no Claude/OpenAI calls; auth untouched.

## Post-merge

- Refresh the local main checkout (worktree workflow — `git -C "C:/GIT/dragoncandy-v3-d783432b" fetch origin && merge --ff-only origin/main`).
- This unblocks **Phase B** (Donny content-strategy recommender reading `content_performance`). Out of scope here.
