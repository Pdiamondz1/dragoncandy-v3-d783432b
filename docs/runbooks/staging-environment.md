# Staging Environment — Runbook

Staging is an isolated lane that lets QA/e2e run against a non-prod backend.
**Production is unchanged** — Lovable still builds `main` against the prod
Supabase project. Staging = a separate Supabase project + Vercel per-PR previews.

## How target switching works
`src/integrations/supabase/client.ts` reads `VITE_SUPABASE_URL` /
`VITE_SUPABASE_PUBLISHABLE_KEY` and **falls back to the prod project** when
unset. So:
- **Lovable prod** (env unset) → prod Supabase (unchanged).
- **Vercel preview** (env set to staging) → staging Supabase.

⚠️ **Exact env var names matter:** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (matches `.env.example`). NOT `..._ANON_KEY`.
A name mismatch silently falls back to **prod**.

## Telling staging from prod
The `StagingBanner` (App root) renders:
- nothing on `dragoncandy.io` (prod),
- a calm `LOCAL` banner on localhost,
- `STAGING · Supabase: <ref>` on previews wired to staging,
- a **RED** `PREVIEW on PROD backend` banner if a preview forgot its env vars
  (your signal to fix the Vercel env).

## One-time setup

### A. Staging Supabase project (needs Supabase auth)
1. Create a project, e.g. `dragoncandy-staging` (free tier).
2. `supabase link --project-ref <staging-ref>` then `supabase db push`
   (applies `supabase/migrations/`).
3. `supabase functions deploy --project-ref <staging-ref>` — deploy the edge
   functions (the Lovable deploy path does NOT cover these; count: run
   `ls supabase/functions | grep -v _shared | wc -l`).
4. Seed: test accounts + `supabase/seed/donny-knowledge-seed.ts`. The
   transactional-data-reset migration enables clean resets.
5. Set function secrets: Stripe **test** keys, Anthropic key — see AI-spend guard.

### B. Vercel project (needs Vercel auth)
1. Import the GitHub repo. `vercel.json` (committed) sets framework=vite,
   output `dist`, SPA rewrites.
2. Set **Preview** env vars: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` (staging), `VITE_STRIPE_PUBLISHABLE_KEY`
   (test), `VITE_GOOGLE_MAPS_API_KEY` (referrer-restricted/staging key).
   Leave **Production** env unset (Vercel prod is unused; Lovable owns prod).
3. Open a PR → confirm a preview URL appears and the `STAGING` banner shows.

## AI-spend guard (decide before e2e runs against real keys)
Keep staging AI usage inside the 15% / $250 cap. Simplest options:
- a **dedicated low-limit Anthropic key** for staging, or
- a `STAGING_AI_DAILY_CAP` secret read by the model-routing/cost-ledger layer.

## Maintenance / gotchas
- **Schema/function drift:** re-run `db push` + `functions deploy` to staging
  whenever migrations or functions change. (Manual for v1; automate later.)
- **No CSP change needed:** `index.html` `connect-src` already allows
  `https://*.supabase.co` (wildcard covers staging). Do not add redundant entries.
- **Known minor caveat:** `index.html` has a hardcoded
  `<link rel="preconnect" href="https://zocahiffooqdybdhguqv.supabase.co">`
  (prod). On previews this preconnect still points at prod — harmless (perf
  hint only; the client uses the env-configured URL). Left as-is for v1.

## Next
Plan C wires Playwright e2e to the preview URL and adds the e2e job to branch
protection.
