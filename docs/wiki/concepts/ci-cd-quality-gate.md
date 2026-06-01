---
title: CI/CD Quality Gate
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-ci-quality-gate-plan-a.md, docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md]
tags: [ci, github-actions, testing, quality, deployment]
---

# CI/CD Quality Gate

GitHub Actions–based quality gate that runs on every PR to `main` and every push to
`main`. Blocks merges until build, typecheck, lint, and unit tests are all green.
Implemented as Plan A of the three-phase QA/Staging CI/CD initiative.

## Current State (Plan A — shipped 2026-06-01)

**Workflow:** `.github/workflows/ci.yml` — job named `verify`.

Steps (in order):
1. `npm ci` — reproducible install from lockfile
2. `npm run build` — Vite production build
3. `npm run typecheck` — TypeScript strict-mode check
4. `npm run lint` — ESLint flat config
5. `npm run test` — Vitest unit tests (e2e excluded)

**Triggers:** `pull_request: [main]` and `push: [main]`. Concurrent runs on the same ref
are cancelled (`cancel-in-progress: true`).

**Node version:** 24 (to match local npm 11 — npm 10/Node 20 rejects the npm-11-generated
lockfile with a spurious "missing from lock file" error).

**Branch protection:** documented in `docs/runbooks/ci-branch-protection.md`. Must be set
manually in GitHub UI or via `gh api` (requires repo admin). Requires the `verify` job —
if the job is renamed the protection context must be updated to match.

## Green-Up Fixes

- **Vitest e2e exclusion** (`vite.config.ts` `test.exclude`) — Playwright `.spec.ts` files
  were leaking into the Vitest run, producing 5 failed files. Scoping to unit tests makes
  the gate trustworthy.
- **Two `prefer-const` fixes** — `useVideoFrameCapture.ts`, `videoProcessing.ts`.
- **Timezone-hermetic test** — `useAutoDetect.test.ts` was constructing `Date` from a
  hardcoded string that differed between local EDT and the UTC-only CI runner. Fixed by
  deriving the expected value dynamically from the same input.

## Planned Phases (Future)

### Plan B — Staging Environment

- Separate staging [[Supabase]] project (migrations + 67 edge functions deployed, seed data).
- Per-PR preview deploys via Vercel or Netlify (separate from Lovable prod host).
- Env vars point at staging backend; CSP parity for [[Capacitor Native Shell]].
- Open question: staging AI-spend guard before wiring the Anthropic key.

### Plan C — e2e on Staging + Gate Wiring

- Parametrize Playwright `baseURL` via env (`PLAYWRIGHT_BASE_URL`).
- Triage e2e suite: keep genuine specs; move `debug-*` / one-off specs to `_scratch/`.
- New e2e CI job running curated smoke suite against the preview URL.
- Branch protection updated to require e2e check as well.

## Key Decisions

- **Human ship gate retained.** Checks run automatically; a human still merges. Aligns with
  [[Musk's Algorithm]] ("automate last; never automate a broken process").
- **No new infrastructure in Plan A.** Highest value / lowest cost first.
- **`npm ci` over `npm install`** for reproducible CI installs.
- Merge to `main` remains deliberate; this gate blocks regressions, not decisions.

## See Also

- [[Wiki Automation]] (companion safety net for docs drift)
- [[Supabase]]
- [[Capacitor Native Shell]]
- [[Musk's Algorithm]]
- [[CI Quality Gate Plan A Session]](../sources/ci-quality-gate-plan-a-session.md)
