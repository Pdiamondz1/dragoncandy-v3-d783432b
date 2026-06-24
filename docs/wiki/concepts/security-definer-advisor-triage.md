---
title: SECURITY DEFINER Advisor Triage
type: concept
created: 2026-06-24
updated: 2026-06-24
sources: [2026-06-24-loop-memory-and-security-triage.md]
tags: [security, rls, supabase, advisors, deferred]
---
# SECURITY DEFINER Advisor Triage

A reusable method for triaging Supabase **security advisor** findings about `SECURITY DEFINER`
functions — and the record of a **deliberate decision to defer** acting on them pre-launch.

## Context

Lovable's "Review security" panel surfaces the Supabase **security advisors**. On 2026-06-24
the prod project (`zocahiffooqdybdhguqv`) showed **149 findings**, dominated by *"Public /
Signed-in users can execute SECURITY DEFINER function"* warnings. Most are **by design** —
DragonCandy deliberately uses `SECURITY DEFINER` RPCs that the frontend calls and that do their
own internal auth, plus definer helper functions used inside RLS policies. The advisor flags
every such function regardless of intent, so the count is not a bug list.

## The 3-signal triage

For each flagged `SECURITY DEFINER` function, decide **keep** vs **safe-to-revoke** (revoking
= `REVOKE EXECUTE ... FROM anon, authenticated`) using three signals:

1. **Called by the frontend via `.rpc()`?** → **KEEP.** Use a *multiline-aware* scan — a
   single-line regex misses `(...).rpc(\n  'name'` calls (this nearly mis-classified
   `check_prerequisite_status` as revoke-safe).
2. **Referenced inside an RLS policy** (match `funcname(` in `pg_policies.qual`/`with_check`)?
   → **KEEP.** The querying role needs `EXECUTE` to evaluate the policy, even though the
   frontend never calls the function directly.
3. **Returns `trigger`** (or is reached only via triggers / other definer functions / pg_cron /
   service-role edge functions)? → **SAFE TO REVOKE.** Such callers don't use the
   anon/authenticated grant, so revoking changes no behavior.

## Result (2026-06-24 snapshot)

- **75 distinct definer functions / 141 findings.** KEEP **43** (33 frontend RPCs + 10
  RLS-helper functions); revoke-safe **32** (21 triggers + 11 internal/cron/service-role/dead).
- **4 public buckets allow listing** (`dragonshare-content`, `help-screenshots`,
  `profile-assets`, `promotion-videos`) — fix = drop the broad `SELECT` policy on
  `storage.objects`; public **URL** access is unaffected (see [[DragonShare]]).
- **4 RLS-enabled-no-policy (INFO)** (`aios_settings`, `donny_cost_ledger`,
  `google_workspace_accounts`, `outstand_webhook_events`) — already deny-all to clients, which
  is correct for service/admin-only tables; safe as-is.

## Decision: deferred (not applied)

**No changes were made — read-only analysis only.** The founder shelved the fix pre-launch:
tightening prod RLS/grants risks silently breaking a working DragonCandy flow, and that
downside outweighs clearing advisor noise that is mostly intentional design. Do **not** re-raise
this as a new issue.

## Known Issues / caveats for if it is resumed

- Revoking the safe 32 will **not** zero the advisor — the 43 kept definer functions stay
  flagged by design (a frontend RPC must be executable by `anon`/`authenticated`).
- Optional extra win: revoke **anon-only** (keep `authenticated`) on the logged-in-only
  frontend RPCs to clear most *"Public (anon) can execute"* findings — needs a per-function
  check of which RPCs run on public/unauthenticated pages (e.g. `search_restaurants`).
- Sequence: migration → test on **staging** (`mhffqrawgizhprbobcta`) → prod → [[codex-review]]
  → PR. Verify `donny-orchestrator/rag.ts` calls `match_donny_knowledge` with the service-role
  client before revoking it.

## See Also
- [[Supabase]] — RLS, definer functions, advisors
- [[QA CI/CD Gate]] — staging project used to test a migration before prod
- [[Musk's Algorithm]] — "question every requirement": much of this advisor noise is intentional
