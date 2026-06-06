# Handoff: QA Staging Supabase Environment (CI/CD Gate — Plan B)

## Session Metadata
- Created: 2026-06-02 20:56:07
- Project: C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\apple-app-store-2
- Branch: qa-staging
- Session duration: ~1 long session

### Recent Commits (for context)
  - 6f25dafc fix(staging): make 213-migration set cleanly replayable for QA staging DB
  - 3fa33d91 fix(cgc): unblock customer submissions — storage upload RLS + missing social_handles column
  - 88a6923d fix(dragonshare): retire raw push inserts now that dragonshare-notify owns delivery

## Handoff Chain

- **Continues from**: None — standalone. (The scaffold auto-linked the most-recent
  handoff `2026-05-21-160000-counter-offer-enum-fix.md`, but that work is unrelated.)
- **Supersedes**: None

## Current State Summary

Standing up the **isolated staging Supabase project** for the QA/CI-CD gate
(spec: `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`, this is
**Plan B — Staging environment**). Vercel per-PR previews were already set up by
the user. This session created and populated the staging Supabase backend:
schema (all 213 migrations), all 71 edge functions, and the essential function
secrets. **Steps 1–4 and 6 are DONE. Step 5 (seed + test accounts) is the only
remaining backend work, blocked solely on the staging `service_role` key.** The
user must also finish adding two Vercel env vars on their side.

## Codebase Understanding

## Architecture Overview

- Prod Supabase: `zocahiffooqdybdhguqv` (us-east-2). Staging: `mhffqrawgizhprbobcta`
  (`dragoncandy-staging`, us-east-1, PG 17). Both in org `jqoccazvwztzbzdumibm`.
- **The Supabase MCP can reach BOTH projects** — always pin
  `--project-ref mhffqrawgizhprbobcta` on any write so prod is never touched.
- Prod was built through Lovable's migration path, NOT a clean sequential replay,
  so the 213-migration history had latent defects that only surfaced replaying
  onto an empty DB. See [[project_qa_staging_supabase]] memory for the full list.
- Lovable only deploys the frontend on push to main; **edge functions + secrets
  must be deployed to staging explicitly** (see [[project_lovable_edge_function_deploy_gap]]).

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md` | The QA/staging spec | Defines Plan A/B/C; Plan B is this work |
| `scripts/fix-migration-terminators.mjs` | CRLF-safe detector for missing `;` after `$function$`/`$$` close tags | Re-run if more replay errors appear |
| `supabase/config.toml` | Edge function JWT config | Added `verify_jwt=false` for the 3 webhook receivers |
| `supabase/seed/donny-knowledge-seed.ts` | Donny RAG knowledge seed | Run during Step 5 |
| `.github/workflows/ci.yml` | Plan A CI gate (already shipped) | Plan C wires e2e onto this |

### Key Patterns Discovered

- Supabase CLI is NOT installed globally — use `npx supabase` (v2.104.0 confirmed).
- CLI needs env vars `SUPABASE_ACCESS_TOKEN` (a Personal Access Token) and
  `SUPABASE_DB_PASSWORD` (staging DB password) for link/push/secrets.
- `db push` is resumable — it records each migration as it applies, so after a
  fix you just re-run and it continues from the failed one.
- CSP in `index.html` already uses wildcard `https://*.supabase.co` /
  `wss://*.supabase.co`, so staging is covered with NO edit (parity already holds).

## Work Completed

### Tasks Finished

- [x] Linked CLI to staging (`mhffqrawgizhprbobcta`), verified link before any write
- [x] Pushed all 213 migrations (remediated 7 defect classes — see Decisions)
- [x] Deployed all 71 edge functions to staging
- [x] Set 9 essential function secrets on staging (names below)
- [x] Created Stripe webhook endpoint `we_1Te30VJi7lqzzhdMzKgIcsRI` on the sandbox + set `STRIPE_WEBHOOK_SECRET`
- [x] Added `verify_jwt=false` for webhook receivers + redeployed them
- [x] Committed all migration/config/script changes to `qa-staging` (6f25dafc)
- [x] Verified `cap:sync` (iOS target) still builds green
- [x] `npm run build` + `npm run typecheck` both pass

## Files Modified (committed in 6f25dafc — 11 files)

| File | Changes | Rationale |
|------|---------|-----------|
| `supabase/migrations/20250814143438_*.sql` | add `;` after 2 `$function$` | missing terminator broke replay |
| `supabase/migrations/20250814143522_*.sql` | add `;` after `$function$` | same |
| `supabase/migrations/20250814165714_*.sql` | `DROP FUNCTION` before CREATE OR REPLACE | return-type change (42P13) |
| `supabase/migrations/20251003133809_*.sql` | guard seed INSERT | null user_id on empty DB |
| `supabase/migrations/20260407000000_clean_stale_data.sql` | wrap cleanup in IF-EXISTS guard | no-op on empty DB |
| `supabase/migrations/20260412000001_toast_connections.sql` | exception-guard pgsodium | pgsodium deprecated on new projects |
| `supabase/migrations/20260426210000_add_get_user_org_ids.sql` (NEW) | adds function from prod's def | existed only out-of-band on prod |
| `supabase/migrations/20260526200000→210000_dragonshare_optimization.sql` | rename | duplicate version prefix |
| `supabase/migrations/20260601200000→200001_fix_promotion_videos_upload_policy.sql` | rename | duplicate version prefix |
| `supabase/config.toml` | add 3 `verify_jwt=false` blocks | webhook receivers were 401'ing |
| `scripts/fix-migration-terminators.mjs` (NEW) | detector/fixer | find missing terminators |

NOTE: `supabase/.temp/*` files show as modified (CLI link state now points at
staging) — these are **intentionally NOT committed**; committing them would
repoint everyone's CLI default at staging.

## Decisions Made

| Decision | Options | Rationale |
|----------|---------|-----------|
| Schema via fix-forward (not prod-schema baseline) | fix-forward / baseline dump | Makes migrations cleanly replayable — the CI gate depends on it |
| 2 pure-data destructive migrations skipped via `supabase migration repair --status applied` | run guarded / repair-skip | They're no-ops on empty staging; a safety classifier blocks mass DELETE/TRUNCATE. User chose repair-skip for `20260407000000`; same applied to `20260517100000` |
| AI-spend guard = option (a), $25/mo hard cap | (a) separate key / (b) prod key+cap / (c) code limiter | Only (a) is an infra-enforced HARD cap; isolated billing; no code |
| Staging Stripe = same sandbox as CLAUDE.md (`acct_1SkFixJi7lqzzhdM`) | same / separate sandbox | Keeps pub+secret+webhook on one account; user chose Option 1. NOTE: user first pasted a secret key from a DIFFERENT account (`…SkFioJix`) — it was replaced |
| Webhook endpoint created via `curl`+test key | MCP / curl | MCP `stripe_api_execute` errored "Unknown tool"; curl with the sandbox key is account-correct |

## Pending Work

## Immediate Next Steps

1. **Get the staging `service_role` key** from the user (staging → Project Settings
   → API). It is backend-only — never put it in Vercel; rotate after use if desired.
2. **Step 5a — create 3 test accounts** (restaurant/creator/brand) on staging via
   the Auth Admin API (`POST {staging-url}/auth/v1/admin/users` with the service_role
   key, `email_confirm: true`). Then create matching `profiles` / `business_profiles`
   / `creator_profiles` rows with the right `role` + `account_type`
   (`restaurant`/`brand`). Mirror the prod test accounts in [[reference_browser_credentials]]
   but with DISTINCT staging creds; store them as GitHub secrets later for Plan C `auth.setup.ts`.
3. **Step 5b — run the Donny seed**: `supabase/seed/donny-knowledge-seed.ts` against
   staging (check its header for how it's invoked — likely needs service_role + URL).
4. After Step 5, Plan B is complete. Plan C (parametrize Playwright `baseURL`, triage
   the e2e suite, add the e2e CI job, branch protection) is the next plan.

### Blockers/Open Questions

- [ ] Staging `service_role` key needed for Step 5 (only blocker).
- [ ] Confirm `donny-knowledge-seed.ts` invocation method (Deno vs node, auth used).
- [ ] How/where to merge the `qa-staging` branch (it's a local worktree branch; PR to main vs keep for the gate).

### Deferred Items

- Peripheral secrets intentionally UNSET on staging (those functions stay dark; not
  in the e2e smoke set): `OPENAI_API_KEY`, `OUTSTAND_API_KEY`, `OUTSTAND_BASE_URL`,
  `OUTSTAND_MCP_URL`, `TOAST_*` (CLIENT_ID/SECRET/OAUTH URLs/WEBHOOK_SECRET),
  `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`PHONE_NUMBER`.

## Context for Resuming Agent

## Important Context

- **Vercel finalization is on the USER**: add to Preview env scope
  `VITE_STRIPE_PUBLISHABLE_KEY` (the `pk_test_51SkFixJi…` from CLAUDE.md) and
  `VITE_GOOGLE_MAPS_API_KEY` (a referrer-restricted staging Maps key).
  `VITE_SUPABASE_URL` = `https://mhffqrawgizhprbobcta.supabase.co` and
  `VITE_SUPABASE_ANON_KEY` (legacy anon JWT) were provided earlier.
- The staging Stripe trio MUST stay on one account (`acct_1SkFixJi7lqzzhdM`):
  publishable (Vercel) + `STRIPE_SECRET_KEY` (functions) + webhook endpoint.

## Assumptions Made

- The curated e2e smoke set (auth, marketplace, content delivery, messaging) does
  not require Toast/Twilio/Outstand/OpenAI — hence those secrets were deferred.
- Demo seed data from the skipped data migrations isn't needed; real test accounts
  will be created in Step 5 instead.

## Potential Gotchas

- A **PreToolUse hook** treats some commands (supabase deploy, the Stripe curl) as
  "production push" and blocks until `npm run build` + `npm run typecheck` pass.
  Both passed this session — re-run the command to proceed.
- A **safety classifier** blocks running migrations/commands that mass-DELETE/TRUNCATE
  data. Use `migration repair --status applied <version>` to skip pure-data migrations.
- `supabase/.temp/project-ref` currently = staging. Verify it before any `db push`.
- Migrations are CRLF — regex anchored on `$` misses line ends; use the .mjs detector.

## Environment State

### Tools/Services Used

- `npx supabase` CLI (v2.104.0) — link/push/functions deploy/secrets/repair
- Supabase MCP (`mcp__plugin_supabase_supabase__*`) — list_projects, execute_sql (read prod fn defs), list_extensions, keys
- Stripe REST API via `curl` (sandbox `acct_1SkFixJi7lqzzhdM`)

### Active Processes

- None. Staging project is ACTIVE_HEALTHY; no local servers running.

### Environment Variables (NAMES only)

- CLI auth (provide at runtime, do not store): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
- Staging function secrets SET: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `APP_URL`, `DRAGONCANDY_APP_URL`,
  `PUBLIC_SITE_URL`, `INVITATION_TTL_DAYS`, `CRON_SECRET`
  (`SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` auto-injected by platform)
- Vercel (Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`

## Related Resources

- Spec: `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`
- Memory: [[project_qa_staging_supabase]], [[project_lovable_edge_function_deploy_gap]], [[reference_browser_credentials]]
- Plan A (shipped): `docs/superpowers/plans/2026-06-01-qa-cicd-planA-ci-quality-gate.md`
- Branch: `qa-staging` @ 6f25dafc

---

**Security Reminder**: No secret values are stored in this handoff — names and locations only.
