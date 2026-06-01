---
title: CI Quality Gate Plan A Session
type: source
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-ci-quality-gate-plan-a.md]
tags: [ci, github-actions, testing, quality-gate]
---

# CI Quality Gate Plan A Session

**Date:** 2026-06-01
**Commits:** `7dc3650 ci: add quality gate (build/typecheck/lint/test) + green-up suite (#19)`
**Spec:** `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`
**Plan:** `docs/superpowers/plans/2026-06-01-qa-cicd-planA-ci-quality-gate.md`

## What Changed

Plan A of the QA/Staging initiative. Added a GitHub Actions CI gate requiring build +
typecheck + lint + unit tests to pass on every PR to `main`. No new external infrastructure.

Key changes:
- `.github/workflows/ci.yml` — `verify` job, Node 24, `npm ci` → build → typecheck → lint → test
- `vite.config.ts` — `test.exclude: ['tests/e2e/**']` so Vitest only runs unit tests
- Two `prefer-const` lint fixes (`useVideoFrameCapture.ts`, `videoProcessing.ts`)
- `tests/hooks/useAutoDetect.test.ts` — timezone-hermetic fix for CI
- `docs/runbooks/ci-branch-protection.md` — branch protection setup runbook

## Key Decisions

- Human ship gate retained — aligns with [[Musk's Algorithm]]
- Node 24 in CI to match local npm 11 (npm 10/Node 20 rejects npm-11 lockfile)
- `npm ci` for reproducible installs
- Plan B (staging environment) and Plan C (e2e on staging) are separate, future work

## See Also

- [[CI/CD Quality Gate]]
- [[Supabase]]
- [[Capacitor Native Shell]]
