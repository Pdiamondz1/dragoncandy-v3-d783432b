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
