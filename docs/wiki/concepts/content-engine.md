---
title: Content Engine
type: concept
created: 2026-06-11
updated: 2026-06-11
sources: [raw/sessions/2026-06-11-035313-content-engine-phase-c-performance-loop.md, docs/wiki/analyses/content-engine-data-audit.md]
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
content_performance (engagement signals, captured daily)
        │  ↑
        ▼  └──────────────── (Phase C: not yet wired) ───────────────┐
[[Donny AI]] content brief  ──►  DragonShare submission  ──►  published post
 (content_briefs)                (dragonshare_posts            (social_post_log)
                                  .source_brief_id)
```

- **Forward half (built, Phase A + B):** signals → brief → action.
- **Return half (Phase C, not built):** published post's engagement → back to the brief, closing
  the loop so Donny learns which briefs produced content that actually performed.

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
- **Phase C — performance link** *(next, not built).* Bridge `dragonshare_posts` → `social_post_log`
  → `content_performance` so a brief links to the *engagement its content earned*, populating the
  reserved `content_briefs.social_post_log_id`. Likely needs a correlation column (e.g.
  `social_post_log.dragonshare_post_id`) wired into the Outstand-publish path. **Gating unknown:**
  whether/how the boost→publish path writes a `social_post_log` row today.

## Canonical keys & data model

- **`organizations.id` is the join key end to end:** `content_briefs.organization_id` =
  `dragonshare_posts.target_org_id` = the id `get_restaurant_by_org_id` / `search_restaurants` return
  (NOT `business_profiles.id`). Org→restaurant resolution is two queries (no FK to embed):
  `org_members` (active) → `business_profiles` (account_type='restaurant', by user_id).
- `content_briefs`: `creator_id`, `organization_id`, `brief` jsonb (the full brief), `model`,
  `used_performance_data`, `social_post_log_id` (nullable, **Phase C target**), read-own RLS.
- Slices 2–3 needed **no migration** — `source_brief_id` and `caption` columns already existed.

## Key learnings

- **Deep-link params feeding multiple async queries must be captured at mount.** The Phase B race
  ([[Deep-Link Param Query Race]]) silently nulled both `source_brief_id` and the caption pre-fill
  because a URL-cleanup effect tore down the org query before the sibling brief query resolved.
- **Verify the DB, not just the UI** — a surviving pre-fill masked a dead data link for two slices.
- Built via the brainstorm → spec → plan → subagent-driven implementation → prod-verify discipline,
  one agile slice at a time ([[Musk's Algorithm]]).

## Known Issues

- Phase C is unbuilt; `content_briefs.social_post_log_id` is always null until it lands.
- Engagement-side tables are partial: `dragonshare_engagement` is schema-only; Outstand Phase 4
  analytics is still in scope. Phase C depends on a real boost + publish actually happening.

## See Also

- [[Self-Improving App]] — the broader smart-app vision (Content Engine = its Phase 6)
- [[Content Engine Data Audit]] — what signal data actually exists in prod
- [[Content Engine Phase B Session]] — the build session
- [[Deep-Link Param Query Race]]
- [[DragonShare]]
- [[Donny AI]]
- [[Outstand]]
- [[Data Flywheel]]
