# Handoff: Realtime Edge-Cases Audit Remediation — Complete

## Session Metadata
- Created: 2026-05-06 05:31:48
- Project: C:\GIT\dragoncandy-v3-d783432b
- Branch: main
- Session duration: ~90 minutes

### Recent Commits (for context)
  - b5ad8e8 feat(migration): add trigger to enforce single-slot campaign creator limit
  - 7e0daf6 feat(migration): add set_user_offline RPC for presence cleanup on tab close
  - a8985bf fix(realtime): guard pricing checkout button against double-click
  - 4970644 fix(realtime): reduce staleTime and enable always-refetch for live data queries
  - 9f2f134 fix(realtime): add beforeunload offline beacon and heartbeat debounce to presence
  - 54a16a7 fix(realtime): add conditional status guard to application accept mutation
  - 43ea9eb fix(realtime): add conditional status guard to counter offer response mutation
  - 38e5ead fix(realtime): add conditional status guard to sponsorship accept mutation
  - b2b9ca5 fix(realtime): persist message draft to localStorage in MessageInputEnhanced
  - 84f442f fix(realtime): persist message draft to localStorage in MessageInput
  - f1f08c6 fix(realtime): add retry with exponential backoff to message send mutation

## Handoff Chain

- **Continues from**: [2026-05-05-230325-seo-audit-remediation.md](./2026-05-05-230325-seo-audit-remediation.md)
- **Supersedes**: None

## Current State Summary

All 8 issues from the realtime edge-cases audit (`docs/realtime-edge-cases-audit.docx`) have been fixed, committed to main, and verified via a post-implementation audit. The work comprised 11 code/migration commits across 10 source files and 2 SQL migrations. Build passes clean. The only remaining post-deployment action is configuring pg_cron for stale presence cleanup in the Supabase Dashboard.

## Work Completed

### Tasks Finished

- [x] Issue 1: Race condition on sponsorship accept — conditional `.eq('status', 'pending')` guard added to `useSponsorshipProposals.ts`, `useCounterOffers.ts`, `useManageApplication.ts`
- [x] Issue 2: Payment button double-click — all 7 checkout trigger components verified; `PricingPage.tsx` fixed (was missing guard)
- [x] Issue 3: Message draft persistence — localStorage drafts added to both `MessageInput.tsx` and `MessageInputEnhanced.tsx`
- [x] Issue 4: Presence ghost state — `beforeunload`/`pagehide` handlers with `fetch keepalive` added to `useUserPresence.ts`
- [x] Issue 5: Message send retry — `retry: 3` with exponential backoff added to `useMessageMutations.ts`
- [x] Issue 6: staleTime override — reduced from 5min to 10s/30s/15s for messages/conversations/unread counts
- [x] Issue 7: beforeunload offline — same fix as Issue 4
- [x] Issue 8: Single-slot campaign race — trigger `enforce_single_slot_campaign` created in migration

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/hooks/useMessageMutations.ts` | Added `retry: 3`, `retryDelay` | Network blip = lost message |
| `src/components/messages/MessageInput.tsx` | localStorage draft persistence | Refresh loses typed text |
| `src/components/messages/MessageInputEnhanced.tsx` | localStorage draft persistence | Same, with conversationId key |
| `src/hooks/useSponsorshipProposals.ts` | `.eq('status', 'pending')` + count check | Two-accept race |
| `src/hooks/useCounterOffers.ts` | Status guards on both updates | Counter offer race |
| `src/hooks/useManageApplication.ts` | `.in('status', ['pending', 'counter_offered'])` | Application accept race |
| `src/hooks/useUserPresence.ts` | beforeunload/pagehide + heartbeat debounce | Ghost online state |
| `src/hooks/useMessageQueries.ts` | `staleTime: 10_000`, `refetchOnWindowFocus: 'always'` | Stale conversations |
| `src/hooks/useConversations.ts` | `staleTime: 30_000`, `refetchOnWindowFocus: 'always'` | Same |
| `src/hooks/useUnreadCounts.ts` | `staleTime: 15_000`, `refetchOnWindowFocus: 'always'` | Same |
| `src/pages/PricingPage.tsx` | Un-alias `_loading`, add early return guard | Double-click checkout |
| `supabase/migrations/20260506000000_set_user_offline_rpc.sql` | New RPC `set_user_offline` | Presence cleanup on tab close |
| `supabase/migrations/20260506000001_enforce_single_slot_campaign.sql` | New trigger | Single-slot campaign guard |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| `fetch keepalive` over `sendBeacon` | sendBeacon, fetch+keepalive | sendBeacon cannot set custom headers; Supabase requires `apikey` header |
| `.in('status', [...])` over `.eq('status', 'pending')` for applications | eq('pending'), in(['pending', 'counter_offered']) | Businesses must reject counter_offered applications too |
| No `.single()` with `{ count: 'exact' }` | .single() + count, .select() + count | .single() throws PGRST116 before count check runs — they conflict |
| Trigger over partial unique index for single-slot | Partial unique index, trigger | Unique index would break multi-slot campaigns |
| Hardcode Supabase constants in useUserPresence | Import from client.ts, hardcode | client.ts says "Do not edit it directly" and doesn't export constants |

## Pending Work

## Immediate Next Steps

1. **Deploy migrations to Supabase** — Run the two new migrations via Supabase Dashboard or CLI
2. **Configure pg_cron** — In Supabase Dashboard > Extensions > pg_cron, schedule stale presence cleanup (every 5 min, set offline if updated_at > 5 min ago). SQL is in migration file comments.
3. **Continue with next audit** — The user wants to run another audit pass to verify completeness (already done in-session, all 8 PASS)

### Deferred Items

- PricingPage checkout button lacks visual disabled state during loading (functional guard via early return works, but button doesn't visually indicate loading)
- Multi-slot campaign race conditions (out of audit scope — trigger only guards single-slot)
- Realtime subscription optimization (replacing full invalidation with setQueryData — not in audit scope)

## Context for Resuming Agent

## Important Context

- All fixes are on `main` branch — Lovable auto-deploys on push, so these are live once pushed
- Migrations must be applied via Supabase Dashboard/CLI separately from code deployment
- The `set_user_offline` RPC uses `SECURITY DEFINER` callable by `anon` role — acceptable tradeoff (worst case: someone can set another user's presence to offline)
- Draft persistence uses `setMessage(saved || '')` — the `|| ''` is critical to prevent draft leakage between conversations

### Potential Gotchas

- `useUserPresence.ts` hardcodes `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` — if these change, update in two places (also in `src/integrations/supabase/client.ts`)
- The `enforce_single_slot_campaign` trigger will raise an exception visible in Supabase logs when a race is caught — this is expected behavior, not an error
- `throwOnError: true` in the global QueryClient config was removed in a separate commit (562aefa) that appeared during the session — this was a fix for Team/Billing page crashes, not part of this audit

## Related Resources

- Audit source: `docs/realtime-edge-cases-audit.docx`
- Design spec: `docs/superpowers/specs/2026-05-06-realtime-edge-cases-remediation-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-06-realtime-edge-cases-remediation.md`
