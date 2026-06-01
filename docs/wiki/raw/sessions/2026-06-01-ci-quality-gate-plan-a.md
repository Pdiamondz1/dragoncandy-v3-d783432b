# Session Extract — CI Quality Gate (Plan A)

**Date:** 2026-06-01
**Commits:** `7dc3650`
**Source spec:** `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`
**Source plan:** `docs/superpowers/plans/2026-06-01-qa-cicd-planA-ci-quality-gate.md`

## What Shipped

Plan A of the QA/Staging CI/CD initiative. Adds a GitHub Actions CI gate and greens up
the test suite — no new external infrastructure required.

### New Files

- **`.github/workflows/ci.yml`** — `verify` job triggers on `pull_request: [main]` and
  `push: [main]`. Steps: `npm ci` → `npm run build` → `npm run typecheck` → `npm run lint`
  → `npm run test`. Uses Node 24 (to match local npm 11 — npm 10 / Node 20 rejects the
  npm-11-generated lockfile with a "missing from lock file" error).
- **`docs/runbooks/ci-branch-protection.md`** — step-by-step guide to require the `verify`
  status check in GitHub branch protection before PRs can merge to `main`.
- **`docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`** — full 3-phase spec
  (Plan A/B/C). Plan A is done; Plans B and C (staging environment, e2e on staging) are
  future work.
- **`docs/superpowers/plans/2026-06-01-qa-cicd-planA-ci-quality-gate.md`** — task-by-task
  implementation plan.

### Green-Up Fixes

- **`vite.config.ts`** — added `test.exclude: ['tests/e2e/**']` so Vitest only runs unit
  tests. Playwright `.spec.ts` files were leaking into the Vitest run and producing 5 failed
  files, making `npm run test` unusable as a gate.
- **`src/hooks/useVideoFrameCapture.ts` + `src/lib/videoProcessing.ts`** — two
  `prefer-const` lint fixes (variables assigned once that were `let`).
- **`tests/hooks/useAutoDetect.test.ts`** — made timezone-hermetic: the test was
  constructing `Date` with a hardcoded time string that produced different results in the
  UTC-only GitHub Actions runner vs. local EDT. Fixed by constructing the expected value
  dynamically from the same input.

## Architectural Decisions

- **Plan A = no new infrastructure.** The CI gate adds only a GitHub Actions workflow.
  Staging (Plan B) and e2e-on-staging (Plan C) are scoped separately to avoid blocking the
  high-value gate.
- **Human ship gate retained.** Checks + staging run automatically; a human still clicks
  Merge. Aligns with "automate last; never automate a broken process" from [[Musk's Algorithm]].
- **Node 24 in CI** to avoid npm lockfile version mismatch. A comment in `ci.yml` explains why.
- **`npm ci` (not `npm install`)** for reproducible CI installs from the lockfile.
- **Job named `verify`** — branch protection uses the job name, not the workflow name. If
  the job is renamed the runbook must be followed to update the protection context.

## Plans B and C (Future)

- **Plan B** — staging Supabase project (apply migrations + deploy 67 edge functions + seed
  test accounts), Vercel/Netlify per-PR preview deploys, env var wiring, CSP parity for
  Capacitor. Key open question: staging AI-spend guard before wiring Anthropic key.
- **Plan C** — parametrize Playwright `baseURL` via env, triage the e2e suite (move
  `debug-*` specs to `_scratch/` non-gating folder), add e2e job to CI, add to branch
  protection.

## Key Takeaways

1. The pre-existing Vitest → Playwright spec leak was silently breaking `npm run test`;
   this fix is what makes the gate trustworthy.
2. Timezone-hermetic tests are required for CI — any test that compares timestamps must
   construct both sides dynamically.
3. Node version alignment between local and CI avoids cryptic lockfile errors.
4. Branch protection must be set manually in GitHub UI or via `gh api` (documented in the
   runbook); it is not code.
5. This is Plan A only. Plans B/C will require open-question resolution before starting
   (staging AI-spend guard, Vercel vs. Netlify decision).
