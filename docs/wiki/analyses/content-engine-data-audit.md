---
title: Content Engine Data Audit
type: analysis
created: 2026-06-10
updated: 2026-06-10
sources: [prod-row-scan-2026-06-10, codebase-audit]
tags: [donny, analytics, content-strategy, data-audit, drift, roi]
---

# Content Engine Data Audit

Audit (2026-06-10) of what signal data actually exists in **prod** (`zocahiffooqdybdhguqv`) to power
the planned [[Self-Improving App|Donny content-strategy engine]] — Donny recommending the best content
strategy per restaurant/creator/brand to increase ROI. Method: a `pg_stat_user_tables` row scan +
`information_schema` existence checks + a code audit of the signal pipelines.

## Verdict: context is live, performance is dark

| Signal | Prod reality | Status |
|--------|--------------|--------|
| Business/creator **context** | `business_profiles` (17), `creator_profiles` (12), `business_contexts` (21), `org_units` (27) — industry, vibe, social links, sample content, skills | ✅ Live |
| Donny **generative** logic | `donny-campaign-generate`, `content-posting-plan`, `social-caption`, `match-creators` | ✅ Reusable |
| **Social content performance** | `social_analytics_cache` **does not exist in prod**; Outstand per-post analytics endpoint is proxied but **never called**; `dragonshare_engagement` = **0 rows** | ❌ Dark |
| **Toast** | **zero `toast_*` tables in prod**; `toast-oauth-start` 503s (creds unset) | ❌ Absent |
| **Campaign / promotions performance** | lifecycle only (`campaign_media` 0, `campaign_matches` 0, `campaign_deliverables` 0; promotions perf none) | ❌ Empty |
| `analytics_events` (**326k rows**) | the only large dataset, but `event_type`/`page_url`/`session_id` **web/product telemetry**, not content performance | ⚠️ Wrong kind |

## Implication

**A data-driven content-strategy recommender is not buildable today** — the content-performance signal
it would learn from doesn't exist in prod. Building one now would be content-first generation dressed as
analytics. Therefore the engine is sequenced **foundation-first**: pour the data layer, then build the
recommender on top.

## Prod migration drift (new findings)

Same drift class as the [[Migration Replay Drift]] / logo-trigger / `match_donny_knowledge` issues — code
and migrations exist for tables that were **never applied to prod**:
- `social_analytics_cache` — absent in prod, yet `useAccountMetrics` writes to it (account metrics
  silently don't persist).
- entire `toast_*` schema (`toast_connections`, `toast_sync_events`, `toast_*` views) — absent in prod.

### Flag: `toast-token-refresh` cron likely dead in prod (2026-06-10)

Surfaced while designing the [[Self-Improving App|content-performance capture]] scheduler. The
`toast-token-refresh` cron (`supabase/migrations/20260412000005_toast_token_refresh_cron.sql`) fires via
`pg_cron` + `net.http_post` reading `current_setting('app.settings.supabase_url')` /
`...service_role_key` — the **same unset-GUC pattern recorded as silently dead in prod** (the
pg_net-from-trigger / GUC issue). If those GUCs are unset, the job posts a null URL/bearer and never
refreshes Toast tokens. **Not fixed here** — Toast is deferred and additionally **blocked on pending Toast
API/integration access**, so no Toast data flows regardless. When Toast enablement resumes: verify via
`cron.job_run_details`, and migrate the job onto the **Vault-based `pg_cron` recipe** introduced by the
content-performance-capture cron (`20260610150000_content_performance_capture_cron.sql`), which avoids the
dead GUC dependency.

## Phase A — "Turn on the signal" (the foundation)

> **Keystone SHIPPED & live in prod (2026-06-10).** `content_performance` table + RLS, the
> `content-performance-capture` edge function, and a **Vault-based `pg_cron`** job (daily 09:00 UTC) are
> deployed to staging + prod. Validated end-to-end against the 1 real prod post: the Outstand
> `/posts/{id}/analytics` payload shape was confirmed (`aggregated_metrics` envelope), metrics map
> correctly, and re-runs are idempotent. `social_analytics_cache` was also replayed to prod (the dashboard
> drift fix). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-10-content-performance-capture*`.
> Remaining within Phase A: sub-projects 2–3 below. (Staging cron is live but no-ops until staging gets
> `OUTSTAND_API_KEY` + real posts.)

Decomposed into shippable sub-projects (keystone first):
1. **Social content-performance capture** *(keystone — ✅ shipped).* Call the already-built Outstand per-post
   analytics endpoint and persist metrics (likes/views/reach/engagement); ship `social_analytics_cache`
   to prod; populate `dragonshare_engagement` from the same source. Feeds creator, DragonShare, and
   campaign content performance at once.
   > **Superseded (2026-06-10):** the keystone design
   > (`docs/superpowers/specs/2026-06-10-content-performance-capture-design.md`) routes DragonShare
   > coverage through a single canonical `content_performance` table (faceted by `post_type`) rather than
   > a parallel write to `dragonshare_engagement`, which is **deferred** to avoid two competing tables.
2. **Campaign/promotions performance** — attach the captured metrics to campaign/promotion content.
3. **Toast enablement** — ship `toast_*` migrations to prod, set creds, wire menu/order/traffic syncs
   (restaurant-revenue signal; deferred — Toast attribution was already out of v1 scope).

## Phase B — Data-grounded brief recommender + closed loop

Once signal flows: build the creator-facing content-brief recommender (reusing the generative functions
above + context + the wiki RAG via [[Donny AI]]) that learns from what actually performs.

## See Also

- [[Self-Improving App]]
- [[Donny AI]]
- [[Outstand]]
- [[DragonShare]]
- [[Migration Replay Drift]]
- [[Supabase]]
