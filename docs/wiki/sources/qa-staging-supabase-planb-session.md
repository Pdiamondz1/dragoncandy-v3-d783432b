---
title: QA Staging Supabase (Plan B) Session
type: source
created: 2026-06-02
updated: 2026-06-02
sources: [raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md]
tags: [staging, supabase, ci-cd, migrations, stripe]
---

# QA Staging Supabase (Plan B) Session

Standing up the isolated **staging Supabase project** (`dragoncandy-staging`,
ref `mhffqrawgizhprbobcta`) for the [[QA CI/CD Gate]] — this is **Plan B**
(staging environment) of the gate spec. Vercel per-PR previews were already set
up by the user; this session built the backend: schema (all 213 migrations),
71 edge functions, and the essential function secrets.

## Key Decisions

- **Fix-forward, not a prod-schema baseline** — remediate the migration set so it
  replays cleanly, because the CI gate depends on replayability. Surfaced [[Migration Replay Drift]].
- **AI-spend guard = a dedicated $25/mo Anthropic *workspace*** (infra-enforced hard
  cap), chosen over a code/soft cap so a runaway e2e loop can't overspend on the shared prod key.
- **Stripe staging stays on one sandbox** (`acct_1SkFixJi7lqzzhdM`, the CLAUDE.md account):
  publishable (Vercel) + `STRIPE_SECRET_KEY` (functions) + webhook endpoint must all match.
- **Pure-data destructive migrations skipped via `supabase migration repair --status applied`**
  rather than run — they're no-ops on an empty DB and a safety classifier blocks mass DELETE/TRUNCATE.
- **Webhook receivers need `verify_jwt = false`** in `config.toml` (`stripe-webhook`,
  `toast-redemption-webhook`, `toast-oauth-callback`) — were missing, would 401 external callers.

## What Was Done

Linked CLI to staging (always pinned `--project-ref mhffqrawgizhprbobcta`); pushed
213 migrations after a 7-class remediation; deployed 71 edge functions; set 9 secrets;
created the Stripe webhook endpoint `we_1Te30V…` + `STRIPE_WEBHOOK_SECRET`; verified
`cap:sync` (iOS) still builds. Committed on branch `qa-staging` (`6f25dafc`).
**Remaining:** Step 5 (3-role test accounts + Donny knowledge seed), blocked only on the
staging `service_role` key; plus two Vercel env vars on the user's side.

## Gotchas

- A PreToolUse hook treats some commands as "prod push" and gates on `build`/`typecheck`.
- `supabase/.temp/project-ref` points at staging — verify before any `db push`; never commit `.temp`.
- Migrations are CRLF; `$`-anchored regex misses line ends (see `scripts/fix-migration-terminators.mjs`).

## Frontend Env-Wiring Gap (post-verification finding)

Verifying the deployed Vercel bundle revealed the app was **hardwired to prod**:
`src/integrations/supabase/client.ts` hardcoded the prod Supabase URL + anon key and
ignored `VITE_SUPABASE_URL`, while edge-function callers already read the env var — a
split-brain where auth/DB hit prod but edge calls hit staging. Fixed `client.ts` plus
three other hardcoded callers (`useAnalyticsBatch`, `CreatorProfileModal`, `VerifyEmail`)
to `import.meta.env.VITE_SUPABASE_URL || '<prod fallback>'`. Caveat: `client.ts` is
Lovable-auto-generated, so a future Lovable sync may revert it. This means Plan B's "set
env vars" assumption was incomplete — the app has to actually *read* those vars. See [[Supabase]].

## See Also

- [[QA CI/CD Gate]]
- [[Migration Replay Drift]]
- [[Supabase]]
- [[Stripe Connect]]
- [[Capacitor Native Shell]]
