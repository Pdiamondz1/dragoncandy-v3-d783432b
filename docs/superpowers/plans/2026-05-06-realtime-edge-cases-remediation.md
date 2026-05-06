# Realtime Edge Cases Audit Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 8 issues from the realtime edge-cases audit — race conditions, draft persistence, presence cleanup, message retry, staleTime overrides, payment dedup verification, and single-slot campaign guard.

**Architecture:** Surgical fixes in existing hooks/components. Two new Supabase migrations (RPC function + trigger). No new abstractions, no shared utility layer.

**Tech Stack:** React + TypeScript, TanStack Query (React Query), Supabase JS v2, Supabase SQL migrations.

**Spec:** `docs/superpowers/specs/2026-05-06-realtime-edge-cases-remediation-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/hooks/useMessageMutations.ts` | Add retry config to sendMessage mutation |
| Modify | `src/components/messages/MessageInput.tsx` | Add localStorage draft persistence |
| Modify | `src/components/messages/MessageInputEnhanced.tsx` | Add localStorage draft persistence |
| Modify | `src/hooks/useSponsorshipProposals.ts` | Add conditional status guard + count check |
| Modify | `src/hooks/useCounterOffers.ts` | Add conditional status guard on respond mutation |
| Modify | `src/hooks/useManageApplication.ts` | Add conditional status guard on accept path |
| Modify | `src/hooks/useUserPresence.ts` | Add beforeunload/pagehide + heartbeat debounce |
| Modify | `src/hooks/useMessageQueries.ts` | Override staleTime + refetchOnWindowFocus |
| Modify | `src/hooks/useConversations.ts` | Override staleTime + refetchOnWindowFocus |
| Modify | `src/hooks/useUnreadCounts.ts` | Override staleTime + refetchOnWindowFocus |
| Create | `supabase/migrations/20260506000000_set_user_offline_rpc.sql` | RPC for presence cleanup on tab close |
| Create | `supabase/migrations/20260506000001_enforce_single_slot_campaign.sql` | Trigger guarding single-slot campaigns |

---

## Task 1: Message Send Retry

**Files:**
- Modify: `src/hooks/useMessageMutations.ts:12` (the `useMutation` options object)

- [ ] **Step 1: Add retry config to useSendMessage mutation**

In `src/hooks/useMessageMutations.ts`, add `retry` and `retryDelay` to the mutation options object at line 12. Place them after `mutationFn`:

```typescript
return useMutation({
  mutationFn: async ({ ... }: SendMessageParams) => {
    // ... existing mutationFn unchanged
  },
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  onMutate: async (variables) => {
    // ... existing onMutate unchanged
```

The `retry` and `retryDelay` lines go between the closing `},` of `mutationFn` and the `onMutate` key.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMessageMutations.ts
git commit -m "fix(realtime): add retry with exponential backoff to message send mutation"
```

---

## Task 2: Message Draft Persistence — MessageInput

**Files:**
- Modify: `src/components/messages/MessageInput.tsx`

- [ ] **Step 1: Add draft persistence logic**

Add `useEffect` hooks for localStorage after the existing `useState` call (line 21). The component receives `campaignId` as a prop — use it as the draft key:

```typescript
export const MessageInput: React.FC<MessageInputProps> = ({ 
  campaignId,
  onSendMessage, 
  disabled = false,
  placeholder = "Type your message…"
}) => {
  const [message, setMessage] = useState('');
  const { sendTypingIndicator } = useTypingIndicator(campaignId);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const draftKey = `dc_msg_draft_${campaignId}`;

  // Load draft on mount / conversation switch — reset to empty if no draft exists
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    setMessage(saved || '');
  }, [draftKey]);

  // Persist draft on change
  useEffect(() => {
    if (message) localStorage.setItem(draftKey, message);
    else localStorage.removeItem(draftKey);
  }, [message, draftKey]);
```

Note: The load effect must always call `setMessage` (even to empty string) so that switching conversations doesn't leak the previous conversation's text into the new draft key via the persist effect.

- [ ] **Step 2: Clear draft on successful send**

In `handleSubmit`, after `onSendMessage(message.trim())` and before `setMessage('')`, add:

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (message.trim() && !disabled) {
    onSendMessage(message.trim());
    localStorage.removeItem(draftKey);
    setMessage('');
    sendTypingIndicator(false);
  }
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/MessageInput.tsx
git commit -m "fix(realtime): persist message draft to localStorage in MessageInput"
```

---

## Task 3: Message Draft Persistence — MessageInputEnhanced

**Files:**
- Modify: `src/components/messages/MessageInputEnhanced.tsx`

- [ ] **Step 1: Add draft persistence logic**

This component has both `campaignId?` and `conversationId?` (aliased as `_conversationId`). Rename the alias back to `conversationId` and add draft logic after the `useState` calls (around line 38):

First, fix the destructured prop — change `conversationId: _conversationId` back to just `conversationId`:

```typescript
export const MessageInputEnhanced: React.FC<MessageInputEnhancedProps> = ({
  campaignId,
  conversationId,
  onSendMessage,
  disabled = false,
  placeholder = "Type a message…",
  replyingTo,
  onCancelReply
}) => {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendTypingIndicator } = useTypingIndicator(campaignId ?? '');
  const { user } = useAuth();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const draftKey = `dc_msg_draft_${conversationId || campaignId}`;

  // Load draft on mount / conversation switch — reset to empty if no draft exists
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    setMessage(saved || '');
  }, [draftKey]);

  // Persist draft on change
  useEffect(() => {
    if (message) localStorage.setItem(draftKey, message);
    else localStorage.removeItem(draftKey);
  }, [message, draftKey]);
```

Note: Same pattern as MessageInput — the load effect must always reset state to prevent draft leakage across conversations.

- [ ] **Step 2: Clear draft on successful send**

In the `handleSubmit` function, add `localStorage.removeItem(draftKey)` right before `setMessage('')` (line 112):

```typescript
    onSendMessage(message.trim() || `📎 ${file?.name}`, {
      ...attachmentData,
      parentMessageId: replyingTo?.id,
      threadId: replyingTo?.thread_id || replyingTo?.id,
    });

    localStorage.removeItem(draftKey);
    setMessage('');
    setFile(null);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/MessageInputEnhanced.tsx
git commit -m "fix(realtime): persist message draft to localStorage in MessageInputEnhanced"
```

---

## Task 4: Race Condition Guard — Sponsorship Accept

**Files:**
- Modify: `src/hooks/useSponsorshipProposals.ts:81-95`

- [ ] **Step 1: Add conditional status guard to updateProposalStatus**

Replace the `mutationFn` in `updateProposalStatus` (lines 82-95) with a conditional update that checks status and returns the count:

```typescript
const updateProposalStatus = useMutation({
  mutationFn: async ({ 
    proposalId, 
    status 
  }: { 
    proposalId: string; 
    status: 'accepted' | 'rejected';
  }) => {
    const { data, error, count } = await supabase
      .from('campaign_sponsorships')
      .update({ status })
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('id', { count: 'exact' });

    if (error) throw error;
    if (count === 0) {
      throw new Error('This sponsorship is no longer pending — someone else may have already responded.');
    }

    return data;
  },
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSponsorshipProposals.ts
git commit -m "fix(realtime): add conditional status guard to sponsorship accept mutation"
```

---

## Task 5: Race Condition Guard — Counter Offer Response

**Files:**
- Modify: `src/hooks/useCounterOffers.ts:130-161`

- [ ] **Step 1: Add conditional status guard to useRespondToCounterOffer**

Replace the `mutationFn` in `useRespondToCounterOffer` (lines 134-163) to add `.eq('status', 'pending')` guards on both updates:

```typescript
mutationFn: async ({
  counterOfferId,
  applicationId,
  response,
}: {
  counterOfferId: string;
  applicationId: string;
  response: 'accepted' | 'declined';
}) => {
  // Update counter-offer status with race guard
  const { error: offerError, count: offerCount } = await supabase
    .from('application_counter_offers')
    .update({ status: response })
    .eq('id', counterOfferId)
    .eq('status', 'pending')
    .select('id', { count: 'exact' });

  if (offerError) throw offerError;
  if (offerCount === 0) {
    throw new Error('This counter offer is no longer pending — it may have already been responded to.');
  }

  // If accepted, update application status with race guard
  if (response === 'accepted') {
    const { error: appError, count: appCount } = await supabase
      .from('campaign_applications')
      .update({ status: 'accepted' })
      .eq('id', applicationId)
      .eq('status', 'counter_offered')
      .select('id', { count: 'exact' });

    if (appError) throw appError;
    if (appCount === 0) {
      throw new Error('This application status has already changed.');
    }
  }

  return { response, applicationId };
},
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCounterOffers.ts
git commit -m "fix(realtime): add conditional status guard to counter offer response mutation"
```

---

## Task 6: Race Condition Guard — Application Management

**Files:**
- Modify: `src/hooks/useManageApplication.ts:50-63`

- [ ] **Step 1: Add conditional status guard to non-sponsored accept path**

In the `else` branch (non-sponsored path, line 51), add a status guard and count check. Use `.in('status', ['pending', 'counter_offered'])` instead of just `.eq('status', 'pending')` because businesses should still be able to reject applications that are in `counter_offered` state. Do NOT use `.single()` with `{ count: 'exact' }` — they conflict (`.single()` throws PGRST116 when count is 0, preempting the count check):

```typescript
    } else {
      // Non-sponsored: direct status update with race guard
      const { data, error, count } = await supabase
        .from('campaign_applications')
        .update({
          status,
          restaurant_approval_status: status === 'accepted' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'
        })
        .eq('id', applicationId)
        .in('status', ['pending', 'counter_offered'])
        .select('id, campaign_id, creator_id, status, restaurant_approval_status, final_approval_status', { count: 'exact' });

      if (error) throw error;
      if (count === 0) {
        throw new Error('This application is no longer pending — its status may have already changed.');
      }
      return data![0];
    }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useManageApplication.ts
git commit -m "fix(realtime): add conditional status guard to application accept mutation"
```

---

## Task 7: Presence Cleanup — beforeunload + Heartbeat Debounce

**Files:**
- Modify: `src/hooks/useUserPresence.ts`

- [ ] **Step 1: Add useRef import and constants**

At the top of the file, add `useRef` to the React import and import the Supabase constants:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SUPABASE_URL = "https://zocahiffooqdybdhguqv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvY2FoaWZmb29xZHliZGhndXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzgzMzQsImV4cCI6MjA2NTU1NDMzNH0.bGhT6ft_zTbw-9v2Typi0wxzlfStg3sGiuPOor8Wfz8";
```

- [ ] **Step 2: Add beforeunload/pagehide handlers inside useUserPresence**

Add a new `useEffect` inside `useUserPresence()` after the existing realtime subscription effect (after line 58):

```typescript
  // Mark user offline on tab close/navigate away
  useEffect(() => {
    if (!user) return;

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
  }, [user]);
```

- [ ] **Step 3: Add heartbeat debounce to useUpdatePresence**

In `useUpdatePresence()`, add a `lastWriteRef` to debounce writes to 30s minimum:

```typescript
export const useUpdatePresence = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastWriteRef = useRef(0);

  return useMutation({
    mutationFn: async (status: 'online' | 'offline' | 'busy' | 'away') => {
      if (!user) throw new Error('User not authenticated');

      // Debounce: skip if last write was within 30 seconds (unless going offline)
      const now = Date.now();
      if (status !== 'offline' && now - lastWriteRef.current < 30_000) return null;
      lastWriteRef.current = now;
      
      const { data, error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: user.id,
          status,
          updated_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        })
        .select('id, user_id, status, last_seen, updated_at')
        .single();

      if (error) {
        console.error('Error updating presence:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-presence'] });
    },
  });
};
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUserPresence.ts
git commit -m "fix(realtime): add beforeunload offline beacon and heartbeat debounce to presence"
```

---

## Task 8: staleTime Overrides for Live Data

**Files:**
- Modify: `src/hooks/useMessageQueries.ts:10-11`
- Modify: `src/hooks/useConversations.ts:22-23`
- Modify: `src/hooks/useUnreadCounts.ts:9-10`

- [ ] **Step 1: Override staleTime in useMessages**

In `src/hooks/useMessageQueries.ts`, add `staleTime` and `refetchOnWindowFocus` to the `useQuery` options at line 10:

```typescript
const query = useQuery({
  queryKey: ['messages', campaignId, conversationId],
  queryFn: async () => {
    // ... existing queryFn
  },
  enabled: !!(campaignId || conversationId),
  staleTime: 10_000,
  refetchOnWindowFocus: 'always',
});
```

- [ ] **Step 2: Override staleTime in useConversations**

In `src/hooks/useConversations.ts`, add to the `useQuery` options at line 22:

```typescript
const query = useQuery({
  queryKey: ['conversations', user?.id],
  queryFn: async () => {
    // ... existing queryFn
  },
  enabled: !!user,
  staleTime: 30_000,
  refetchOnWindowFocus: 'always',
});
```

- [ ] **Step 3: Override staleTime in useUnreadMessageCounts**

In `src/hooks/useUnreadCounts.ts`, add to the `useQuery` options at line 9:

```typescript
return useQuery({
  queryKey: ['unread-counts'],
  queryFn: async () => {
    // ... existing queryFn
  },
  enabled: !!user,
  staleTime: 15_000,
  refetchOnWindowFocus: 'always',
});
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMessageQueries.ts src/hooks/useConversations.ts src/hooks/useUnreadCounts.ts
git commit -m "fix(realtime): reduce staleTime and enable always-refetch for live data queries"
```

---

## Task 9: Payment Button Dedup — Verification

**Files:**
- Verify: `src/components/campaigns/PaymentButton.tsx`

- [ ] **Step 1: Verify all checkout triggers have disabled={isPending}**

`PaymentButton.tsx` already has `disabled={initiatePayment.isPending}` on its button. Search the codebase for any other components that call `create-sponsorship-checkout` or `create-checkout-session` edge functions directly:

Run: `grep -r "create-sponsorship-checkout\|create-checkout-session\|create-campaign-escrow\|boost-payment" src/ --include="*.tsx" --include="*.ts" -l`

For each file found, verify the trigger button uses `disabled={isPending}` or equivalent. If any are missing, add the guard. If all are covered, document as verified.

- [ ] **Step 2: Commit (if changes made)**

Only commit if fixes were needed. Otherwise this task is a no-op verification.

---

## Task 10: Migration — set_user_offline RPC

**Files:**
- Create: `supabase/migrations/20260506000000_set_user_offline_rpc.sql`

- [ ] **Step 1: Create migration file**

```sql
-- RPC function for marking a user offline on tab close (called via fetch keepalive from beforeunload)
-- Uses SECURITY DEFINER so the anon-key request can update the row without user-level RLS.

CREATE OR REPLACE FUNCTION public.set_user_offline(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.user_presence
  SET status = 'offline', updated_at = now(), last_seen = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.set_user_offline(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.set_user_offline(UUID) TO authenticated;

-- NOTE: For stale presence cleanup, configure pg_cron via Supabase Dashboard:
-- SELECT cron.schedule(
--   'cleanup-stale-presence',
--   '*/5 * * * *',
--   $$UPDATE public.user_presence SET status = 'offline' WHERE status = 'online' AND updated_at < now() - interval '5 minutes'$$
-- );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260506000000_set_user_offline_rpc.sql
git commit -m "feat(migration): add set_user_offline RPC for presence cleanup on tab close"
```

---

## Task 11: Migration — Single-Slot Campaign Trigger

**Files:**
- Create: `supabase/migrations/20260506000001_enforce_single_slot_campaign.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Trigger to enforce single-slot campaign limit.
-- Prevents two creators from being simultaneously active/pending on a campaign
-- where creator_count = 1.

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

DROP TRIGGER IF EXISTS trg_enforce_single_slot_campaign ON public.campaign_collaborations;

CREATE TRIGGER trg_enforce_single_slot_campaign
  BEFORE INSERT OR UPDATE ON public.campaign_collaborations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_slot_campaign();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260506000001_enforce_single_slot_campaign.sql
git commit -m "feat(migration): add trigger to enforce single-slot campaign creator limit"
```

---

## Task 12: Final Build Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Run dev server and smoke test**

Run: `npm run dev`
Verify in browser:
- Messaging page loads
- Conversations list loads
- Presence indicator appears
- No console errors related to the changed hooks

---

## Execution Notes

- Tasks 1–8 are frontend-only code changes — can be parallelized by subagents.
- **Task 7 depends on Task 10 at runtime.** The `beforeunload` handler calls the `set_user_offline` RPC. The code compiles fine without the migration, but the fetch will 404 until the migration is deployed. Commit Task 10 before or alongside Task 7.
- Tasks 10–11 are SQL migrations — no build dependency, but must be committed to `supabase/migrations/`.
- Task 9 is a verification step — may result in no changes.
- Task 12 is the final gate — must run after all other tasks complete.
- The pg_cron setup (noted in migration 10) must be configured manually in the Supabase Dashboard after deployment.
