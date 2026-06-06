# Changing a Feature — Developer Workflow

How to make a change to the dragoncandy.io app now that the QA staging gate exists.
Deep reference (secrets, sync, troubleshooting): `docs/runbooks/qa-staging-gate.md`.

## The loop (frontend change)

1. **Branch off `main`** (never edit `main` directly — branch protection blocks it):
   ```bash
   git fetch origin && git checkout -b my-feature origin/main
   ```
2. **Build it, verify locally** — same checks the gate runs, so fail fast here:
   ```bash
   npm run dev                                              # iterate at 127.0.0.1:8080
   npm run build && npm run typecheck && npm run lint && npm run test
   ```
3. **Push + open a PR** to `main`:
   ```bash
   git push -u origin my-feature && gh pr create --base main --fill
   ```
   This automatically runs `verify` (CI), spins up a **Vercel preview wired to the
   staging Supabase** (not prod), and runs the `smoke` e2e suite against it.
4. **QA your change on the preview.** Get the URL with:
   ```bash
   npm run preview:url        # prints the current branch's preview URL
   ```
   Open it logged into Vercel (or append `?x-vercel-protection-bypass=<secret>`) and log in
   with the staging test accounts (`*.staging@dragoncandy.test`). Click through your feature
   against the real isolated backend.
5. **Wait for the gate.** `gh pr checks <#> --watch`, or read `mergeStateStatus`:
   `BLOCKED` = a required check (`verify`/`smoke`) pending or failing; `UNSTABLE` or `CLEAN`
   = required checks green, **merge enabled** (a red `lighthouse` is non-required, ignore it).
6. **Merge** (your deliberate click) → `main` → Lovable auto-deploys to dragoncandy.io →
   verify prod (screenshot, console, desktop + mobile viewports).

## If the change touches the backend (DB schema or edge functions)

Lovable ships the **frontend only**, so backend changes need explicit deploys — twice.

1. Add the migration / edit the function under `supabase/`.
2. **Sync staging** so the preview exercises it (always pin the staging ref):
   ```bash
   npx supabase link --project-ref mhffqrawgizhprbobcta
   npx supabase db push
   npx supabase functions deploy --project-ref mhffqrawgizhprbobcta
   ```
3. **After merging, deploy the same to prod** (`zocahiffooqdybdhguqv`) — pushing to `main`
   does NOT apply migrations or deploy functions to prod by itself.

Keep migrations replayable (additive, nullable columns, guarded data migrations) — the gate's
schema replay depends on it.

## Staging-data gotchas

- **New test account can't log in** until its custom flag is set on staging:
  `UPDATE public.profiles SET email_verified = true WHERE id = '<user-id>';`
- **Feature behind a flag** (e.g. brand role): toggle it in `feature_flags` on staging.
- **Changed a flow the smoke covers** (login, dashboard render): update
  `tests/e2e/playwright/smoke.spec.ts`. Richer specs go under `tests/e2e/playwright/` (gating)
  or `_scratch/` (non-gating while stabilizing).
