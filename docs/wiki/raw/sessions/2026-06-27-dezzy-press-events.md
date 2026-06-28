# Session — Dezzy AI Press & Events scout (Domain 4)

- **Date:** 2026-06-27
- **Branch:** `feat/aios-dezzy-press-events` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-27-dezzy-press-events-design.md`
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` §Domain 4
- **Suite siblings:** `dezzy-outreach` (#3), `dezzy-content-calendar` + `dezzy-website-updates` (#1+#2),
  `dezzy-weekly-brief` (#5).

## What shipped

The **Domain 4** slice of the Dezzy suite — and the first Dezzy domain that ships as a **scheduled cloud
routine** rather than a Founder Playbook:

- **`dezzy-press-events-agent`** (`.claude/schedules/dezzy-press-events-agent.md`): a **monthly** cloud
  routine that web-scans (cloud Claude Code has WebSearch) for press / podcast / publication / conference
  opportunities, grounds fit + pitch angles in `PROJECT_CONTEXT` + the strategy library, and files the top
  ~10 as deduped `[press]`/`[event]`-tagged `aios_findings` via `aios-report-ingest` for founder triage at
  `/internal/findings`.

With this, Dezzy covers Domains **1, 2, 3, 4, 5**; only **#6 (Amplification/DRE)** remains.

## Key decisions

- **Cloud routine, not a playbook — because the runner has no web access.** `aios-playbook-run` exposes
  only six aggregate internal read tools; press/event discovery needs the open web. The cloud-routine rail
  (`weekly-brief-agent` / `bug-sweep-agent` / `loop-scout-agent`) has WebSearch, so Domain 4 lives there.
  `loop-scout-agent` is the exact template (monthly routine → ranked findings → `/internal/findings`).
- **Reuse the findings rail (zero-infra).** Opportunities are `aios_findings` (`source=dezzy-press-events`,
  `[press]`/`[event]` title tags, `fingerprint=dezzy-opportunity:<slug>`), not a new `dezzy_opportunities`
  table. No new table, UI, edge-function, secret, or migration — just the prompt file + a founder
  `/schedule` step. A first-class deadline-sorted calendar is the documented v2.
- **Report-only invariant.** The only write is the findings POST through the audited `aios-report-ingest`
  choke point; the founder triages and decides. For a pursued pitch, the founder uses Donny's existing
  `compose_email_link`.
- **Disciplines.** URL-required (no verifiable source URL → don't file — the web-research non-fabrication
  backstop); `$0`-budget-aware (prioritize free / founder-executable plays, label paid costs); `severity`
  reused as priority, **never `critical`** (that tier stays for real bugs), `high` = strong fit + deadline
  within ~8 weeks; re-scan skips `acknowledged`/`wontfix`/**`resolved`** so a decided/annual opportunity
  doesn't silently reopen.

## Gotchas / review

- spec-reviewer Approved (3 advisories applied: resolved-skip, monthly-cadence caveat, citation tightenings).
- Codex caught a **P2**: the `high`-severity rule contradicted itself (`≤8 weeks` vs "flag ≥8 weeks out") —
  restated as act-now urgency for deadlines within ~8 weeks (which delivers the spec's ~8-week lead time).
- First live run is **founder-triggered** (needs the cloud env + WebSearch + `AIOS_INGEST_SECRET`); can't be
  run headlessly.

## Affected files / artifacts

- `.claude/schedules/dezzy-press-events-agent.md` (new routine prompt)
- `docs/superpowers/specs/2026-06-27-dezzy-press-events-design.md` (spec)
- **No** `src/`, edge-function, table, RLS, secret, OAuth, or migration change.
