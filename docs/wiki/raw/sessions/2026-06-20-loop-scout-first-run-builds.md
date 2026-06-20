# Session 2026-06-19/20 — Loop Scout first run: triage + two cron builds

Continuation of the 2026-06-19 AIOS automation-loops session (PRs #130/#131). After both
loops went live, the founder ran each manually to validate, then triaged the Loop Scout's
first batch of findings and built the two clean candidates.

## Go-live validation (both loops)

- **Loop 1 (knowledge-freshness self-heal):** first manual run reported "no findings filed,
  RAG auto-synced" — the self-heal detected `donny_knowledge` lagged the merged wiki (case b)
  and ran the blessed sync itself. A second run reported "Knowledge layer current" (idempotent
  no-op). Confirms the detector→self-healer upgrade works end-to-end in prod and folded the
  prior session's wiki pages into RAG with zero manual work.
- **Loop 2 (Loop Scout):** first run filed **5 ranked findings** to `/internal/findings`
  (`source:"loop-scout"`, `[loop]`-tagged), all fresh inserts, none re-proposing an existing loop.

## Loop Scout first-run scorecard — 5 findings, all triaged

Each candidate was dug into (read the named edge fn + live data) before acting. The
report-only design meant wrong candidates cost only a triage, never a bad auto-built cron.

| Finding | Sev | Outcome |
|---|---|---|
| `expire-social-hooks` | high | **resolved (built)** — PR #133 |
| `email-verification-token-cleanup` | medium | **resolved (built)** — PR #134 |
| `donny-scheduled-posts-dispatch` | high | **wontfix** — human-gated by design |
| `donny-cost-rollup-cron` | high | **acknowledged** — real gap, needs design fix not a cron |
| `donny-analytics-alerts-cron` | medium | **wontfix** — per-user API, not a cron |

Final tally: **2 built, 2 wontfix, 1 acknowledged.** Full triage rationale is preserved in
each finding's `evidence.triage` JSON.

### Why the three non-builds were rejected (the Scout's misses)

- **donny-scheduled-posts-dispatch (wontfix):** the Scout read 2 Instagram posts "stuck in
  scheduled 24+ days" as a missing dispatcher. Investigation showed publishing is **human-gated
  by design**: `fire-campaign-social-hook` drafts a post (`status=draft`) + fires a "Post Now"
  nudge; `DonnyProvider.publishDraft` posts via `outstand-proxy` and sets `published`.
  `confirm-posting-schedule` delegates scheduled-time publish to Outstand; DragonShare boosts
  publish via their own flow. A dispatch cron would auto-post without the consent tap. The 2
  stuck rows were founder-owned legacy/test data (cancelled during triage).
- **donny-cost-rollup-cron (acknowledged):** a *real* dead control (platform AI cost-cap
  kill-switch, zero callers) — but the Scout's "add a daily cron" would ship **flapping**
  enforcement. Two blockers: (1) **writer conflict** — `donny-cost-rollup` bulk-sets
  `donny_usage.current_stage` (`.eq(period_start).neq(essential)`, no user filter) on platform
  $ spend, while `usage-tracker.incrementUsage` recomputes that same per-user column from
  action-count on every AI call, so the rollup's escalation is overwritten on the next user
  action; (2) **ledger undercount** — MTD `donny_cost_ledger` ≈ $2 but real AI spend ≈ $225/mo
  (external Anthropic/OpenAI billing never hits the ledger). Correct fix = separate the platform
  stage from the per-user stage (`effective = max(platform, user)`) + fix the spend source of
  truth, THEN schedule. Not urgent at ~$2/mo ledger spend.
- **donny-analytics-alerts-cron (wontfix):** the Scout described a "daily anomaly-detection pass
  over analytics_events" — all hallucinated. `donny-analytics-alerts` is a **per-user,
  request-scoped read API** (Donny OAuth tool, scope `analytics:read`) returning one user's
  personal alert feed; it never touches `analytics_events`, does no anomaly detection, and
  structurally can't be cron-driven (requires a per-user identity). A platform analytics digest
  would be a NEW function, partly already covered by the weekly brief + bug-sweep.

## Build 1 — schedule `expire-social-hooks` (PR #133)

A dead cleanup control: the edge fn existed but nothing invoked it, so `campaign_social_hooks`
never expired (18 stale `pending`) and finished-campaign posting delegations were never revoked.
It's **tightening-only** (expires hooks; revokes posting delegation; never grants/publishes), so
it passes "afford wasted runs" cleanly.

- **Scheduled** daily 01:00 UTC via Vault-backed pg_cron + `net.http_post`, modeled on
  `content-performance-capture` (NOT the dead `app.settings.*` GUC pattern — those GUCs are unset
  in prod, which is why the `toast-token-refresh` cron is silently dead).
- **Auth hardened**: replaced the exact `Bearer===SERVICE_ROLE_KEY` check with the shared
  `_shared/ingest-auth.ts` gate (inject-or-`AIOS_INGEST_SECRET`), so a key rotation can't 401 it
  (the failure class fixed in PR #129).
- **`config.toml`**: added `[functions.expire-social-hooks] verify_jwt=false` — the opaque
  `sb_secret` bearer is not a JWT, so the gateway would reject it before the self-gate. **Codex
  caught this as a P1** (would have 401'd the cron forever, invisibly).
- Verified in prod: edge fn v44, cron jobid 5; manual invoke returned
  `200 {"ok":true,"expired_hooks":18,"revoked_permissions":0}`.

### Gotcha — the `aios_ingest_key` Vault landmine

Prod had a Vault secret literally named `aios_ingest_key` that held the **stale legacy
service-role JWT** (`eyJ…` len 219), NOT the `sb_secret_…` value the gate expects (len 41). The
known-good sb_secret lives in `content_capture_key`. First invoke returned the fn's own 401 (body
`{"error":"Unauthorized"}`, NOT a gateway error — which confirmed `verify_jwt=false` worked).
Corrected `aios_ingest_key` in prod to the sb_secret (copied from `content_capture_key`); nothing
live referenced it. Lesson: when wiring a new cron to an ingest-gated fn, (1) add
`verify_jwt=false`, (2) confirm the Vault bearer secret is the sb_secret, not a JWT, before
scheduling. Recorded in memory `project_aios_ingest_secret_rotation`.

## Build 2 — schedule `expire-email-verification-tokens` (PR #134)

The simplest build of the five: a **pure-SQL pg_cron** (no edge fn / auth / Vault), same shape as
`cleanup-stale-presence`.

- `delete from public.email_verification_tokens where expires_at < now()` daily 05:30 UTC.
- **Lossless**: the durable verification outcome is persisted on `profiles.email_verified` (set by
  `verify-email`), not the token table. Value is **security data-minimization** (drop
  credential-shaped `token`+`user_id` rows once dead), not storage — 38 rows is trivial.
- Makes recurring what the one-shot `20260407000000_clean_stale_data.sql` did once.
- Verified in prod: cron jobid 6; one-time run cleared the 38-row backlog to 0.

## Affected artifacts

- `supabase/functions/expire-social-hooks/index.ts` (auth → shared gate)
- `supabase/config.toml` (`expire-social-hooks` verify_jwt=false)
- `supabase/migrations/20260619170000_expire_social_hooks_cron.sql` (new)
- `supabase/migrations/20260619180000_expire_email_verification_tokens_cron.sql` (new)
- prod-only (not in repo): corrected Vault `aios_ingest_key`; created Vault `expire_social_hooks_url`
- cron jobs now active: jobid 5 (expire-social-hooks), jobid 6 (expire-email-verification-tokens)

## Reviews / process

- Codex second review on both builds: P1 caught + fixed on #133; clean on #134.
- The two non-build cron findings stay `acknowledged`/`wontfix` so the monthly Loop Scout's dedup
  won't re-file them; the two built ones now appear in `.claude/schedules`-equivalent cron state,
  so the Scout sees them as already-covered next month.
