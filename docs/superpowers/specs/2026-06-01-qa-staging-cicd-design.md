# DragonCandy — QA/Staging Environment & CI/CD Gate

**Date:** 2026-06-01
**Status:** Draft — pending spec review
**Author:** Dame (with Claude Code)

---

## Goal

Put a tested staging environment and an automated quality gate between code and production, so changes are verified on an isolated environment before they can reach `main`. A human still clicks "merge" to ship (a deliberate ship gate), but nothing reaches prod without passing build, typecheck, lint, unit tests, and a curated e2e smoke suite on staging first.

## Why

Today `main` **is** production — Lovable auto-deploys `main` to dragoncandy.io with no gate. There is no staging: Playwright e2e tests currently point at `https://dragoncandy.io` (`playwright.config.ts` baseURL) and `auth.setup.ts` logs into prod. The only CI is `lighthouse-ci.yml` (Lighthouse on PRs). This means any merge is an instant, unverified production deploy. This initiative closes that gap.

## Non-Goals

- **Fully autonomous merge-to-prod.** Decision: a human ship gate is retained (honors the project's "automate last; never automate a broken process" rule and the existing "verify prod after deploy" discipline).
- Replacing Lovable as the production host. `main` → Lovable → prod stays as-is.
- iOS/native build CI (that is the App Store Plan 4 / Codemagic pipeline — separate).
- Supabase branching (paid feature) — a separate static staging project is used instead.
- Load/performance testing beyond the existing Lighthouse CI.

---

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Merge autonomy | **Human ship gate** — checks + staging run automatically; a human merges. |
| Staging host | **Per-PR preview deploys** via Vercel or Netlify (free tier); Lovable still owns prod. |
| Staging backend | **Separate staging Supabase project** — full isolation from prod data. |
| Merge gate | **Full gate** — build + typecheck + lint + unit tests + curated e2e on staging. |
| e2e suite | Triage: keep real specs; move `debug-*`/one-off specs to a non-gating folder. |

---

## End-State Pipeline

```
worktree branch → open PR to main
  → CI gate (GitHub Actions): install · build · typecheck · lint · unit tests (vitest)
  → Vercel/Netlify auto-deploys the PR branch to a preview URL (STAGING Supabase env)
  → CI runs curated Playwright e2e smoke suite against that preview URL
  → branch protection on main requires all checks green
  → human reviews + clicks Merge        ← ship gate
  → main → Lovable auto-deploys to dragoncandy.io (prod)
  → existing prod-verify habit (screenshot, console, both viewports)
```

---

## Architecture & Components

### Phase A — CI quality gate (no new infrastructure)

- **New `.github/workflows/ci.yml`** — triggers on `pull_request: [main]` and `push: [main]`. Steps mirror `lighthouse-ci.yml` conventions (ubuntu-latest, `actions/setup-node@v4` node 20, npm cache): `npm ci` → `npm run build` → `npm run typecheck` → `npm run lint` → `npm run test`.
- **Vitest scope cleanup** — configure Vitest (`vite.config.ts` `test.exclude` or a dedicated config) to exclude `tests/e2e/**`, so `npm run test` runs only unit tests and exits clean. This removes the current "5 failed files" noise (Playwright specs vitest cannot run) and makes the gate trustworthy. Verify the unit suite exits clean with **zero e2e files leaking in** (don't hardcode a unit count — it changes as tests are added).
- **Branch protection on `main`** — require the `ci` checks (and existing Lighthouse) to pass before merge; require the branch be up to date. Configured in GitHub repo settings (documented in a runbook; not code).

### Phase B — Staging environment

- **Staging Supabase project** (new, free tier):
  - Apply existing migrations from `supabase/migrations/` (via `supabase db push` / linked project).
  - **Deploy edge functions explicitly** (`supabase functions deploy`) — the Lovable deploy path only ships frontend, so staging must deploy the 67 Deno functions itself, and keep them in sync.
  - Seed test accounts and reference data (reuse existing test creds + `donny-knowledge-seed.ts` + the transactional-data-reset migration).
  - Set function secrets (Anthropic key, Stripe test keys, etc.) with a **staging AI-spend guard** so staging usage stays inside the 15%/$250 cap. *(Plan B must define what the guard actually is — e.g. a hard per-day cap env var read by the model-routing/cost-ledger layer, a separate low-limit Anthropic key, or a code-level limiter — and decide it BEFORE wiring secrets, so e2e runs against real keys can't cause a surprise overage.)*
- **Preview host (Vercel or Netlify)** linked to the GitHub repo:
  - Build command `npm run build`, output `dist`.
  - Per-PR preview deployments to unique URLs; Lovable remains the prod host (no change to prod).
  - Env vars point at **staging**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (staging), `VITE_STRIPE_PUBLISHABLE_KEY` (test), a referrer-restricted/staging Google Maps key.
- **CSP parity** — add the staging Supabase origins to `index.html` CSP `connect-src`/`img-src`/`media-src` (additive, same pattern as the Capacitor change) so the preview build can reach the staging backend. **`index.html` is also a Capacitor target** (the iOS app loads the same file), so Plan B must verify the Capacitor build/`cap:sync` still passes after the CSP edit — CSP is the trickiest cross-target concern.

### Phase C — e2e on staging + gate wiring

- **Parametrize Playwright `baseURL`** via env (e.g. `PLAYWRIGHT_BASE_URL`), defaulting to the PR preview URL in CI and to local/staging otherwise. `auth.setup.ts` logs into a **staging** test account using credentials from CI secrets (never prod).
- **Triage the suite** — keep genuine specs; move `debug-local`, `debug-message-error`, and other one-off/debug specs into a non-gating folder (e.g. `tests/e2e/playwright/_scratch/`) excluded from the gating run. Define a curated smoke set (auth, core marketplace flow, content delivery, messaging).
- **New e2e CI job** — after the preview deploy is ready, run the curated suite against the preview URL. Add this check to branch protection.
- Merge remains a **human click** (no auto-merge).

---

## Data Flow / Secrets

| Secret | Where | Notes |
|---|---|---|
| Staging Supabase URL + anon key | Vercel/Netlify env + GitHub secrets | Staging only; never prod |
| Staging test-account creds | GitHub secrets (for `auth.setup.ts`) | Distinct from prod test creds |
| Stripe test publishable/secret | Preview env + staging Supabase function secrets | Test mode only |
| Anthropic API key (staging) | Staging Supabase function secrets | Subject to staging AI-spend guard |
| Google Maps key (staging) | Preview env | Referrer-restricted to preview domain |

---

## Error Handling / Failure Modes

- **Preview deploy fails** → e2e job has no URL → gate fails → merge blocked (correct).
- **Staging Supabase out of sync with prod schema/functions** → e2e false failures. Mitigation: a documented sync step (migrations + `functions deploy`) run whenever schema/functions change; consider a CI check that warns on drift.
- **Flaky e2e** → gate becomes untrusted. Mitigation: curated smoke set only, `retries` tuned for CI, quarantine flaky specs to `_scratch/` rather than disabling the whole gate.
- **Secret missing/expired** → CI fails fast with a clear message; documented in the runbook.

---

## Testing / Verification

- Phase A: open a throwaway PR; confirm the `ci` checks run and that a deliberately introduced typecheck/lint/test error blocks merge.
- Phase B: confirm a PR produces a preview URL that loads and talks to staging Supabase (not prod); manually QA a core flow.
- Phase C: confirm the curated e2e suite runs green against the preview URL and that a forced failure blocks merge; confirm `_scratch/` specs do not gate.

---

## Phased Implementation (separate plans)

- **Plan A — CI quality gate**: `ci.yml`, Vitest e2e-exclude cleanup, branch-protection runbook. No new infra. Highest value/lowest cost; do first.
- **Plan B — Staging environment**: staging Supabase (migrations + functions + seed + secrets), Vercel/Netlify preview project, env wiring, CSP parity.
- **Plan C — e2e on staging + gate wiring**: parametrized Playwright, suite triage, e2e CI job, branch-protection update.

---

## Open Questions

1. **Vercel vs Netlify** — both have free per-PR previews and GitHub integration; pick one in Plan B (lean Vercel for first-class preview URLs + GitHub Deployments API, unless a Netlify preference exists).
2. **Staging Maps key** — new restricted key vs reuse with added referrer; decide in Plan B.
3. **Edge-function drift detection** — manual sync runbook for v1, or a CI drift check? Default: manual runbook now, automate later.
4. **Staging data refresh cadence** — how often to reset staging to clean seed (the transactional-data-reset migration supports this).

---

## Success Criteria

1. A PR cannot merge to `main` unless build, typecheck, lint, unit tests, and the curated e2e suite are green.
2. Each PR has a browsable staging preview URL backed by an isolated staging Supabase (no prod data touched).
3. `npm run test` runs only unit tests and exits clean (no e2e-file noise).
4. Merging to `main` remains a deliberate human action; prod continues to deploy via Lovable.
5. The whole gate is documented in a runbook (setup, secrets, sync, troubleshooting).
