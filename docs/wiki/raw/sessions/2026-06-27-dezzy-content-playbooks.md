# Session — Dezzy AI Content Production Playbooks (Domains 1 + 2)

- **Date:** 2026-06-27
- **Branch:** `feat/aios-dezzy-content-playbooks` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-27-dezzy-content-playbooks-design.md`
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` (PR #190)
- **Sibling slice (parallel worktree `DC-Dezzy-AI`):** `dezzy-outreach` playbook (Domain 3),
  spec `2026-06-27-dezzy-outreach-v1-design.md`.

## What shipped

Two new **report-only AIOS Founder Playbooks** seeded into `aios_playbooks`, building the
**content half of Dezzy AI** (the "Dame AI"/Dezzy growth-agent spec), on the existing
playbook rails — **pure seed migration, zero new code, zero new table, zero UI**:

- **`dezzy-content-calendar` — "Dezzy — Weekly Content Calendar"** (Domain 2). Drafts
  DragonCandy's OWN company social posts for the week ahead — 5 posts on a fixed Mon–Fri
  rotation (feature spotlight / creator spotlight / restaurant case study or before-after /
  industry insight / community #DragonDashed). Grounded in `get_latest_briefing` +
  `get_platform_stats` + `get_internal_doc`. Each post: day, content type, platform(s),
  caption, hashtags, one-line visual brief.
- **`dezzy-website-updates` — "Dezzy — Website & Changelog Update Drafts"** (Domain 1). For
  the 1–2 most launch-worthy recently shipped USER-FACING features, drafts three artifacts
  each: a changelog/blog entry, a landing-page blurb, and a cross-channel announcement
  (email subject+body + social caption). Says "nothing user-facing shipped → stop" when true.

Both `allowed_proposals = '[]'` (report-only — they draft, the founder reviews/publishes;
Dezzy sends/publishes nothing). Both run on demand at `/internal/playbooks/<slug>`.

## Key decisions

- **Dezzy is NOT a new agent runtime.** It is a **branded suite of AIOS Founder Playbooks +
  scheduled routines** on rails already shipped (`aios-playbook-run`, `aios-report-ingest`,
  `/internal/playbooks`, `/schedule`, `/internal/briefings`). This reframes the source spec's
  heavy literal architecture (5 `dame_*` tables + 4 `dame-*` edge functions + a "Dame Hub" UI)
  — the founder confirmed the lean reframe. Decision matches the sibling `DC-Dezzy-AI` slice.
- **Voice via `preferences_md`, engine identity stays "Donny."** Each playbook sets the
  "Dezzy" voice (warm, benefit-led, #DragonDashed) without re-skinning the runner.
- **No edit to `aios-playbook-run/index.ts`.** That is the file the sibling worktree edits to
  add a `get_reactivation_targets` read tool → editing it here would merge-conflict. The two
  content playbooks are grounded entirely by the six EXISTING aggregate read tools, so this
  slice is a pure seed. Distinct slugs + migration filename → no collision with `dezzy-outreach`.
- **No-fabrication discipline made enforceable.** `preferences_md` forbids inventing a feature/
  stat/creator/number; `done_criteria_md` carries an explicit **traceability criterion** so the
  mandatory `done_check` self-assessment actually exercises it. Row-level data the aggregate
  tools can't supply (individual creators/restaurants, external stats) is required as a
  clearly-marked placeholder (`[CREATOR / @handle]`, `[RESTAURANT]`, `[STAT — verify]`).

## Gotchas

- **`get_internal_doc` reads the `internal_docs` table, not the repo file.** Prod's
  `internal_docs` copy of PROJECT_CONTEXT was 16 days stale (`updated_at` 2026-06-11) at build
  time. The fresh weekly briefing (`get_latest_briefing`, wk 2026-06-22) is the primary
  "what shipped" source and compensates; editing PROJECT_CONTEXT in this PR re-triggers
  `sync:internal` on the post-merge hook, refreshing the library copy.
- **Live "Run now" is admin-gated** (the runner requires the caller's `user_roles.role='admin'`
  session) → founder-run verification, same as the sibling's live `dezzy-outreach` run.

## Affected files / artifacts

- **Migration (applied to prod):** `supabase/migrations/20260627170000_aios_dezzy_content_playbooks_seed.sql`
- **Spec:** `docs/superpowers/specs/2026-06-27-dezzy-content-playbooks-design.md`
- **No** `src/`, edge-function, table, RLS, secret, or OAuth change.
