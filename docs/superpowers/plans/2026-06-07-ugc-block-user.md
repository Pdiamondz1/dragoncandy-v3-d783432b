# UGC Block-User + Report (Messaging) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users block abusive users and report them in direct messaging (Apple guideline 1.2), database-enforced and scoped to direct (non-campaign) conversations.

**Architecture:** A `user_blocks` table + `is_blocked()` helper drive enforcement: a recreated `messages` SELECT policy hides direct messages between blocked users, a BEFORE INSERT trigger rejects sends, and `get_user_conversations` excludes blocked direct conversations. The frontend calls SECURITY DEFINER RPCs (`block_user`/`unblock_user`/`is_user_blocked`/`report_user`) — mirroring the DragonShare flag pattern — from a Block/Report menu in the conversation header.

**Tech Stack:** Supabase Postgres (migrations + RLS + SECURITY DEFINER), React 18 + TS, React Query, Vitest (node; jsdom per-file for hook tests), sonner toasts.

**Design (approved):** `C:\Users\dwill\.claude\plans\how-can-we-get-floofy-scone.md`

---

## Scope refinement (within the approved design)

Block is scoped to **direct (non-campaign) conversations** — `campaign_id IS NULL` messages and `type='direct'` conversations. Campaign messaging (tied to paid collaborations) is deliberately **unaffected**, so blocking can't break an active marketplace relationship. The Block/Report UI lives only on `DirectConversationPage` (the direct-message surface).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/migrations/<ts>_user_blocks_and_reports.sql` | tables, RLS, `is_blocked`, RPC wrappers, messages SELECT policy, send-block trigger, `get_user_conversations` filter | Create |
| `src/hooks/useUserBlocks.ts` | `useBlockUser` / `useUnblockUser` / `useIsUserBlocked` (RPC wrappers) | Create |
| `src/hooks/useReportUser.ts` | `useReportUser` (RPC wrapper) | Create |
| `src/hooks/useUserBlocks.test.ts` | unit tests for the block hooks | Create |
| `src/pages/DirectConversationPage.tsx` | Block/Unblock/Report menu + confirm dialog in the header | Modify |

**Notes for the implementer (read first):**
- Worktree `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\apple-app-store-3` (branch `worktree-apple-app-store-3`). Bash tool for npm/npx/git.
- `npm run test` exits non-zero (unrelated e2e). Run scoped: `npx vitest run <path>`.
- Hook tests render via `renderHook` → need `// @vitest-environment jsdom` line 1 + plain assertions (no jest-dom). Mirror `src/components/dragonshare/DragonShareUploadArea.test.tsx` for the jsdom/mocks convention.
- **New RPCs are not in the generated Supabase types yet**, so `supabase.rpc('block_user', …)` won't typecheck. Cast the function name and args with `as never` (NOT `as any` — eslint flags `any`): `supabase.rpc('block_user' as never, { p_blocked_id: id } as never)`. Add a `// Supabase types not yet regenerated for these RPCs` comment. (Cleanup: regenerate types post-migration.)
- **Do NOT apply the migration via git/Lovable.** The migration is deployed separately (Task 4) — staging then prod — and prod must precede the frontend merge.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/<ts>_user_blocks_and_reports.sql` (use a timestamp later than the newest existing migration, e.g. `20260607120000`).

- [ ] **Step 1: Pre-checks**

(a) **Confirm `recipient_id` on direct sends.** Run `git grep -n "from('messages')" -- src | grep -i insert` and inspect each. The send path (`src/hooks/useMessageMutations.ts:28-41`) sets `recipient_id`; other inserts (`ContentReviewSection.tsx`, `CampaignContentGallery.tsx`) are campaign-scoped (skipped by the trigger's `campaign_id IS NULL` guard). If any direct-message insert omits `recipient_id`, note it (the trigger fails open for null recipient — safe, but flag).

(b) **Confirm the ACTIVE messages SELECT policy** is `"messages: select by participant"` and that it is the ONLY permissive SELECT policy on `public.messages` (permissive SELECT policies OR together, so a missed one would defeat the block). Run: `git grep -niE "policy .*messages|on public\.messages" supabase/migrations | grep -i select` and confirm `20260506200000_security_messages_rls.sql` defines the only live SELECT policy. Section 5 recreates exactly that policy.

- [ ] **Step 2: Write the migration**

```sql
-- <ts>_user_blocks_and_reports.sql
-- Apple App Store guideline 1.2 (UGC): block abusive users + report them in direct
-- messaging. Database-enforced. Scoped to DIRECT (campaign_id IS NULL) messages so
-- paid campaign collaboration messaging is unaffected.

-- 1) user_blocks (mirror brand_shortlists)
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_blocks_select ON public.user_blocks;
CREATE POLICY user_blocks_select ON public.user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS user_blocks_insert ON public.user_blocks;
CREATE POLICY user_blocks_insert ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
DROP POLICY IF EXISTS user_blocks_delete ON public.user_blocks;
CREATE POLICY user_blocks_delete ON public.user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- 2) user_reports
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_id);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_reports_insert ON public.user_reports;
CREATE POLICY user_reports_insert ON public.user_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS user_reports_select ON public.user_reports;
CREATE POLICY user_reports_select ON public.user_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) symmetric block helper (used by RLS + the conversations RPC)
CREATE OR REPLACE FUNCTION public.is_blocked(user_a uuid, user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;

-- 4) RPC wrappers called by the frontend (mirror flag_dragonshare_post)
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_blocked_id = auth.uid() THEN RAISE EXCEPTION 'Cannot block yourself'; END IF;
  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- one-directional check (did *I* block them) for the toggle label
CREATE OR REPLACE FUNCTION public.is_user_blocked(p_other_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_other_id);
$$;
GRANT EXECUTE ON FUNCTION public.is_user_blocked(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_user(p_reported_id uuid, p_conversation_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_reports (reporter_id, reported_id, conversation_id, reason)
  VALUES (auth.uid(), p_reported_id, p_conversation_id, p_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION public.report_user(uuid, uuid, text) TO authenticated;

-- 5) Hide direct messages between blocked users.
--    The ACTIVE messages SELECT policy is "messages: select by participant"
--    (from supabase/migrations/20260506200000_security_messages_rls.sql), which
--    REPLACED the older "Users can view messages they sent or received". Recreate
--    THAT policy, preserving its full predicate (incl. the conversation_participants
--    branch and TO authenticated) and wrapping it with the block filter. Do NOT
--    add a second policy — permissive SELECT policies OR together, which would
--    defeat the block. First verify it is still the only SELECT policy on messages:
--      (pre-check) git grep -nE "for select|FOR SELECT" supabase/migrations | grep -i messages
DROP POLICY IF EXISTS "messages: select by participant" ON public.messages;
CREATE POLICY "messages: select by participant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    (
      sender_id = auth.uid()
      OR recipient_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.user_id = auth.uid()
          AND cp.left_at IS NULL
      )
    )
    AND NOT (campaign_id IS NULL AND public.is_blocked(sender_id, recipient_id))
  );

-- 6) Prevent sending direct messages between blocked users (additive trigger;
--    avoids touching the multiple existing INSERT policies)
CREATE OR REPLACE FUNCTION public.prevent_blocked_direct_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.campaign_id IS NULL AND NEW.recipient_id IS NOT NULL
     AND public.is_blocked(NEW.sender_id, NEW.recipient_id) THEN
    RAISE EXCEPTION 'You cannot message a blocked user';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_blocked_direct_messages ON public.messages;
CREATE TRIGGER trg_prevent_blocked_direct_messages
  BEFORE INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.prevent_blocked_direct_messages();

-- 7) Recreate get_user_conversations, adding a block exclusion to Branch 1 (direct).
--    Reproduce the CURRENT body verbatim from
--    supabase/migrations/20260515000001_fix_conversation_visibility_pre_message.sql
--    and add, immediately after the line
--      AND (p_org_unit_id IS NULL OR c.org_unit_id = p_org_unit_id)
--    in Branch 1, this clause:
--      AND NOT EXISTS (
--        SELECT 1 FROM public.conversation_participants cpb
--        WHERE cpb.conversation_id = c.id
--          AND cpb.user_id <> user_uuid
--          AND cpb.left_at IS NULL
--          AND public.is_blocked(user_uuid, cpb.user_id)
--      )
--    Leave Branch 2 (campaign) UNCHANGED.
```

> The implementer MUST paste the full current `get_user_conversations` body (from `20260515000001_fix_conversation_visibility_pre_message.sql`) into section 7 with the one added clause — do not hand-rewrite it.

- [ ] **Step 3: Commit the migration (not deployed yet)**

```bash
git add supabase/migrations/<ts>_user_blocks_and_reports.sql
git commit -m "feat(db): user_blocks + user_reports, is_blocked RLS, block/report RPCs (Apple 1.2)"
```

> Deployment to staging/prod is Task 4 — not here.

---

## Task 2: Block/report hooks (TDD)

**Files:**
- Create: `src/hooks/useUserBlocks.ts`, `src/hooks/useReportUser.ts`
- Test: `src/hooks/useUserBlocks.test.ts`

- [ ] **Step 1: Write the failing test** (`useUserBlocks.test.ts`)

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useBlockUser } from './useUserBlocks';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useBlockUser', () => {
  beforeEach(() => vi.clearAllMocks());
  it('calls the block_user RPC with the blocked id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useBlockUser(), { wrapper });
    await act(async () => { await result.current.mutateAsync('user-2'); });
    expect(rpc).toHaveBeenCalledWith('block_user', { p_blocked_id: 'user-2' });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/hooks/useUserBlocks.test.ts` → cannot resolve `./useUserBlocks`).

- [ ] **Step 3: Implement `useUserBlocks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// NOTE: these RPCs are not yet in the generated Supabase types — cast with `as never`.
export function useIsUserBlocked(otherId?: string) {
  return useQuery({
    queryKey: ['user-blocked', otherId],
    enabled: !!otherId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_user_blocked' as never, { p_other_id: otherId } as never);
      if (error) throw error;
      return data as unknown as boolean;
    },
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.rpc('block_user' as never, { p_blocked_id: blockedId } as never);
      if (error) throw error;
    },
    onSuccess: (_d, blockedId) => {
      toast.success('User blocked.');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['user-blocked', blockedId] });
    },
    onError: () => toast.error('Could not block this user. Please try again.'),
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.rpc('unblock_user' as never, { p_blocked_id: blockedId } as never);
      if (error) throw error;
    },
    onSuccess: (_d, blockedId) => {
      toast.success('User unblocked.');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['user-blocked', blockedId] });
    },
    onError: () => toast.error('Could not unblock this user. Please try again.'),
  });
}
```

- [ ] **Step 4: Implement `useReportUser.ts`**

```ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useReportUser() {
  return useMutation({
    mutationFn: async (args: { reportedId: string; conversationId?: string; reason?: string }) => {
      const { error } = await supabase.rpc('report_user' as never, {
        p_reported_id: args.reportedId,
        p_conversation_id: args.conversationId ?? null,
        p_reason: args.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => toast.success('Report submitted. Thank you for helping keep DragonCandy safe.'),
    onError: () => toast.error('Could not submit your report. Please try again.'),
  });
}
```

- [ ] **Step 5: Run the test — expect PASS** (`npx vitest run src/hooks/useUserBlocks.test.ts`).
- [ ] **Step 6: Typecheck** (`npm run typecheck`) and **commit**

```bash
git add src/hooks/useUserBlocks.ts src/hooks/useReportUser.ts src/hooks/useUserBlocks.test.ts
git commit -m "feat(messaging): block/unblock/report hooks (RPC wrappers)"
```

---

## Task 3: Block/Report menu in the conversation header

**Files:**
- Modify: `src/pages/DirectConversationPage.tsx`

- [ ] **Step 1: Add the menu next to "View Profile"**

In the header's right-side block (currently the `View Profile` `<Link>`, ~lines 96-105), add a `DropdownMenu` (shadcn — `@/components/ui/dropdown-menu`) triggered by a kebab (`MoreVertical` from lucide), rendered only when `otherParticipantId` is set. Items:
- **Block user / Unblock user** — label from `useIsUserBlocked(otherParticipantId)`. On click open a confirm `AlertDialog` (`@/components/ui/alert-dialog`); on confirm call `useBlockUser().mutate(otherParticipantId)` (or `useUnblockUser`). After a successful **block**, `navigate` back to the messages list (`/dashboard/{role}/messages`) since the conversation is now hidden.
- **Report user** — calls `useReportUser().mutate({ reportedId: otherParticipantId, conversationId })`.

Keep the existing "View Profile" link (move it into the menu OR keep beside the kebab — implementer's call; do not remove it). Wire `useBlockUser`, `useUnblockUser`, `useIsUserBlocked`, `useReportUser`, and `useState` for the dialog.

- [ ] **Step 2: Typecheck, lint, build**

Run: `npm run typecheck` → `npx eslint src/pages/DirectConversationPage.tsx src/hooks/useUserBlocks.ts src/hooks/useReportUser.ts` → `npm run build`. Expected: all pass. (No brittle component test — verified by build + manual/prod check in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/DirectConversationPage.tsx
git commit -m "feat(messaging): Block/Unblock/Report menu in conversation header"
```

---

## Task 4: Deploy (staging → prod) + verify — GATED, ordering matters

> This task applies the DB migration outside git/Lovable. It needs Supabase credentials (`SUPABASE_ACCESS_TOKEN` + DB password) and is an **explicitly-authorized / likely user-run** step. Do NOT merge the frontend PR until the migration is on prod.

- [ ] **Step 1: Apply + test on staging** (`mhffqrawgizhprbobcta`)

Apply the migration (`npx supabase db push --project-ref mhffqrawgizhprbobcta`, or via the Supabase MCP). Confirm a **clean replay** (no errors — prod schema has drifted; the migration must apply standalone). As two test users, verify: blocking hides the direct conversation from the list, hides its messages both ways, and a send raises "You cannot message a blocked user"; report inserts a `user_reports` row; unblock restores.

- [ ] **Step 2: Apply to prod** (`zocahiffooqdybdhguqv`) — BEFORE merging the frontend.

`npx supabase db push --project-ref zocahiffooqdybdhguqv` (or MCP). Then optionally regenerate Supabase types and drop the `as never` casts (cleanup, can be a follow-up).

- [ ] **Step 3: Push branch + open PR + merge** (frontend reaches prod via Lovable after the migration is live)

Push `worktree-apple-app-store-3`, open a PR to `main`, wait for checks (`lighthouse`/`verify`/`smoke`), merge.

- [ ] **Step 4: Prod verification** (test accounts, desktop + mobile)

In a real DM on dragoncandy.io: Block → conversation disappears + cannot message; the other account also cannot message; Report → a `user_reports` row is recorded; Unblock → conversation returns. Check console for errors.

---

## Definition of Done

- `user_blocks` + `user_reports` exist with owner-only RLS; `is_blocked()` + the 4 RPCs exist and are granted to `authenticated`.
- Direct messages between blocked users are hidden (SELECT policy) and cannot be sent (trigger); blocked direct conversations are excluded from `get_user_conversations`. Campaign messaging is unaffected.
- The conversation header has a working Block/Unblock/Report menu; hooks call the RPCs and invalidate caches.
- Hook unit test passes; `npm run typecheck` + `npm run build` + eslint pass.
- Migration applied to staging (clean replay) then prod **before** the frontend merge; prod verified.
- No campaign/marketplace messaging behavior changed; no `any` introduced (casts use `as never`).
