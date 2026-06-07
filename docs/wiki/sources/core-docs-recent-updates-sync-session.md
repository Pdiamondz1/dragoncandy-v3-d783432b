---
title: Core Docs Recent Updates Sync Session
type: source
created: 2026-06-07
updated: 2026-06-07
sources: [raw/sessions/2026-06-07-core-docs-recent-updates-sync.md]
tags: [docs-sync, dragonshare, notifications, capacitor, outstand, qa-cicd]
---

# Core Docs Recent Updates Sync Session

A documentation-sync session (2026-06-07) that reconciled `CLAUDE.md`,
`PROJECT_CONTEXT.md`, and the wiki with codebase work that landed between
2026-06-01 and 2026-06-06 — after the 2026-06-02 QA-staging Plan B ingest.
It captures six shipped workstreams plus a corrected codebase-scale count.

## Key Claims

- **Codebase scale (verified 2026-06-07):** 60 pages, 183 hooks, **73 edge
  functions**. Docs previously claimed 67 (CLAUDE.md) / 71 (PROJECT_CONTEXT.md);
  both corrected. The new function is `dragonshare-notify`.
- **DragonShare notifications pipeline shipped.** A single `dragonshare-notify`
  fanout edge function now owns delivery across bell + email + Donny (raw push
  inserts retired). DragonShare is its own notification category with four email
  templates, fired on submit / decline / boost fulfillment, plus a dedicated
  activity card on both creator and business dashboards. See [[DragonShare]].
- **iOS camera/photo-library capture shipped** — the first Capacitor Phase 2
  native value-add (capture UI, permission strings, `captureFromCamera` helper).
  See [[Capacitor Native Shell]].
- **Legal pages shipped** — Privacy Policy + Terms of Service, which also satisfy
  the App Store Connect prerequisite tracked on [[Capacitor Native Shell]].
- **Outstand account recovery shipped** — reconcile + reconnect-needed prompt
  for accounts wiped by an Outstand billing event; real profile photos now show
  for connected accounts. First dedicated [[Outstand]] entity page created.
- **QA staging Plan C shipped** — curated e2e smoke gate on staging previews,
  hardened auth/smoke, end-to-end runbook. Completes the [[QA CI/CD Gate]]
  three-plan effort.

## Known Issue Carried Forward

- `campaign_status` enum is missing an `in_progress` value that ~11 source files
  reference (surfaced in the May counter-offer fix). Still un-added. See
  [[Counter-Offer Enum Fix Session]].

## See Also

- [[DragonShare]]
- [[Outstand]]
- [[Capacitor Native Shell]]
- [[QA CI/CD Gate]]
- [[QA Staging Supabase (Plan B) Session]]
- [[Donny AI]]
