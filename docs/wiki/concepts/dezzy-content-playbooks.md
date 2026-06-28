---
title: Dezzy Content Playbooks
type: concept
created: 2026-06-27
updated: 2026-06-27
sources: [docs/superpowers/specs/2026-06-27-dezzy-content-playbooks-design.md, 2026-06-27-dezzy-content-playbooks.md]
tags: [aios, dezzy, donny, automation, internal, growth, content]
---

# Dezzy Content Playbooks

**Dezzy AI** is DragonCandy's second agent — it runs *the company's growth/marketing* the
way [[Donny AI]] runs *the platform* (the "Dame AI"/Dezzy spec; "Dame" was renamed Dezzy to
avoid clashing with founder Damon "Dame" Williams). The spec lists six domains and proposes a
heavy literal build (five `dame_*` tables, four `dame-*` orchestrator edge functions, a "Dame
Hub" dashboard).

**The shipped architecture rejects that.** Dezzy is **not a new agent runtime** — it is a
**branded suite of [[Founder Playbooks]] + scheduled routines** on rails already shipped
(`aios-playbook-run`, `aios-report-ingest`, `/internal/playbooks`, `/schedule`,
`/internal/briefings`). Each Dezzy "domain" becomes one or more report-only playbooks the
founder runs during the Monday review; the founder reviews and publishes — **Dezzy drafts,
a human acts** (the standing [[AIOS]] invariant). This page covers the **content half**
(Domains 1 + 2); the supply/demand **outreach** half (Domain 3) is the sibling `dezzy-outreach`
playbook.

## The two content playbooks (2026-06-27)

Both seeded into `aios_playbooks` (`allowed_proposals = '[]'`, report-only) by
`supabase/migrations/20260627170000_aios_dezzy_content_playbooks_seed.sql`. **Pure seed —
no new read tool, no edit to `aios-playbook-run`, no new table, no UI** (the
`/internal/playbooks` surface renders any playbook by slug).

- **`dezzy-content-calendar` — "Dezzy — Weekly Content Calendar"** (Domain 2). Drafts
  DragonCandy's **own company** social posts (IG / TikTok / X / LinkedIn) for the week ahead —
  5 posts on a fixed Mon–Fri rotation: feature spotlight · creator spotlight · restaurant case
  study / before-after · industry insight · community (#DragonDashed). Per post: day, content
  type, platform(s), caption, hashtags, one-line visual brief. *(Distinct from the consumer
  `content-posting-plan`/[[Outstand]] flow, which schedules a USER's own posts.)*
- **`dezzy-website-updates` — "Dezzy — Website & Changelog Update Drafts"** (Domain 1). For the
  1–2 most launch-worthy recently shipped **user-facing** features, drafts three artifacts each —
  a changelog/blog entry, a landing-page blurb, and a cross-channel announcement (email + social).
  Stops with "nothing user-facing shipped" when that's true.

## Why it needs (almost) no code

The runner already gives every playbook six aggregate READ tools (`get_platform_stats`,
`get_revenue_stats`, `get_cost_stats`, `get_platform_weight_trend`, `get_latest_briefing`,
`get_internal_doc`), the mandatory `done_check` self-assessment, and report-only mode
(`allowed_proposals: []`). Both content playbooks ground entirely in **what shipped** (the
latest weekly briefing), **live milestones** (platform stats), and **voice/positioning**
(`get_internal_doc` reading the strategy library, incl. PROJECT_CONTEXT). So the slice is a
seed migration — exactly the [[Founder Playbooks]] "add a playbook = one row" property.

## Non-fabrication discipline (the one design subtlety)

The aggregate tools return COUNTS, not individual rows, and the runner has **no web access**.
So anything needing row-level or external data is required as a **clearly-marked placeholder**,
never invented:

- creator spotlight → `[CREATOR / @handle]`; restaurant case study → `[RESTAURANT]`
- external/industry statistic → `[STAT — verify]` (Thursday's "insight" is instead grounded in
  DragonCandy's OWN metrics)

`preferences_md` forbids fabrication; `done_criteria_md` carries an explicit **traceability
criterion** (*every stated feature/number/stat/name traces to a tool result or is a marked
placeholder*) so the `done_check` self-assessment actually checks it. A future revision can
auto-name a creator once the sibling's `get_reactivation_targets` (a row-level read tool) merges.

## Gotchas

- **`get_internal_doc` reads the `internal_docs` table, not the repo file** — the strategy-library
  copy can lag `main` (was 16 days stale at build); the fresh weekly briefing is the primary
  "what shipped" source and a PROJECT_CONTEXT edit re-syncs the library via the post-merge hook
  ([[Knowledge-Sync Automation]]).
- **Live "Run now" is admin-gated** (caller's `user_roles.role='admin'` session) → a founder-run
  verification step.

## Deferred

Scheduled weekly auto-run (a `/schedule` routine over the existing `playbook-runner-agent`
template — Dezzy is *loop-callable* exactly as [[Founder Playbooks]] describes); auto-naming
creators/restaurants; web-research domains (Domain 4 press/events — needs a cloud routine, not a
playbook, since the runner has no web access); one-tap send/publish.

## See Also

- [[Dezzy Agent (Playbook Suite)]] — the parent framing; this page is its content half (the sibling Outreach Machine is Domain 3)
- [[Founder Playbooks]]
- [[Donny AI]]
- [[AIOS]]
- [[AIOS Internal Shell]]
- [[Musk's Algorithm]]
