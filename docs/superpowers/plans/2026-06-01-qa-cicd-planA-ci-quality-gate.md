# QA/CICD — Plan A: CI Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions CI gate (build + typecheck + lint + unit tests) that runs on every PR to `main`, and make all four checks green by scoping Vitest to unit tests and fixing two pre-existing lint errors — so `main` can be branch-protected against regressions with no new infrastructure.

**Architecture:** One new workflow `.github/workflows/ci.yml` reusing the existing `lighthouse-ci.yml` runner setup (ubuntu, `setup-node@v4` node 20, npm cache) but using `npm ci` (reproducible install from the lockfile) rather than lighthouse's `npm install`. Two prerequisite cleanups make the gate green: (1) Vitest currently globs the Playwright e2e `.spec.ts` files and errors — scope it to unit tests; (2) two `prefer-const` lint errors make `npm run lint` exit non-zero — fix them. Branch protection itself is configured in GitHub settings (documented in a runbook; it is not code).

**Tech Stack:** GitHub Actions, Node 20, Vite 5, Vitest 4, ESLint 9 (flat config), existing npm scripts (`build`, `typecheck`, `lint`, `test`).

**Scope boundary:** This plan is Plan A of the QA/staging initiative (spec: `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`). It does NOT create the staging Supabase project, preview deploys, or e2e-on-staging — those are Plans B and C. This plan adds no external infrastructure; everything here runs in GitHub Actions on the existing repo.

---

## Pre-flight (read before Task 1)

- Run all commands from the worktree root: `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\apple-app-store`. Windows + PowerShell; a Bash tool is also available.
- **Verification snippets that use `$?` or `for ...; do` are bash syntax — run those with the Bash tool, not PowerShell.**
- Branch is `worktree-apple-app-store` (correct — not main).
- **Known-broken baseline (this plan fixes it):** today `npm run test` exits **1** (Vitest tries to run 5 Playwright e2e spec files it cannot execute) and `npm run lint` exits **1** (2 `prefer-const` errors). `npm run build` and `npm run typecheck` exit 0. After Tasks 1–2, all four exit 0.
- Commit trailer (required last line of every commit message):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Note: this work logically belongs to the QA/CICD workstream. It is being authored on the `apple-app-store` worktree branch for continuity; that is acceptable for these repo-level config files, but be aware the branch also carries the Apple App Store work.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `vite.config.ts` | Scope Vitest to unit tests (exclude `tests/e2e/**`) | Modify |
| `src/hooks/useVideoFrameCapture.ts` | Fix `prefer-const` lint error (line ~40) | Modify |
| `src/lib/videoProcessing.ts` | Fix `prefer-const` lint error (line ~74) | Modify |
| `.github/workflows/ci.yml` | CI gate: build + typecheck + lint + unit tests | Create |
| `docs/runbooks/ci-branch-protection.md` | How to enable branch protection requiring the gate | Create |

---

## Task 1: Scope Vitest to unit tests (exclude e2e)

Vitest's default `include` globs `**/*.{test,spec}.*`, which pulls in the Playwright specs under `tests/e2e/` — they import `@playwright/test` and fail under Vitest, so `npm run test` exits non-zero. Exclude that directory while preserving Vitest's default excludes.

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Confirm the failing baseline**

Run: `npm run test 2>&1 | tail -4`
Expected: shows `Test Files  5 failed | 20 passed` (or similar with 5 failed) and a non-zero exit. Confirm: `(npm run test >/dev/null 2>&1; echo $?)` prints `1`.

- [ ] **Step 2: Add a `vitest/config` import for the default excludes**

In `vite.config.ts`, add this import near the top (after the existing `vite` import):
```ts
import { configDefaults } from 'vitest/config';
```

- [ ] **Step 3: Add the exclude to the `test` block**

In `vite.config.ts`, change the existing test block:
```ts
  test: {
    globals: true,
    environment: 'node',
  },
```
to:
```ts
  test: {
    globals: true,
    environment: 'node',
    // Unit tests only — Playwright e2e specs live in tests/e2e and run via playwright.config.ts
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
```

- [ ] **Step 4: Verify the suite is now unit-only and green**

Run: `npm run test 2>&1 | tail -4`
Expected: no `failed` test files; only unit tests run; summary like `Test Files  N passed`. Confirm clean exit: `(npm run test >/dev/null 2>&1; echo $?)` prints `0`.
Also confirm no e2e leaked in: the output must NOT reference any path under `tests/e2e/`.

- [ ] **Step 5: Commit**
```bash
git add vite.config.ts
git commit -m "test: scope Vitest to unit tests, exclude Playwright e2e specs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Fix the two pre-existing lint errors

`npm run lint` (`eslint .`) exits non-zero because of exactly two `prefer-const` errors. ESLint fails only on errors (warnings don't fail), so fixing these makes the lint gate green. Both are a `timeout` variable assigned exactly once.

⚠️ **Do NOT just change `let` to `const` on the declaration line.** In both files the declaration is *bare* (`let timeout: ReturnType<typeof setTimeout>;`) and the assignment (`timeout = setTimeout(fail, 10_000);`) is ~18 lines later. `const` with no initializer is a TypeScript error and would break the build. The correct fix is to **delete the bare declaration line** and add `const` to the assignment line. This is safe: the `cleanup`/`fail` closures reference `timeout` only when they execute (via `setTimeout`/event listeners registered *after* the assignment), never before it is set — so a `const` declared at the assignment site is fully initialized by the time any closure reads it.

**Files:**
- Modify: `src/hooks/useVideoFrameCapture.ts`
- Modify: `src/lib/videoProcessing.ts`

- [ ] **Step 1: Confirm the failing baseline**

Run (Bash tool): `(npm run lint >/dev/null 2>&1; echo $?)`
Expected: `1`. To see the two errors:
Run: `npx eslint src/hooks/useVideoFrameCapture.ts src/lib/videoProcessing.ts`
Expected: two `prefer-const` errors — `'timeout' is never reassigned. Use 'const' instead`.

- [ ] **Step 2: Fix `useVideoFrameCapture.ts`**

Delete this line (the bare declaration, ~line 40):
```ts
    let timeout: ReturnType<typeof setTimeout>;
```
Then change the assignment line (~line 58) from:
```ts
    timeout = setTimeout(fail, 10_000);
```
to:
```ts
    const timeout = setTimeout(fail, 10_000);
```
Leave `let settled = false;` and everything else unchanged (`settled` IS reassigned, so it stays `let`).

- [ ] **Step 3: Fix `videoProcessing.ts`**

Delete this line (the bare declaration, ~line 74):
```ts
    let timeout: ReturnType<typeof setTimeout>;
```
Then change the assignment line (~line 90) from:
```ts
    timeout = setTimeout(fail, 10_000);
```
to:
```ts
    const timeout = setTimeout(fail, 10_000);
```
Leave `let settled = false;` unchanged.

- [ ] **Step 4: Verify lint is green and nothing else broke** (the typecheck/build here specifically prove the `const` refactor did not introduce a use-before-declaration error)

Run: `(npm run lint >/dev/null 2>&1; echo $?)`  → Expected: `0`.
Run: `npm run typecheck` → Expected: no errors.
Run: `npm run build 2>&1 | tail -2` → Expected: build succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useVideoFrameCapture.ts src/lib/videoProcessing.ts
git commit -m "fix(lint): prefer-const for never-reassigned timeout (2 files)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add the CI workflow

Create the gate workflow. It mirrors `lighthouse-ci.yml` (ubuntu, `setup-node@v4` node 20, npm cache) and runs the four checks. The job name `verify` is the status-check context branch protection will require (Task 4).

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Build
        run: npm run build

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test
```

- [ ] **Step 2: Validate the YAML parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!/jobs:\s/.test(s)||!/verify:/.test(s)){throw new Error('workflow missing jobs/verify')};console.log('ci.yml structure OK')"`
Expected: `ci.yml structure OK`.

(GitHub Actions cannot run locally; the four commands it invokes are verified locally in Task 5. If `actionlint` happens to be installed, `actionlint .github/workflows/ci.yml` should also pass — optional.)

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build/typecheck/lint/test gate on PRs to main

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Branch-protection runbook

Branch protection is configured in GitHub (UI or API), not in the repo. Document it so the user can enable it; include a ready-to-run `gh` command. Do NOT run the command in this plan — it modifies the GitHub repo and requires the repo owner's admin auth.

**Files:**
- Create: `docs/runbooks/ci-branch-protection.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/ci-branch-protection.md`:
```markdown
# CI Branch Protection — Runbook

The `CI` workflow (`.github/workflows/ci.yml`) runs build, typecheck, lint, and
unit tests on every PR to `main`. To make these a hard gate, require the
`verify` status check before merge.

## Enable via GitHub UI
1. Repo → Settings → Branches → Add branch ruleset (or classic branch protection) for `main`.
2. Require a pull request before merging.
3. Require status checks to pass → add **`verify`** (the CI job) and the existing
   Lighthouse check if desired. Enable "Require branches to be up to date before merging".
4. Save.

## Enable via gh CLI (run by the repo owner; requires admin auth)
> Replace OWNER/REPO if it changes. Current remote: Pdiamondz1/dragoncandy-v3-d783432b.
```bash
gh api -X PUT repos/Pdiamondz1/dragoncandy-v3-d783432b/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=verify" \
  -f "enforce_admins=false" \
  -f "required_pull_request_reviews[required_approving_review_count]=0" \
  -f "restrictions=null"
```

## Notes
- The required check name must match the **job name** (`verify`). If the job is
  renamed in `ci.yml`, update the protection context to match.
- Merge to `main` remains a deliberate human action (the project's ship gate).
  This gate blocks merging until checks pass; it does not auto-merge.
- The first CI run must complete once on a PR before `verify` appears as a
  selectable required check in the UI.
```

- [ ] **Step 2: Commit**
```bash
git add docs/runbooks/ci-branch-protection.md
git commit -m "docs(ci): branch-protection runbook for the CI gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Final local verification of the gate commands

Prove that the exact commands the CI job runs are all green locally (this is the best local proxy for "the gate will pass in Actions").

- [ ] **Step 1: Run the four gate commands in sequence**

Run:
```bash
npm ci && npm run build && npm run typecheck && npm run lint && npm run test
```
Expected: every command exits 0; the chain completes. Unit tests pass with no `tests/e2e/` files involved.

- [ ] **Step 2: Confirm individual exit codes (belt and suspenders)**

Run:
```bash
for c in "build" "typecheck" "lint" "test"; do (npm run $c >/dev/null 2>&1; echo "$c -> $?"); done
```
Expected:
```
build -> 0
typecheck -> 0
lint -> 0
test -> 0
```

- [ ] **Step 3: No commit needed** (verification only). If any command fails, return to the relevant task and fix before declaring the gate ready.

---

## Plan A Definition of Done

- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test` each exit 0 locally.
- [ ] Vitest runs only unit tests (no `tests/e2e/` files), exit 0.
- [ ] `.github/workflows/ci.yml` exists with a `verify` job running the four checks on PRs and pushes to `main`.
- [ ] Branch-protection runbook committed.
- [ ] No web behavior changed (the only source edits are `let`→`const`, which are behavior-preserving).

## Next (not in this plan)

- **Plan B — Staging environment:** staging Supabase project (migrations + edge functions + seed + AI-spend guard), Vercel/Netlify per-PR previews, env wiring, CSP parity (verify Capacitor build after CSP edit).
- **Plan C — e2e on staging + gate wiring:** parametrize Playwright `baseURL`, triage debug specs into a non-gating folder, add the e2e job to branch protection.
