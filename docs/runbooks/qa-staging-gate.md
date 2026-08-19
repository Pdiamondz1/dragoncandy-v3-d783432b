# QA Staging & CI/CD Gate — Runbook

Operating guide for the quality gate that sits between code and production.
Design spec: `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`.
Branch-protection mechanics: `docs/runbooks/ci-branch-protection.md` (this runbook is the
authoritative, end-to-end reference).

## Pipeline

```
worktree branch → open PR to main
  → CI (.github/workflows/ci.yml)        → job `verify`: build · typecheck · lint · unit tests
  → Vercel auto-deploys the PR to a preview URL (STAGING Supabase backend)
  → E2E (.github/workflows/e2e.yml)      → job `smoke`: Playwright login + dashboard render, all roles
  → branch protection requires `verify` + `smoke` green
  → human reviews + clicks Merge          ← ship gate (no auto-merge)
  → main → Vercel auto-deploys to dragoncandy.com (prod)
```

Merging stays a deliberate human action. The gate blocks merge until checks pass; it never auto-merges.

## Required status checks (enforced on `main`)

| Check | Workflow | Required? | Notes |
|-------|----------|-----------|-------|
| `verify` | `ci.yml` | **Yes** | build + typecheck + lint + unit tests (vitest, e2e excluded) |
| `smoke` | `e2e.yml` | **Yes** | curated Playwright suite vs the staging preview |
| `lighthouse` | `lighthouse-ci.yml` | No | perf/threshold audit; not a correctness gate. Fix `lighthouserc.js` thresholds before requiring it. |

Current protection: `strict: true` (branch up to date before merge), `enforce_admins: false`
(owner can emergency-override), no required reviewers. To re-apply or change, see
`ci-branch-protection.md` — the live command requires **both** contexts:

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

## Staging environment

| Thing | Value |
|-------|-------|
| Staging Supabase | project `dragoncandy-staging`, ref **`mhffqrawgizhprbobcta`** (`https://mhffqrawgizhprbobcta.supabase.co`) |
| Prod Supabase (never touch from staging work) | `zocahiffooqdybdhguqv` |
| Preview host | Vercel (per-PR previews). Prod is also Vercel since 2026-07-15. |
| Stripe | single sandbox `acct_1SkFixJi7lqzzhdM` (keys `…SkFixJi`) — publishable, secret, and webhook must all match |
| AI-spend guard | dedicated `DragonCandy Staging` Anthropic workspace, hard **$25/mo** cap |

Test accounts: `restaurant.staging@dragoncandy.test` (`business_client`),
`creator.staging@dragoncandy.test` (`content_creator`), `brand.staging@dragoncandy.test`
(`brand`). These three are the **entire** staging user table — a founder's own
`@harbormill.net` account exists only in *production*, which is why real credentials never
work against a preview deploy.

> ⚠️ **The shared password IS committed in three tracked files** (2026-07-19 audit): a
> `.claude/handoffs/` doc, a `docs/superpowers/plans/` doc, and
> `tests/e2e/playwright/_scratch/debug-local.spec.ts`. This line previously claimed it was
> "not committed here" — that claim was false and has been corrected rather than left to
> mislead. Treat the password as compromised and rotate it (see "Headless login" below,
> which removes the main reason to hand it around).

### Headless login — verifying auth-gated screens without a person

Signing in by hand made the founder a bottleneck on every UI check, and an agent cannot
type a password into a login form at all. `npm run staging:login` routes around both:

```bash
npm run staging:login -- restaurant --base https://<preview>.vercel.app   # simplest
```

**Prefer a preview URL.** Vercel's Preview scope is wired to staging, so a preview is
correct by configuration. A **local** dev server is not: the committed `.env` sets
`VITE_SUPABASE_URL` to the **prod** project, and `client.ts` falls back to prod when it is
unset — so a staging session handed to `localhost` authenticates against the wrong backend
and silently stays signed out. The script refuses that case rather than reporting a success
that doesn't work. To use localhost, first point it at staging in a gitignored `.env.local`
(which wins over `.env`) and restart the dev server:

```bash
# .env.local
VITE_SUPABASE_URL=https://mhffqrawgizhprbobcta.supabase.co
VITE_SUPABASE_ANON_KEY=<staging anon key>
```

It mints a one-time magiclink via the admin API, exchanges it for a session as JSON, and
prints a URL carrying that session in the hash; supabase-js (`detectSessionInUrl` is on by
default) persists it on open. **No password is involved at any step.** Using the JSON
verify endpoint deliberately avoids Supabase's Redirect-URL allow-list, which cannot cover
per-branch preview hostnames.

Setup once: put the **staging** service-role key in the gitignored
`supabase/scripts/.env.sync.local` as `STAGING_SUPABASE_SECRET_KEY` (see the `.example`).
The script refuses to run against `dragoncandy.io` and refuses a key that looks like prod's.
Sessions last ~1 hour and belong to seeded test accounts holding no real user data.

## Secrets

### GitHub Actions (consumed by `e2e.yml`) — 7
`VERCEL_AUTOMATION_BYPASS_SECRET`, `DC_RESTAURANT_EMAIL`, `DC_RESTAURANT_PASSWORD`,
`DC_CREATOR_EMAIL`, `DC_CREATOR_PASSWORD`, `DC_BRAND_EMAIL`, `DC_BRAND_PASSWORD`.
Set/rotate with: `gh secret set NAME --repo Pdiamondz1/dragoncandy-v3-d783432b --body "…"`.

### Vercel env (Preview scope) — frontend build
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (**staging**), `VITE_STRIPE_PUBLISHABLE_KEY`
(test, `…SkFixJi`), `VITE_GOOGLE_MAPS_API_KEY`. The app must *read* these — `client.ts` and
callers use `import.meta.env.VITE_SUPABASE_URL` with a prod fallback (see env-wiring note below).

### Staging Supabase function secrets — backend
`ANTHROPIC_API_KEY` (staging workspace), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, etc. Set with `npx supabase secrets set --project-ref mhffqrawgizhprbobcta …`.

## Sync step — run whenever schema or edge functions change

Vercel ships the **frontend only**. Staging must be synced explicitly. Always pin the ref.

```bash
# from repo root; SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD in env
npx supabase link --project-ref mhffqrawgizhprbobcta
npx supabase db push                              # apply new migrations
npx supabase functions deploy --project-ref mhffqrawgizhprbobcta   # all functions
```

Migrations must replay cleanly (the gate depends on it). The prod schema has drifted from
`supabase/migrations/`; the remediation classes + the `scripts/fix-migration-terminators.mjs`
helper are documented in project memory (`project_qa_staging_supabase`).

## Gotchas (each cost real debugging time — keep them in mind)

1. **New staging accounts can't log in until `profiles.email_verified = true`.** The app gates
   login on this custom flag, *not* Supabase's `email_confirmed_at` (`src/components/auth/AuthForm.tsx`).
   After creating a staging user:
   ```sql
   UPDATE public.profiles p SET email_verified = true
   FROM auth.users u WHERE p.id = u.id AND u.email = '<new>@dragoncandy.test';
   ```
2. **Vercel previews need the SPA fallback** in `vercel.json` (`/(.*) → /index.html`). Without it,
   every deep link (`/auth`, `/dashboard/*`) returns Vercel `404: NOT_FOUND`; only `/` works.
   Don't delete `vercel.json` — prod deploys from Vercel and depends on it.
3. **Previews are behind Deployment Protection (401).** Playwright sends
   `x-vercel-protection-bypass` from `VERCEL_AUTOMATION_BYPASS_SECRET`. Anonymous access fails.
4. **Fresh accounts redirect to `/profile/*`** (onboarding), not `/dashboard`, on first login — so
   the smoke asserts "reached an authenticated area," not a specific dashboard.
5. **Preview URLs aren't predictable** for long branch names (hashed alias). Get the real URL from
   `gh api repos/.../deployments/<id>/statuses` → `environment_url` (same value the e2e job reads
   from `deployment_status.environment_url`).
6. **Env-wiring:** `src/integrations/supabase/client.ts` must read `VITE_SUPABASE_URL` (with a prod
   fallback), or a staging build silently talks to prod.

   ⚠️ **This file carries the local-dev safety guard** (added 2026-08-19) that stops `npm run dev`
   connecting to production. Its header still says "automatically generated" from the Lovable era.
   **If Lovable ever regenerates it, the guard is silently lost** — a fresh clone would go back to
   reaching prod with no warning. Re-check this file after any Lovable regeneration, and confirm
   `PROD_SUPABASE_URL` and the `VITE_ALLOW_PROD_FROM_LOCAL` block are still present.

## Running the e2e suite manually

The `smoke` job runs automatically on each successful Vercel **Preview** `deployment_status`.
To validate the CI path on demand (e.g. after changing secrets):

```bash
gh workflow run e2e.yml --ref main -f base_url="<a live preview URL>"
gh run list --workflow=e2e.yml --limit 1
```

Locally against a preview:

```bash
PLAYWRIGHT_BASE_URL="<preview URL>" VERCEL_AUTOMATION_BYPASS_SECRET="<secret>" \
DC_RESTAURANT_EMAIL=… DC_RESTAURANT_PASSWORD=… DC_CREATOR_EMAIL=… DC_CREATOR_PASSWORD=… \
npm run test:e2e
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `smoke` never appears on a PR | Vercel preview didn't deploy → no `deployment_status`. Check the Vercel check; required check stays pending (merge blocked — safe). |
| Login step fails: "verify your email" | New account missing `profiles.email_verified = true` (gotcha #1). |
| All routes 404 in the preview | `vercel.json` SPA rewrite missing/removed (gotcha #2). |
| e2e 401 / blank pages | `VERCEL_AUTOMATION_BYPASS_SECRET` missing/stale, or rotated in Vercel but not in GitHub secrets. |
| Auth/DB hits prod on a staging build | Env-wiring regressed (gotcha #6); re-grep `src/**` for `zocahiffooqdybdhguqv`. |
| e2e flaky | Keep the gating set thin/data-independent; quarantine flaky specs to `tests/e2e/playwright/_scratch/`. |

## Maintenance

- **Rotate `VERCEL_AUTOMATION_BYPASS_SECRET`**: regenerate in Vercel → Deployment Protection, then
  `gh secret set VERCEL_AUTOMATION_BYPASS_SECRET …`. Both must match.
- **Promote `_scratch/` specs** into the gate as staging seed data matures (they're `testIgnore`d today).
- **Node-20 actions deprecation** (GitHub, ~2026-09-16): bump `actions/*` runtimes when convenient.
