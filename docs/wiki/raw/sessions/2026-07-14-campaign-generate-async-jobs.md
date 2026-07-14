# Session: Campaign generation async jobs (mobile-drop-proof transport)

**Date:** 2026-07-14
**Branch:** `feat/campaign-generate-async-jobs` (PR #232) — follow-up to PR #230
**Spec:** `docs/superpowers/specs/2026-07-14-campaign-generate-async-jobs-design.md`

## Why not streaming

PR #230 proved the failure: the ~40–60s non-streaming `donny-campaign-generate` fetch
died on mobile (tab backgrounded during a video call) while `donny_cost_ledger` showed
the server finishing at the exact minute of the client's failure toast. The instinctive
fix — the PR #148 NDJSON keepalive pattern — was rejected on evidence: PR #151 already
proved a *streamed* fetch still dies on mobile Safari when the tab suspends, and this
payload can't be shortened (full business context + 3 campaign ideas). The only
transport that survives any client interruption is one where the result lands somewhere
the client can come back for.

## The pattern: async job + own-row polling

1. Client sends the normal request plus `async: true` → the fn (after auth + hourly
   rate limit) inserts a `campaign_generation_jobs` row and returns `{job_id}` in <1s.
2. The unchanged pipeline runs inside `EdgeRuntime.waitUntil`, writing `progress`
   ("Reading your link…" / "Generating campaign ideas…") then `done`+`result` or
   `error` (fully self-catching — no unhandled rejection possible).
3. The client polls its own row (RLS `auth.uid() = user_id`) every 2.5s for ≤3 min via
   the pure `pollCampaignJob` helper — **poll errors are blips, not failures**; a
   backgrounded tab just misses ticks and the next poll finds the finished row.

Guardrails: async is **session-JWT-only** (an OAuth caller can't poll — falls through
to sync); sync path byte-identical for old bundles + legacy callers (skew-safe both
directions); dead isolate ⇒ row stays `processing` ⇒ the client's poll timeout is the
recovery path; 7-day best-effort self-cleanup on the hot path; `updated_at` set
explicitly by the writer (no trigger).

## Also fixed along the way

- `regenerateIdeas` had the same exposure — both call sites share `generateViaAsyncJob`.
- The client's `rate_limited` branch was dead code (`functions.invoke` exposes bodies
  only on 2xx) — replaced with a `FunctionsHttpError` status-429 mapping in
  `describeGenerationError`.

## Review + deploy trail

Spec-reviewer (10 findings, all folded in) → edge-function-reviewer (no introduced
issues) → Codex clean. Migration applied to prod (zero new advisors) → fn deployed
v105 via CLI (`verify_jwt=false` preserved, boot-checked: OPTIONS 200 / unauth 401) →
frontend merged via PR. `careful` gate honored: founder confirmed the deploy command.

## Known issue surfaced (pre-existing, tracked, NOT fixed here)

donny-chat's `generate_campaign` tool calls `donny-campaign-generate` with the
**service-role key as bearer** — which matches neither auth branch (getUser fails on a
service-role JWT; it's not a Donny OAuth token) → the tool plausibly 401s in prod.
Same failure class as the anonymous-brief fix (service-role ≠ user-auth). Needs its own
fix (mint a Donny OAuth token or add an explicit internal-caller path).
