# Session — Dezzy AI Weekly Operating Brief (Domain 5)

- **Date:** 2026-06-27
- **Branch:** `feat/aios-dezzy-weekly-brief` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-27-dezzy-weekly-brief-design.md`
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` §Domain 5
- **Suite siblings:** `dezzy-outreach` (Domain 3, PR #193), `dezzy-content-calendar` + `dezzy-website-updates`
  (Domains 1+2, PR #194).

## What shipped

A fourth report-only Dezzy Founder Playbook seeded into `aios_playbooks` — the **Domain 5 capstone**:

- **`dezzy-weekly-brief` — "Dezzy — Weekly Operating Brief"**: an **admin-only** Monday action console. Six
  sections: one-line summary; platform numbers (each with an on-track/at-risk/off-track status *or* "no KPI
  basis"); what worked / what didn't; this week's top 3 specific actions; the **Dezzy queue** checklist
  (points to `dezzy-outreach` / `dezzy-content-calendar` / `dezzy-website-updates`); system health. Grounded
  in `get_latest_briefing` + `get_platform_stats` + `get_internal_doc`. Report-only (`allowed_proposals=[]`).

With this, Dezzy Domains **1, 2, 3, 5** all ship as playbooks; only Domain 4 (Press & Events) and Domain 6
(Amplification/DRE) remain.

## Key decisions

- **New admin-only playbook, NOT an extension of the stakeholder weekly brief.** The existing
  `weekly-brief-agent` → `aios_briefings` → `/internal/briefings` is **stakeholder-publishable** (hard rule:
  no dollar figures except aggregate revenue). The Dezzy brief is the founder's action console; keeping it a
  separate `/internal/playbooks` run keeps founder-internal material (candid "what didn't work," directives)
  off the publishable surface. It **reconciles** to the stakeholder brief's KPIs via `get_latest_briefing`
  rather than recomputing.
- **Orchestrate, not embed.** The brief *points to* the detail playbooks (by slug) rather than embedding
  their outputs. This is why it stays a **pure seed**: there is no tool to read `aios_playbook_runs`, and
  orchestrate-not-embed means it doesn't need one (no edit to `aios-playbook-run`). Compose-mode (a
  `get_latest_playbook_run` tool) is the documented v2.
- **Non-fabrication.** Status only "where the stakeholder brief's KPIs or the North Star give a basis;
  otherwise 'no KPI basis'" (a status is itself a claim); system-health limited to aggregate-derivable
  signals; Events/Press marked "not yet tracked" (Domain 4 unbuilt, runner has no web access). Enforced via a
  traceability `done_criteria` + the founder review gate.

## Gotchas

- Live "Run now" is admin-gated → founder-run verification, same as the other Dezzy playbooks.

## Affected files / artifacts

- **Migration (applied to prod):** `supabase/migrations/20260627180000_aios_dezzy_weekly_brief_seed.sql`
- **Spec:** `docs/superpowers/specs/2026-06-27-dezzy-weekly-brief-design.md`
- **No** `src/`, edge-function, table, RLS, secret, OAuth, or stakeholder-brief change.
