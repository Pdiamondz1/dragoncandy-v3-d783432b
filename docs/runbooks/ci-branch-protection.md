# CI Branch Protection — Runbook

> For the full gate (staging Supabase, e2e, secrets, sync, troubleshooting), see
> `docs/runbooks/qa-staging-gate.md`. This page covers branch-protection mechanics only.

The `CI` workflow (`.github/workflows/ci.yml`) runs build, typecheck, lint, and
unit tests on every PR to `main` (job `verify`), and the `E2E` workflow
(`.github/workflows/e2e.yml`) runs the curated Playwright smoke suite against the
staging preview (job `smoke`). Both are required before merge.

## Enable via GitHub UI
1. Repo → Settings → Branches → Add branch ruleset (or classic branch protection) for `main`.
2. Require a pull request before merging.
3. Require status checks to pass → add **`verify`** (CI job) and **`smoke`** (E2E job).
   Leave the `lighthouse` check optional (it's a perf/threshold audit, not a correctness gate).
   Enable "Require branches to be up to date before merging".
4. Save.

## Enable via gh CLI (run by the repo owner; requires admin auth)
> Replace OWNER/REPO if it changes. Current remote: Pdiamondz1/dragoncandy-v3-d783432b.
> This is the **live** configuration applied on `main` (requires `verify` + `smoke`).
```bash
gh api -X PUT repos/Pdiamondz1/dragoncandy-v3-d783432b/branches/main/protection \
  -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "checks": [ { "context": "verify" }, { "context": "smoke" } ] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

## Notes
- The required check names must match the **job names** (`verify` in `ci.yml`,
  `smoke` in `e2e.yml`). If a job is renamed, update the protection context to match.
- Merge to `main` remains a deliberate human action (the project's ship gate).
  This gate blocks merging until checks pass; it does not auto-merge.
- A check must report once on a PR before it appears as a selectable required check
  in the UI. `smoke` reports only after Vercel posts a successful Preview
  `deployment_status`; if no preview deploys, the required check stays pending and
  the PR stays blocked (safe).
