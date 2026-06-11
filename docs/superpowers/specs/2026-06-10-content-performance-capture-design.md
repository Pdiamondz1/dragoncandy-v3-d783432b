# Content-Performance Capture (Content Engine, Phase A keystone) — Design Spec

**Date:** 2026-06-10
**Status:** Approved Design
**Approach:** Foundation-first — pour the per-post performance signal before building any recommender
**Phase:** Content Engine Phase A, keystone sub-project (see `docs/wiki/analyses/content-engine-data-audit.md`)
**Prerequisites:** Outstand integration live (proxy + connected accounts); `social_post_log` populated on publish

---

## Overview

DragonCandy plans to have Donny recommend the **best content strategy** per restaurant / creator / brand
to increase ROI — so a creator can easily make content a given business will boost. The 2026-06-10 content-
engine data audit found that recommender is **not buildable today**: the signal it must learn from — *how
each published post actually performs* — does not exist in prod. `social_analytics_cache` was never migrated
to prod, Outstand's per-post analytics endpoint is proxied but never called, and `dragonshare_engagement`
has zero rows.

This slice pours that missing foundation. It is **backend-only and invisible to users** until Phase B
surfaces it. It does two things:

1. **Capture per-post performance over time.** A new append-only `content_performance` table plus a
   scheduled server-side loop that pulls Outstand's `/posts/{id}/analytics` for every recently-published
   post and snapshots it as it matures (T+24h, T+72h, T+7d). This is the learning substrate for the
   Phase B recommender — true to the [[Data Flywheel]] discipline ("log every brief, match, and campaign
   completion from Day 1").
2. **Light up the orphaned account-level dashboard (near-free add-on).** Ship the existing, never-applied
   `social_analytics_cache` migrations to prod so `useAccountMetrics` stops silently failing and the
   existing `AnalyticsTab` persists followers/engagement/reach with zero frontend change.

**What this deletes:** the silent write-failure of `useAccountMetrics` against a table that doesn't exist
in prod.
**What this simplifies:** one canonical performance home (`content_performance`) instead of a competing
`dragonshare_engagement` double-write.
**What it automates:** per-post signal capture on a schedule — the data flywheel starts turning before
1,000–5,000 campaigns accumulate.
**Keystrokes removed:** all of them — backend-only, no user-facing surface in this slice.

---

## Decisions locked (brainstorm, 2026-06-10)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keystone scope | **Per-post content performance** (not account rollups alone) | Account rollups are vanity/dashboard metrics; per-post is the actual signal a content-strategy recommender learns from. |
| Capture cadence | **Maturation snapshots** (append-only, T+24h/T+72h/T+7d) | Engagement accrues for days post-publish; the growth curve shows which content has "legs." Append-only preserves history. |
| Post scope | **All `post_type`s** (`amplification`, `cross_post`, `standalone`, `campaign`) | One loop covers every role; narrowing by role deletes value without simplifying. |
| Capture path | **Direct to Outstand** (not via `outstand-proxy`) | The proxy tenant-scopes *browser* callers via their JWT; the loop already knows ownership from `social_post_log`, so the proxy is pure friction. |
| Scheduler | **Vault-based `pg_cron`** | The repo's `app.settings.*` GUC cron pattern is dead in prod (GUCs unset); Vault avoids that dependency and becomes the known-good recipe. |
| `toast-token-refresh` cron bug | **Wiki flag only** (don't fix here) | Toast is deferred from v1; flag it so it's tracked and fixed when Toast enablement resumes. |
| `dragonshare_engagement` | **Deferred, not double-written** | `content_performance` is the single canonical home; DragonShare posts are covered via `post_type`. |

---

## Architecture & data flow

```
social_post_log                      ← driver: one row per published post
  (user_id, outstand_post_id,          (already written on publish; RLS user-scoped)
   platform, post_type, campaign_id,
   created_at)
        │  enumerate posts younger than 8 days that are due for a snapshot
        ▼
content-performance-capture          ← NEW scheduled edge fn (service-role)
        │  for each due post:
        │    GET https://api.outstand.so/v1/posts/{id}/analytics   (Bearer OUTSTAND_API_KEY)
        ▼
content_performance                  ← NEW append-only snapshot table
  (outstand_post_id, captured_at, milestone, views, likes, …, raw)
```

Triggered by a **Vault-based `pg_cron`** job firing the function once daily.

### Why direct-to-Outstand, not through the proxy
`outstand-proxy` validates a Supabase user JWT and scopes every call to the caller's owned accounts. The
capture loop is a backend job with no user session; it enumerates `social_post_log` (which it owns and which
already records `user_id` + `outstand_post_id`), so ownership is already established. Calling Outstand
directly with the org `OUTSTAND_API_KEY` — exactly as `outstand-proxy` itself does upstream — is simpler and
avoids manufacturing a JWT. The function carries the same secret-handling responsibility the proxy already
carries (org key never reaches the browser).

---

## Deliverables

| # | Deliverable | Type | Notes |
|---|-------------|------|-------|
| A1 | `content_performance` table + RLS | DB migration | Ledger-first: reviewed before any capture code. |
| A2 | `content-performance-capture` edge function | Backend (Deno) | Enumerate → fetch → snapshot. `verify_jwt = false` (cron-invoked, service-role auth). |
| A3 | Vault-based `pg_cron` schedule | DB migration | Daily; hardcoded project URL + service key from `vault.decrypted_secrets`. |
| A4 | Ship `social_analytics_cache` to prod | DB migration replay | Apply existing `20260508000000` + `20260509000000`; no new code. |
| A5 | Embedding/cost note | — | None — this slice makes **no** Claude/OpenAI calls, so it is outside the 15%-of-revenue AI cap. Outstand is a flat-fee API. |
| A6 | Wiki flag: `toast-token-refresh` dead-GUC cron | Docs | Record in the content-engine audit + entity pages; verify/fix when Toast resumes. |

---

## A1 — `content_performance` table (ledger-first)

```sql
create table content_performance (
  id                  uuid primary key default gen_random_uuid(),
  social_post_log_id  uuid references social_post_log(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid references campaigns(id),
  outstand_post_id    text not null,
  platform            text not null,
  post_type           text not null,          -- mirrors social_post_log.post_type
  views               numeric,
  likes               numeric,
  comments            numeric,
  shares              numeric,
  saves               numeric,
  reach               numeric,
  engagement_rate     numeric,
  raw                 jsonb default '{}'::jsonb,   -- full Outstand payload; new metrics need no migration
  milestone           text not null,          -- '24h' | '72h' | '7d'
  is_settled          boolean not null default false,  -- true at the final ('7d') snapshot
  captured_at         timestamptz not null default now()
);

-- Append-only grain: at most one snapshot per post per milestone.
create unique index uniq_content_perf_post_milestone
  on content_performance (outstand_post_id, milestone);

create index idx_content_perf_user        on content_performance (user_id, captured_at);
create index idx_content_perf_campaign    on content_performance (campaign_id);
create index idx_content_perf_post        on content_performance (outstand_post_id);

alter table content_performance enable row level security;

-- Read: owner only. No user INSERT/UPDATE policy — capture is service-role (backend) only,
-- so writes happen with bypassrls. This keeps the metric trustworthy (users cannot forge performance).
create policy "Users read own content performance"
  on content_performance for select
  to authenticated
  using ( (select auth.uid()) = user_id );
```

**RLS rationale (per the Supabase security checklist):** `TO authenticated` + an ownership predicate in
`USING` (not `TO authenticated` alone, which would be BOLA/IDOR). No `INSERT`/`UPDATE`/`DELETE` policies at
all — the only writer is the service-role capture loop, which bypasses RLS; this is deliberate so users
cannot fabricate their own performance numbers. Append-only (insert, never upsert) preserves the maturation
curve.

**Data-API exposure:** confirm whether the project's Data API auto-exposes new `public` tables; if not,
grant `select` to `authenticated` explicitly (read stays gated by the RLS policy above).

---

## A2 — `content-performance-capture` edge function

Service-role Deno function, `verify_jwt = false`, authorized by a shared bearer the cron passes (the
service-role / sb_secret key, matching the project's new API-key system — see
`project_edge_function_secret_key` memory). Logic:

1. **Enumerate due posts.** Select `social_post_log` rows where `created_at > now() - interval '8 days'`.
   For each, determine which milestones are due (age ≥ 24h, 72h, 7d) and **not already captured**
   (left-join `content_performance` on `(outstand_post_id, milestone)`).
2. **Fetch analytics.** For each due (post, milestone): `GET {OUTSTAND_BASE_URL}/posts/{outstand_post_id}/analytics`
   with `Authorization: Bearer ${OUTSTAND_API_KEY}`. On non-2xx, log and skip (no row written — the milestone
   stays due and is retried next run).
3. **Normalize + insert.** Map Outstand's payload to the metric columns (tolerant of field-name variants,
   the way `useAccountMetrics` already coalesces `followers`/`followerCount`); always store the full payload
   in `raw`. Insert one append-only snapshot; set `is_settled = true` when `milestone = '7d'`.
4. **Idempotent.** The `(outstand_post_id, milestone)` unique index makes re-runs safe (on conflict, skip).

Bounded by construction: only posts < 8 days old, only un-captured milestones, so daily volume is small even
at scale. No Claude/OpenAI usage.

---

## A3 — Vault-based `pg_cron` schedule

The repo's existing cron (`toast-token-refresh`) uses
`current_setting('app.settings.supabase_url' / '.service_role_key')`. Project memory records those GUCs are
**unset in prod**, so that pattern is silently dead there. This slice instead reads the service key from
**Supabase Vault** and hardcodes the project URL:

```sql
-- one-time: store the key in Vault (run out-of-band, not committed):
--   select vault.create_secret('<service_or_sb_secret_key>', 'content_capture_key');

select cron.schedule(
  'content-performance-capture',
  '0 9 * * *',                         -- daily 09:00 UTC
  $$
  select net.http_post(
    url     := 'https://zocahiffooqdybdhguqv.supabase.co/functions/v1/content-performance-capture',
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

This becomes the **known-good cron recipe** that `toast-token-refresh` should later be migrated onto.

---

## A4 — Ship `social_analytics_cache` to prod (free add-on)

Apply the existing, never-replayed migrations `20260508000000_social_analytics_cache.sql` and
`20260509000000_fix_analytics_cache_columns.sql` to prod. No code changes — `useAccountMetrics` already
reads/writes this table; it has been silently no-op'ing in prod because the table is absent. Same migration-
drift class as the logo-trigger and `match_donny_knowledge` issues ([[Migration Replay Drift]]).

---

## Guardrails / out of scope

- **No recommender.** This slice only *captures*. Donny reasoning over `content_performance` is Phase B.
- **No Toast.** `toast-token-refresh` bug is flagged (A6), not fixed.
- **No frontend.** No dashboard reads `content_performance` yet — that's Phase B.
- **Ledger-first.** A1 migration + RLS land and are reviewed before A2 capture code is written.
- **Auth untouched.** No changes to auth/session logic.

---

## Verification

1. **Staging first.** Apply A1 + A4 migrations to staging (`mhffqrawgizhprbobcta`). Run `get_advisors`;
   resolve any RLS/security findings.
2. **Seed + manual run.** Insert a couple of `social_post_log` rows with **real** Outstand post IDs; invoke
   `content-performance-capture` manually. Confirm snapshot rows land with correct metrics and `milestone`.
3. **RLS proof.** As an authenticated non-owner, confirm zero rows visible; as the owner, confirm own rows
   visible; as `anon`, confirm none. Confirm no user can INSERT.
4. **Idempotency.** Re-run immediately; confirm no duplicate `(post, milestone)` rows.
5. **Promote to prod.** Apply migrations, register the Vault secret + cron, then confirm the cron **actually
   fires** (`cron.job_run_details`) — the whole reason for abandoning the dead-GUC pattern.
6. **Add-on check.** In prod, load the creator `AnalyticsTab`; confirm `social_analytics_cache` now persists
   (rows appear; dashboard deltas populate on second load).
7. **Build hygiene.** `npm run build` green (backend + migration only; no frontend change expected).

---

## Risks & flags

- **`toast-token-refresh` likely dead in prod** (shared dead-GUC cron pattern) → Toast tokens may not be
  refreshing. Flagged to wiki (A6); verify when Toast resumes.
- **Outstand `/posts/{id}/analytics` payload shape is unconfirmed** — the SDK lists the endpoint but it has
  never been called in this codebase. A2 must be written defensively (coalesce field names, store `raw`) and
  validated against a real response during staging verification.
- **Vault availability** — confirm the Vault extension is enabled on both staging and prod before relying on
  `vault.decrypted_secrets` in the cron.
- **`social_post_log` coverage** — capture is only as complete as this table. Confirm every publish path
  (DragonShare, campaign, cross-post, standalone) writes a `social_post_log` row; any path that doesn't is a
  blind spot for the recommender.

---

## See also

- `docs/wiki/analyses/content-engine-data-audit.md` — the audit that scoped this foundation-first.
- `docs/wiki/concepts/self-improving-app.md` — Phase 6 (Donny content-strategy engine) this feeds.
- `docs/DATABASE_SCHEMA.md` — `social_post_log`, `social_analytics_cache`, `dragonshare_engagement`.
- `supabase/functions/outstand-proxy/index.ts` — the proxy whose `/posts/{id}/analytics` allowance proves the path.
