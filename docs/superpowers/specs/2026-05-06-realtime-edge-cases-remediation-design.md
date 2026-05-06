# Realtime & Edge Cases Audit Remediation — Design Spec

> Source audit: `docs/realtime-edge-cases-audit.docx`
> Date: 2026-05-06

## Scope

Fix all 8 issues identified in the realtime edge-cases audit. 4 High severity, 4 Medium severity, all Low effort. No new abstractions — surgical fixes in existing files plus two migrations.

## Issue Map

| # | Issue | Files | Fix Type |
|---|-------|-------|----------|
| 1 | Race: sponsorship accept (no conditional UPDATE) | useSponsorshipProposals.ts, useCounterOffers.ts, useManageApplication.ts | Code |
| 2 | Pay button not disabled while pending | PaymentButton.tsx (verify), sponsorship trigger points | Code |
| 3 | No message draft persistence | MessageInput.tsx, MessageInputEnhanced.tsx | Code |
| 4 | Presence ghost state (no cleanup) | useUserPresence.ts | Code + Migration |
| 5 | Message-send no retry | useMessageMutations.ts | Code |
| 6 | staleTime 5min on messages | useMessages.ts, useConversations.ts, useUnreadCounts.ts | Code |
| 7 | No beforeunload for offline | useUserPresence.ts | Code (same as #4) |
| 8 | Single-slot campaign race | New migration | Migration |

## Detailed Fixes

### 1. Race Condition Guards (Issues #1, #8)

#### useSponsorshipProposals.ts — updateProposalStatus

Add `.eq('status', 'pending')` to the update mutation. Use `.select('id', { count: 'exact' })` to get the affected row count:

```typescript
const { data, error, count } = await supabase
  .from('campaign_sponsorships')
  .update({ status: 'accepted', accepted_at: new Date().toISOString() })
  .eq('id', sponsorshipId)
  .eq('status', 'pending')
  .select('id', { count: 'exact' });

if (error) throw error;
if (count === 0) {
  throw new Error('This sponsorship is no longer pending — someone else may have already responded.');
}
```

Note: `{ count: 'exact' }` goes on `.select()`, not `.update()` — this is the Supabase JS v2 API.

#### useCounterOffers.ts — useRespondToCounterOffer

Same pattern: add `.eq('status', 'pending')` before the status flip. Use `.select('id', { count: 'exact' })` and check count === 0.

#### useManageApplication.ts

Add `.eq('status', 'pending')` to the non-sponsored accept path. For the joint-approval path, guard on the current `final_approval_status` value.

#### Migration: Partial unique index for single-slot campaigns

```sql
CREATE UNIQUE INDEX IF NOT EXISTS one_active_collab_per_single_slot_campaign
ON public.campaign_collaborations (campaign_id)
WHERE status IN ('active', 'pending');
```

This prevents two different creators from simultaneously being accepted on a single-slot campaign. The UI will catch the constraint violation and show a user-friendly "This campaign has already been filled" message.

Note: This index enforces at most one active/pending collaboration per campaign. For multi-slot campaigns (creator_count > 1), a trigger or application-level check is needed — but the audit scope is limited to single-slot races. The index is safe for multi-slot campaigns only if we scope it with a subquery or use a trigger instead. **Decision**: Use a trigger that checks `creator_count` before allowing the insert, rather than a blanket unique index that would break multi-slot campaigns.

Revised migration:

```sql
CREATE OR REPLACE FUNCTION public.enforce_single_slot_campaign()
RETURNS TRIGGER AS $$
DECLARE
  max_creators INTEGER;
  current_count INTEGER;
BEGIN
  SELECT creator_count INTO max_creators
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF max_creators IS NOT NULL AND max_creators <= 1 THEN
    SELECT COUNT(*) INTO current_count
    FROM public.campaign_collaborations
    WHERE campaign_id = NEW.campaign_id
      AND status IN ('active', 'pending')
      AND id != NEW.id;

    IF current_count >= 1 THEN
      RAISE EXCEPTION 'Campaign has reached its creator limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_single_slot_campaign
  BEFORE INSERT OR UPDATE ON public.campaign_collaborations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_slot_campaign();
```

### 2. Payment Button Dedup (Issue #2)

Verify that all paths invoking checkout edge functions use `disabled={isPending}`:
- `PaymentButton.tsx` — already implemented (confirmed in exploration)
- Any sponsorship-specific pay triggers — verify and add guard if missing

If all existing buttons already have the guard, this issue is resolved. Document the verification.

### 3. Message Draft Persistence (Issue #3)

#### MessageInput.tsx

This component receives `campaignId` as a prop (not `conversationId`). Key the draft on that:

```typescript
const draftKey = `dc_msg_draft_${campaignId}`;

useEffect(() => {
  const saved = localStorage.getItem(draftKey);
  if (saved) setMessage(saved);
}, [draftKey]);

useEffect(() => {
  if (message) localStorage.setItem(draftKey, message);
  else localStorage.removeItem(draftKey);
}, [message, draftKey]);

// On successful send:
localStorage.removeItem(draftKey);
```

#### MessageInputEnhanced.tsx

Same pattern, but this component has both `conversationId` and `campaignId` props. Use whichever is available:

```typescript
const draftKey = `dc_msg_draft_${conversationId || campaignId}`;
```

### 4 & 7. Presence Cleanup + beforeunload (Issues #4, #7)

#### useUserPresence.ts

Add lifecycle handlers. Use `fetch` with `keepalive: true` instead of `sendBeacon` because Supabase requires the `apikey` header and `Content-Type: application/json` — `sendBeacon` cannot set custom headers:

```typescript
useEffect(() => {
  const goOffline = () => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/set_user_offline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ p_user_id: user.id }),
      keepalive: true,
    });
  };
  window.addEventListener('pagehide', goOffline);
  window.addEventListener('beforeunload', goOffline);
  return () => {
    window.removeEventListener('pagehide', goOffline);
    window.removeEventListener('beforeunload', goOffline);
  };
}, [user.id]);
```

`keepalive: true` ensures the request survives page unload (same guarantee as `sendBeacon`). The `SECURITY DEFINER` on the RPC allows the anon key to update any user's presence row.

Add heartbeat debounce — only write presence row if last write was >30s ago:

```typescript
const lastWriteRef = useRef(0);
const updatePresence = async (status: string) => {
  const now = Date.now();
  if (now - lastWriteRef.current < 30_000) return;
  lastWriteRef.current = now;
  // existing upsert logic
};
```

#### Migration: set_user_offline RPC

```sql
CREATE OR REPLACE FUNCTION public.set_user_offline(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.user_presence
  SET status = 'offline', updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Stale presence cleanup (pg_cron note)

Document that the following should be configured via Supabase Dashboard > Extensions > pg_cron:

```sql
SELECT cron.schedule(
  'cleanup-stale-presence',
  '*/5 * * * *',
  $$UPDATE public.user_presence SET status = 'offline' WHERE status = 'online' AND updated_at < now() - interval '5 minutes'$$
);
```

### 5. Message Send Retry (Issue #5)

#### useMessageMutations.ts

Add retry config to the `sendMessage` mutation:

```typescript
useMutation({
  mutationFn: sendMessage,
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  // existing onMutate, onError, onSettled...
});
```

### 6. staleTime Override for Live Data (Issue #6)

#### useMessages.ts (useMessageQueries.ts)

```typescript
useQuery({
  queryKey: ['messages', conversationId],
  queryFn: fetchMessages,
  staleTime: 10_000,
  refetchOnWindowFocus: 'always',
});
```

#### useConversations.ts

```typescript
useQuery({
  queryKey: ['conversations', ...],
  queryFn: fetchConversations,
  staleTime: 30_000,
  refetchOnWindowFocus: 'always',
});
```

#### useUnreadCounts.ts

```typescript
useQuery({
  queryKey: ['unread-counts', ...],
  queryFn: fetchUnreadCounts,
  staleTime: 15_000,
  refetchOnWindowFocus: 'always',
});
```

## Migrations Summary

Two new migrations required:

1. **set_user_offline RPC** + pg_cron documentation
2. **enforce_single_slot_campaign trigger**

Both are additive (no column drops/renames). RLS note: `set_user_offline` uses SECURITY DEFINER so the anon-key `fetch(..., { keepalive: true })` call from `beforeunload` can update the row without user-level RLS.

## Out of Scope

- Multi-slot campaign race conditions (would need a more complex trigger counting against `creator_count`)
- Realtime subscription optimization (replacing full invalidation with `setQueryData`)
- Typing indicator issues (none found in audit)

## Verification

After implementation, re-run the audit checklist:
- [ ] Double-click Pay button → only one Stripe session created
- [ ] Two users accept same proposal → second gets "no longer pending" error
- [ ] Type message, refresh → draft restored from localStorage
- [ ] Close tab → presence shows offline within 5 minutes
- [ ] Network blip during send → message retries and delivers
- [ ] Switch tabs for 2 min, return → messages refresh immediately
- [ ] Tab close → beforeunload fires offline beacon
- [ ] Two creators accepted on single-slot campaign → trigger blocks second
