---
title: Content Engine
type: concept
created: 2026-06-11
updated: 2026-06-11
sources: [raw/sessions/2026-06-11-035313-content-engine-phase-c-performance-loop.md, docs/superpowers/specs/2026-06-11-content-engine-phase-c-design.md, docs/wiki/analyses/content-engine-data-audit.md]
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
- Built via the brainstorm → spec → plan → subagent-driven implementation → prod-verify discipline,
  one agile slice at a time ([[Musk's Algorithm]]).

## Known Issues

- The link only forms when a human actually clicks **"Post Now"** on the boost auto-draft; if the
  draft is ignored, no `social_post_log` row exists and `content_briefs.social_post_log_id` stays null.
- Engagement-side tables are still partial: `dragonshare_engagement` is schema-only; Outstand Phase 4
  analytics is still in scope. The link populates only once a real boost + publish actually happens.

## See Also

- [[Self-Improving App]] — the broader smart-app vision (Content Engine = its Phase 6)
- [[Content Engine Data Audit]] — what signal data actually exists in prod
- [[Content Engine Phase B Session]] — the build session
- [[Deep-Link Param Query Race]]
- [[DragonShare]]
- [[Donny AI]]
- [[Outstand]]
- [[Data Flywheel]]
