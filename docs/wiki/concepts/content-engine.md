---
title: Content Engine
type: concept
created: 2026-06-11
updated: 2026-06-11
sources: [raw/sessions/2026-06-11-035313-content-engine-phase-c-performance-loop.md, docs/superpowers/specs/2026-06-11-content-engine-phase-c-design.md, docs/superpowers/specs/2026-06-11-content-engine-phase-d-design.md, docs/wiki/analyses/content-engine-data-audit.md]
tags: [content-engine, donny, dragonshare, content-briefs, performance, loop]
---

# Content Engine

The **Content Engine** is the productized, live-signal arm of the [[Self-Improving App]] vision
(its "Phase 6 — Donny content-strategy engine"): a closed loop that turns real engagement data into
better content recommendations, and recommendations into measurable content. Where the autoresearch
loop grows *knowledge*, the Content Engine grows *content performance* — both feed the
[[Data Flywheel]].

## The loop

```
content_performance (engagement signals, captured daily; carries source_brief_id)
        │  ↑
        ▼  └──────────────── (Phase C: WIRED) ─────────────────────────┐
[[Donny AI]] content brief  ──►  DragonShare submission  ──►  published post
 (content_briefs               (dragonshare_posts            (social_post_log
  .social_post_log_id ◄┐        .source_brief_id)             .dragonshare_post_id
                       └──── AFTER-INSERT trigger ────────────  .source_brief_id)
```

- **Forward half (built, Phase A + B):** signals → brief → action.
- **Return half (built, Phase C):** published post's engagement → back to the brief, closing the
  loop so Donny learns which briefs produced content that actually performed.
- **Surfaced to the creator (built, Phase D):** the closed loop is now *visible* — a
  **"Your content briefs"** card on the creator dashboard lists each brief and lights up with the
  engagement its content earned, via the `get_creator_brief_performance` RPC.

## Phases & status

- **Phase A — content-performance capture** *(built, live; PR #59).* A `content_performance` table
  plus a Vault-cron edge function (`content-performance-capture`) that pulls per-post metrics daily
  from [[Outstand]] (the `aggregated_metrics` payload: `total_views`/`total_likes`/… , `average_*`).
  This is the learning substrate. (Details in [[Content Engine Data Audit]].)
- **Phase B — brief → DragonShare action** *(built, verified prod; PRs #60–#63).* Three slices:
  1. **Brief recommender** — creator picks a restaurant → `content-strategy-recommend` edge function
     resolves org → restaurant, runs RAG + Sonnet, and returns a structured brief (`recommended_format`,
     `platform`, `hook`, `angles`, `sample_caption`, `hashtags`, `best_time`, `rationale`), persisted
     to `content_briefs`.
  2. **"Make it & submit" CTA** — deep-links into [[DragonShare]] (`?restaurant=&brief=`) with the
     restaurant pre-selected; records the brief→submission link in `dragonshare_posts.source_brief_id`.
  3. **Caption pre-fill** — the DragonShare submit form gains an always-on optional caption field,
     pre-filled (editable) from the brief's `sample_caption` + hashtags, stored in
     `dragonshare_posts.caption`. A restored sessionStorage draft wins over the prefill.
- **Phase C — performance link** *(built, verified prod; PR #73).* Bridges `dragonshare_posts` →
  `social_post_log` → `content_performance` so a brief links to the *engagement its content earned*.
  **Resolved gating unknown:** the boost→publish path writes `social_post_log` only when a human clicks
  **"Post Now"** on the auto-draft (`fire-dragonshare-social-hook` → `donny_scheduled_posts` →
  `DonnyProvider.publishDraft`); the boost itself does not. Mechanism (data-link-only, no UI):
  1. `publishDraft` writes the originating post id it already holds (`metadata.post_id`) into a new
     `social_post_log.dragonshare_post_id` column (guarded to `source==='dragonshare_social_hook'`).
  2. A **BEFORE INSERT** trigger (`resolve_social_post_log_brief`, SECURITY DEFINER) resolves
     `source_brief_id` from that post; an **AFTER INSERT** trigger (`link_brief_to_social_post`)
     sets `content_briefs.social_post_log_id` **first-wins** (`WHERE social_post_log_id IS NULL`).
  3. `content-performance-capture` forwards `source_brief_id` onto `content_performance`, so
     "how did brief B perform" = every `content_performance` row where `source_brief_id = B`
     (one-to-many across all sibling cross-posts; the single FK is just a convenience pointer).
  `fire-dragonshare-social-hook` was **not** changed — resolution happens at publish time from the
  source of truth, so it can't go stale.
- **Phase D — creator read surface** *(built, verified prod; PR #77).* The first UI on the loop: a
  **"Your content briefs"** card on the creator dashboard. Its present-day value is *persistence* —
  briefs were generate-and-forget (saved to `content_briefs` but never shown again); the card gives a
  creator their brief history (revisit, re-enter DragonShare) and the *same* card surfaces real
  metrics the instant they flow — no rebuild. Lean by design (history + lifecycle status; no detail
  page, charts, or edge-fn change).
  **The RLS bridge (the heart of Phase D):** Phase C writes `content_performance.user_id` = the
  *publisher* (often the **restaurant** who clicked "Post Now"), but a brief's author is the
  **creator**, and the table RLS is owner-only — so a creator cannot read their brief's performance
  through the table. A single SECURITY DEFINER RPC `get_creator_brief_performance`, gated on
  `content_briefs.creator_id = auth.uid()`, bridges it: the table policy stays owner-only (writes
  unforgeable), and the `creator_id` join is the *sole* authorization (cannot leak another creator's
  briefs or a restaurant's unrelated posts). The RPC reduces each post to its **most-mature milestone
  snapshot** (7d>72h>24h, `distinct on (outstand_post_id)`) before summing across sibling posts, so
  the 24h/72h/7d rows don't multiply-count. Frontend: `useCreatorBriefPerformance` hook,
  `deriveBriefStatus` pure fn (Not posted → Measuring → metrics), `BriefPerformanceCard` (mirrors the
  DragonShare activity card). One surgical `types.ts` function entry; no full regen.

## Canonical keys & data model

- **`organizations.id` is the join key end to end:** `content_briefs.organization_id` =
  `dragonshare_posts.target_org_id` = the id `get_restaurant_by_org_id` / `search_restaurants` return
  (NOT `business_profiles.id`). Org→restaurant resolution is two queries (no FK to embed):
  `org_members` (active) → `business_profiles` (account_type='restaurant', by user_id).
- `content_briefs`: `creator_id`, `organization_id`, `brief` jsonb (the full brief), `model`,
  `used_performance_data`, `social_post_log_id` (nullable; **populated first-wins by Phase C**), read-own RLS.
- Phase-B slices 2–3 needed **no migration** — `source_brief_id` and `caption` columns already existed.
  Phase C added one migration: `social_post_log.dragonshare_post_id` + `.source_brief_id`,
  `content_performance.source_brief_id`, two triggers, indexes.
- Phase D added **no columns** — one read-path RPC `get_creator_brief_performance(result_limit)`:
  the creator's briefs left-joined to the latest-milestone snapshot per linked post, gated on
  `creator_id = auth.uid()`. Read it as "brief performance" = aggregate over every
  `content_performance` row whose `source_brief_id` traces to the brief.

## Key learnings

- **Deep-link params feeding multiple async queries must be captured at mount.** The Phase B race
  ([[Deep-Link Param Query Race]]) silently nulled both `source_brief_id` and the caption pre-fill
  because a URL-cleanup effect tore down the org query before the sibling brief query resolved.
- **Verify the DB, not just the UI** — a surviving pre-fill masked a dead data link for two slices.
- **`SECURITY DEFINER` trigger fns must have `EXECUTE` revoked from public/anon/authenticated.**
  A SECURITY DEFINER function in `public` is otherwise callable via `/rest/v1/rpc/<fn>` (Supabase
  advisors 0028/0029); trigger functions need no such grant. Both Phase C triggers revoke it.
- **Prod deploy ordering when new code reads a new column:** apply the prod migration *before*
  deploying the edge fn / merging the frontend — otherwise the daily cron's `select`/`insert` and the
  frontend's insert fail on the missing column. (Captured in project memory: deploy-ordering-new-column.)
- **Cross-user reads belong in an ownership-gated definer RPC, not a loosened table policy** (Phase D).
  When the reader (creator) doesn't own the rows (publisher-owned `content_performance`), a SECURITY
  DEFINER RPC scoped by the reader's *own* anchor (`content_briefs.creator_id = auth.uid()`) is the
  ledger-first bridge — keep the table owner-only, revoke `public`/`anon` on the fn, grant
  `authenticated` (the `auth.uid()` predicate is the authorization; advisor 0029 flags the grant, which
  is intended for any frontend-called RPC).
- **Aggregating milestoned snapshots: reduce-then-sum.** `content_performance` keeps up to 3 rows per
  post (24h/72h/7d). Sum naively and views triple-count; take the most-mature snapshot per post first
  (`distinct on (outstand_post_id)` + CASE rank), then aggregate across posts.
- Built via the brainstorm → spec → plan → subagent-driven implementation → prod-verify discipline,
  one agile slice at a time ([[Musk's Algorithm]]).

## Known Issues

- The link only forms when a human actually clicks **"Post Now"** on the boost auto-draft; if the
  draft is ignored, no `social_post_log` row exists and `content_briefs.social_post_log_id` stays null.
- Engagement-side tables are still partial: `dragonshare_engagement` is schema-only; Outstand Phase 4
  analytics is still in scope. The link populates only once a real boost + publish actually happens.
- **The Phase D card is empty in prod today** by data reality, not bug: `content_performance` has no
  rows yet (no paying boosts), so every brief shows "Not posted yet". The card's standalone value
  (brief history) holds regardless; metrics appear automatically when a real boost + publish flows.
  On RPC error the card falls to its empty state (outer `ErrorBoundary` is the net) — a deliberate,
  spec-tolerated simplification, not a distinct inline error.

## See Also

- [[Self-Improving App]] — the broader smart-app vision (Content Engine = its Phase 6)
- [[Content Engine Data Audit]] — what signal data actually exists in prod
- [[Content Engine Phase B Session]] — the build session (forward half)
- [[Content Engine Phase C Session]] — the return-half link build (spec-anchored)
- [[Content Engine Phase D Session]] — the creator read surface
- [[Deep-Link Param Query Race]]
- [[DragonShare]]
- [[Donny AI]]
- [[Outstand]]
- [[Data Flywheel]]
