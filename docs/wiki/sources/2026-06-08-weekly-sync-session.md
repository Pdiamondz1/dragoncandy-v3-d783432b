---
title: Weekly Sync Session (2026-06-08)
type: source
created: 2026-06-08
updated: 2026-06-08
sources: [raw/sessions/2026-06-08-weekly-sync.md]
tags: [outstand, webhook, rls, analytics, types, bug-fix]
---

# Weekly Sync Session (2026-06-08)

Post-June-7 sync capturing three workstreams merged to main 2026-06-07 → 2026-06-08.
Codebase scale corrected to **63 pages / 185 hooks / 74 edge functions**.

## Summary

Three areas of work landed after the previous sync:

1. **Outstand Publish Webhook** — a new `outstand-webhook` edge function closes the
   `donny_scheduled_posts` lifecycle: rows had sat at `scheduled` indefinitely because
   nothing consumed Outstand's outbound webhook events. The handler now advances rows to
   `published` or `failed`, populates `published_at`, stores per-account results, and
   reuses the existing token-expired reconnect-needed flow for `account.token_expired`
   events. Auth: HMAC-SHA256 with constant-time comparison; new `outstand_webhook_events`
   audit table for idempotency. A shared lib (runtime-agnostic, unit-tested) keeps the
   crypto and parsing logic out of the handler.

2. **Analytics RLS Fix** — `analytics_events` was silently rejecting every event from
   logged-out visitors (anon role) — no INSERT policy existed for anon. Added a policy
   scoped to `user_id IS NULL`. This restores the anonymous-visitor segment of the data
   flywheel; the `useAnalyticsBatch` client already sent `user_id = null` so the fix
   required only the DB policy.

3. **Database / Type-Safety Patches** — fixed invalid `'withdrawn'` enum literal in
   `get_user_conversations` (runtime error on conversation queries); added proper RPC
   types for `block_user`/`report_user` and dropped `as never` casts; excluded
   `supabase/**` from Vitest to stop Deno-globals failures.

## Key Claims

- `outstand-webhook` is the 74th edge function (post `_shared/` exclusion).
- `donny_scheduled_posts` now has a complete lifecycle: `scheduled → published/failed`
  closed by the webhook; `published_at` is now written in real time.
- Partial-success Outstand posts (≥1 account succeeds) map to `published`; per-account
  results stored in `metadata.publish_result`.
- Anonymous analytics events were **not** being recorded before this fix — any
  logged-out-visitor data prior to 2026-06-07 is missing from `analytics_events`.
- `get_user_conversations` was failing with an invalid enum literal for any collaboration
  involving the `withdrawn` status filter.

## See Also

- [[Outstand]] — updated with webhook section
- [[Donny AI]] — scheduled-post lifecycle now closed
- [[Supabase]] — new audit table, updated counts
- [[Data Flywheel]] — anonymous event gap now resolved
- [[Core Docs Recent Updates Sync Session]] — previous sync
- [[Campaign Lifecycle Flow]] — webhook leg added
