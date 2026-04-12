# Donny AI Superagent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Donny from fragmented UI entry points into a unified superagent with a two-stage interaction model (tray → chat), accessible from every page via the center nav button on mobile and a right side panel on desktop.

**Architecture:** Clean-room shell with reused internals. New components (`DonnyProvider`, `DonnyNavButton`, `DonnyTray`, `DonnyChat`) wrap existing proven logic (`useDonny` hook, `DonnyMessage`, `DonnyRichCard`, `donny-chat` edge function). A new nudge engine uses Supabase database triggers + a lightweight AI edge function to surface actionable notifications.

**Tech Stack:** React + TypeScript, Tailwind CSS, Supabase (Postgres, Edge Functions, Realtime), React Query, React Router

**Spec:** `docs/superpowers/specs/2026-04-11-donny-ai-superagent-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/contexts/DonnyProvider.tsx` | Unified Donny context — stage state machine, nudges, chat delegation, context awareness |
| `src/hooks/useDonnyNudges.ts` | Subscribes to `donny_nudges` table via Supabase real-time, manages nudge state |
| `src/hooks/useDonnyQuickChips.ts` | Generates context-aware quick chips based on current page, role, and app state |
| `src/components/donny/DonnyNavButton.tsx` | Already exists (27 lines) — will be heavily refactored to use emblem + DonnyProvider context |
| `src/components/donny/DonnyTray.tsx` | Stage 1 container — renders nudge cards, quick chips, tray input |
| `src/components/donny/DonnyNudgeCard.tsx` | Single nudge card with inline action buttons |
| `src/components/donny/DonnyTrayInput.tsx` | Minimal text input in tray that triggers expand to Stage 2 |
| `src/components/donny/DonnyChatView.tsx` | Stage 2 container — wraps existing DonnyMessage, DonnyRichCard, DonnyQuickChips |
| `src/components/donny/DonnyChatHeader.tsx` | Teal gradient header for full chat with collapse button |
| `src/components/donny/DonnyChatInput.tsx` | Full input bar with send button |
| `src/components/donny/DonnyMobileSheet.tsx` | Mobile-specific bottom sheet container with drag gestures |
| `src/components/donny/DonnyDesktopPanel.tsx` | Desktop-specific right side panel container |
| `src/types/donnyNudge.ts` | Types for DonnyNudge, NudgeAction, QuickChip |
| `supabase/functions/donny-nudge-frame/index.ts` | Lightweight AI edge function for nudge summary + priority |
| `supabase/migrations/20260411000000_create_donny_nudges.sql` | Migration for donny_nudges table with RLS |

### Modified Files

| File | Changes |
|------|---------|
| `src/App.tsx` | Replace `AIAssistantProvider` + `AIChatModalProvider` with `DonnyProvider`, remove `DonnyDock` import, add desktop panel mount |
| `src/components/MobileBottomNav.tsx` | Replace center nav link with `DonnyNavButton`, remove `DonnyChatSheet` import, remove custom event listener |
| `src/lib/navConfig.ts` | Change center `BottomNavItem` to `isDonny` flag instead of `isCenter` with href |
| `src/components/donny/DonnyAvatar.tsx` | Add `xs` size, add `showBadge`/`badgeCount`/`glow` props, use new emblem asset |
| `src/components/donny/DonnyQuickChips.tsx` | Add `variant` styling support (teal/pink) |
| `src/assets/` | Add `donny-emblem.png` |

### Deleted Files (Phase 3)

| File | Replaced By |
|------|------------|
| `src/components/DonnyDock.tsx` | `DonnyNavButton` + `DonnyProvider` |
| `src/components/donny/DonnyAskBar.tsx` | Single entry point via nav button |
| `src/components/donny/DonnyChatSheet.tsx` | `DonnyTray` + `DonnyChatView` |
| `src/components/donny/DonnyCard.tsx` | `DonnyNudgeCard` in tray |
| `src/components/dashboard/DonnyAIBar.tsx` | Single entry point via nav button |
| `src/features/promotions/components/DonnyCampaignCTA.tsx` | Quick chip in tray |
| `src/contexts/AIAssistantContext.tsx` | `DonnyProvider` |
| `src/contexts/AIChatModalContext.tsx` | `DonnyProvider` stage state |

---

## Task 1: Add Donny Emblem Asset & Refactor DonnyAvatar

**Files:**
- Create: `src/assets/donny-emblem.png` (copy from user's file)
- Modify: `src/components/donny/DonnyAvatar.tsx`
- Modify: `src/types/donny.ts`

- [ ] **Step 1: Copy the emblem asset**

Copy the minty green dragon emblem to the assets directory:

```bash
cp "/c/Users/dwill/Documents/Claude/Projects/DragonCandy App/Minty green dragon emblem.png" src/assets/donny-emblem.png
```

- [ ] **Step 2: Update DonnyAvatarState type**

In `src/types/donny.ts`, find the `DonnyAvatarState` type and remove the `error` state:

```typescript
// Before:
export type DonnyAvatarState = 'idle' | 'thinking' | 'celebrating' | 'error' | 'action_needed';

// After:
export type DonnyAvatarState = 'idle' | 'thinking' | 'celebrating' | 'action_needed';
```

- [ ] **Step 3: Refactor DonnyAvatar component**

Replace `src/components/donny/DonnyAvatar.tsx` with:

```typescript
import { cn } from '@/lib/utils';
import type { DonnyAvatarState } from '@/types/donny';
import donnyEmblem from '@/assets/donny-emblem.png';

interface DonnyAvatarProps {
  size: 'xs' | 'sm' | 'md' | 'lg';
  state?: DonnyAvatarState;
  showBadge?: boolean;
  badgeCount?: number;
  glow?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

const badgeSizeClasses = {
  xs: 'w-3 h-3 text-[6px] -top-0.5 -right-0.5',
  sm: 'w-3.5 h-3.5 text-[7px] -top-0.5 -right-0.5',
  md: 'w-4 h-4 text-[8px] -top-1 -right-1',
  lg: 'w-5 h-5 text-[9px] -top-1 -right-1',
};

const stateStyles: Record<DonnyAvatarState, string> = {
  idle: '',
  thinking: 'animate-pulse',
  celebrating: 'animate-bounce',
  action_needed: 'animate-pulse',
};

export function DonnyAvatar({
  size,
  state = 'idle',
  showBadge = false,
  badgeCount,
  glow = false,
  className,
}: DonnyAvatarProps) {
  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden',
          sizeClasses[size],
          stateStyles[state],
          glow && 'shadow-[0_0_12px_rgba(77,217,192,0.5)]'
        )}
      >
        <img
          src={donnyEmblem}
          alt="Donny"
          className="w-full h-full object-cover rounded-full"
        />
      </div>
      {showBadge && badgeCount != null && badgeCount > 0 && (
        <span
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-[#EC4899] text-white font-bold border-2 border-white',
            badgeSizeClasses[size]
          )}
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify no compile errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

Check for any references to the old `error` avatar state or old `donnyIcon` import that need updating. Fix any that appear — they'll be in `DonnyDock.tsx`, `DonnyChatSheet.tsx`, etc. For now, add `error` back as an alias if needed to avoid breaking existing code that will be deleted later:

If compile errors exist from removed `error` state, temporarily keep it in the type until Phase 3 cleanup.

- [ ] **Step 5: Commit**

```bash
git add src/assets/donny-emblem.png src/components/donny/DonnyAvatar.tsx src/types/donny.ts
git commit -m "feat(donny): add dragon emblem asset and refactor DonnyAvatar

Add xs size, badge support, and glow effect. Use new emblem image."
```

---

## Task 2: Add Nudge Types

**Files:**
- Create: `src/types/donnyNudge.ts`

- [ ] **Step 1: Create nudge type definitions**

Create `src/types/donnyNudge.ts`:

```typescript
export interface NudgeAction {
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
  action: string;
  payload: Record<string, unknown>;
}

export interface DonnyNudge {
  id: string;
  type: 'application' | 'content' | 'milestone' | 'payment' | 'invitation' | 'match';
  rawData: Record<string, unknown>;
  summary: string;
  priority: 'high' | 'medium' | 'low';
  actions: NudgeAction[];
  createdAt: string;
  readAt: string | null;
  actedAt: string | null;
  dismissedAt: string | null;
}

export interface QuickChip {
  label: string;
  message: string;
  variant: 'teal' | 'pink';
  requiresChat: boolean;
}

export type DonnyStage = 'closed' | 'tray' | 'chat';
```

- [ ] **Step 2: Commit**

```bash
git add src/types/donnyNudge.ts
git commit -m "feat(donny): add nudge and quick chip type definitions"
```

---

## Task 3: Create donny_nudges Table Migration

**Files:**
- Create: `supabase/migrations/20260411000000_create_donny_nudges.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260411000000_create_donny_nudges.sql`:

```sql
-- Create donny_nudges table for ambient notification layer
CREATE TABLE IF NOT EXISTS public.donny_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('application', 'content', 'milestone', 'payment', 'invitation', 'match')),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}',
  summary text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  actions jsonb NOT NULL DEFAULT '[]',
  read_at timestamptz,
  acted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user queries (active nudges)
CREATE INDEX idx_donny_nudges_user_active
  ON public.donny_nudges (user_id, created_at DESC)
  WHERE acted_at IS NULL AND dismissed_at IS NULL;

-- Index for source deduplication
CREATE UNIQUE INDEX idx_donny_nudges_source
  ON public.donny_nudges (user_id, source_table, source_id);

-- Enable RLS
ALTER TABLE public.donny_nudges ENABLE ROW LEVEL SECURITY;

-- Users can only read their own nudges
CREATE POLICY "Users can read own nudges"
  ON public.donny_nudges FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own nudges (mark read, acted, dismissed)
CREATE POLICY "Users can update own nudges"
  ON public.donny_nudges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No INSERT policy needed — the service role (used by edge functions) bypasses RLS.
-- If client-side inserts are ever needed, add a restricted policy.

-- Enable realtime for nudges
ALTER PUBLICATION supabase_realtime ADD TABLE public.donny_nudges;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool to apply this migration to the project.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260411000000_create_donny_nudges.sql
git commit -m "feat(donny): add donny_nudges table with RLS and realtime"
```

---

## Task 4: Create donny-nudge-frame Edge Function

**Files:**
- Create: `supabase/functions/donny-nudge-frame/index.ts`

- [ ] **Step 1: Write the edge function**

Follow the pattern from `supabase/functions/donny-chat/index.ts` (CORS headers, Deno serve, Anthropic API key). Create `supabase/functions/donny-nudge-frame/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface NudgeFrameRequest {
  user_id: string;
  type: string;
  source_table: string;
  source_id: string;
  data: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, type, source_table, source_id, data } =
      (await req.json()) as NudgeFrameRequest;

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Generate AI summary and priority
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:
          "You generate brief, friendly notification summaries for a marketplace app connecting businesses with content creators. Respond with JSON only: { \"summary\": \"<one-line summary with personality>\", \"priority\": \"high|medium|low\" }. High = requires action (new application, content submitted). Medium = informational (milestone, status change). Low = nice-to-know.",
        messages: [
          {
            role: "user",
            content: `Event type: ${type}\nData: ${JSON.stringify(data)}`,
          },
        ],
      }),
    });

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(content);

    // Determine actions based on event type
    const actions = getActionsForType(type, data);

    // Insert nudge into database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("donny_nudges").upsert(
      {
        user_id,
        type,
        source_table,
        source_id,
        raw_data: data,
        summary: parsed.summary ?? `New ${type} event`,
        priority: parsed.priority ?? "medium",
        actions,
      },
      { onConflict: "user_id,source_table,source_id" }
    );

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[donny-nudge-frame]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getActionsForType(
  type: string,
  data: Record<string, unknown>
): Array<{ label: string; variant: string; action: string; payload: Record<string, unknown> }> {
  switch (type) {
    case "application":
      return [
        { label: "Approve", variant: "primary", action: "approve_application", payload: { applicationId: data.application_id } },
        { label: "View", variant: "secondary", action: "view_application", payload: { applicationId: data.application_id } },
        { label: "Pass", variant: "ghost", action: "dismiss_application", payload: { applicationId: data.application_id } },
      ];
    case "content":
      return [
        { label: "Review", variant: "primary", action: "review_content", payload: { uploadId: data.upload_id } },
        { label: "Later", variant: "secondary", action: "dismiss", payload: {} },
      ];
    case "invitation":
      return [
        { label: "View", variant: "primary", action: "view_invitation", payload: { invitationId: data.invitation_id } },
        { label: "Dismiss", variant: "ghost", action: "dismiss", payload: {} },
      ];
    case "payment":
      return [
        { label: "View Details", variant: "primary", action: "view_payment", payload: { paymentId: data.payment_id } },
      ];
    case "milestone":
      return [
        { label: "View", variant: "primary", action: "view_campaign", payload: { campaignId: data.campaign_id } },
      ];
    case "match":
      return [
        { label: "View Match", variant: "primary", action: "view_match", payload: { matchId: data.match_id } },
        { label: "Dismiss", variant: "ghost", action: "dismiss", payload: {} },
      ];
    default:
      return [];
  }
}
```

- [ ] **Step 2: Deploy the edge function via Supabase MCP**

Use the Supabase MCP `deploy_edge_function` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-nudge-frame/index.ts
git commit -m "feat(donny): add donny-nudge-frame edge function for AI nudge summaries"
```

---

## Task 5: Create Database Triggers for Nudge Creation

**Files:**
- Create: `supabase/migrations/20260411000001_donny_nudge_triggers.sql`

- [ ] **Step 1: Write the trigger migration**

Create `supabase/migrations/20260411000001_donny_nudge_triggers.sql`. This uses `pg_net` to call the `donny-nudge-frame` edge function when relevant events occur:

```sql
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper function to call donny-nudge-frame edge function
CREATE OR REPLACE FUNCTION public.notify_donny_nudge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url text := current_setting('app.settings.supabase_url', true);
  _service_key text := current_setting('app.settings.service_role_key', true);
  _user_id uuid;
  _type text;
  _source_table text;
  _source_id uuid;
  _data jsonb;
BEGIN
  _source_table := TG_TABLE_NAME;
  _source_id := NEW.id;

  -- Determine user_id and type based on source table
  CASE TG_TABLE_NAME
    WHEN 'campaign_applications' THEN
      -- Notify the campaign owner (business) about new applications
      SELECT c.user_id INTO _user_id
        FROM public.campaigns c
        WHERE c.id = NEW.campaign_id;
      _type := 'application';
      _data := jsonb_build_object(
        'application_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.user_id
      );
    WHEN 'file_uploads' THEN
      -- Notify campaign owner about content submissions
      -- Only trigger for uploads linked to a collaboration
      IF NEW.collaboration_id IS NOT NULL THEN
        SELECT cc.business_id INTO _user_id
          FROM public.campaign_collaborations cc
          WHERE cc.id = NEW.collaboration_id;
        _type := 'content';
        _data := jsonb_build_object(
          'upload_id', NEW.id,
          'collaboration_id', NEW.collaboration_id
        );
      ELSE
        RETURN NEW;
      END IF;
    WHEN 'campaign_invitations' THEN
      -- Notify the invited creator
      _user_id := NEW.creator_id;
      _type := 'invitation';
      _data := jsonb_build_object(
        'invitation_id', NEW.id,
        'campaign_id', NEW.campaign_id
      );
    WHEN 'campaign_matches' THEN
      -- Notify brand about new matches
      _user_id := NEW.brand_id;
      _type := 'match';
      _data := jsonb_build_object(
        'match_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.creator_id
      );
    ELSE
      RETURN NEW;
  END CASE;

  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call the edge function via pg_net
  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/donny-nudge-frame',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', _user_id,
      'type', _type,
      'source_table', _source_table,
      'source_id', _source_id,
      'data', _data
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger on new campaign applications
CREATE TRIGGER donny_nudge_on_application
  AFTER INSERT ON public.campaign_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();

-- Trigger on new file uploads (content submissions)
CREATE TRIGGER donny_nudge_on_upload
  AFTER INSERT ON public.file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();

-- Trigger on new campaign invitations
CREATE TRIGGER donny_nudge_on_invitation
  AFTER INSERT ON public.campaign_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();

-- Trigger on new campaign matches
CREATE TRIGGER donny_nudge_on_match
  AFTER INSERT ON public.campaign_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();
```

**Note:** The `app.settings.supabase_url` and `app.settings.service_role_key` must be set in the Supabase project's database settings. Check if they are already configured — if not, they'll need to be set via the Supabase dashboard under Database > Settings > Configuration > Custom.

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260411000001_donny_nudge_triggers.sql
git commit -m "feat(donny): add database triggers to create nudges on key events"
```

---

## Task 6: Regenerate Supabase TypeScript Types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (or wherever generated types live)

- [ ] **Step 1: Find the generated types file**

```bash
grep -rl "donny_conversations" src/integrations/ --include="*.ts" | head -3
```

- [ ] **Step 2: Regenerate types via Supabase MCP**

Use the Supabase MCP `generate_typescript_types` tool to regenerate types that include the new `donny_nudges` table.

- [ ] **Step 3: Verify the new table appears in types**

```bash
grep "donny_nudges" src/integrations/supabase/types.ts
```

Expected: type definitions for `donny_nudges` table with all columns.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate Supabase types to include donny_nudges table"
```

---

## Task 7: Create useDonnyNudges Hook

**Files:**
- Create: `src/hooks/useDonnyNudges.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useDonnyNudges.ts`. Follow the pattern from `src/hooks/useDonny.ts` (React Query + Supabase real-time subscription):

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DonnyNudge, NudgeAction } from '@/types/donnyNudge';

export function useDonnyNudges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch active nudges (not acted on or dismissed)
  const { data: nudges = [], isLoading } = useQuery({
    queryKey: ['donny-nudges', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('donny_nudges')
        .select('*')
        .eq('user_id', user.id)
        .is('acted_at', null)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data ?? []).map((row): DonnyNudge => ({
        id: row.id,
        type: row.type,
        rawData: row.raw_data,
        summary: row.summary,
        priority: row.priority,
        actions: row.actions as NudgeAction[],
        createdAt: row.created_at,
        readAt: row.read_at,
        actedAt: row.acted_at,
        dismissedAt: row.dismissed_at,
      }));
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Real-time subscription for new nudges
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`donny-nudges-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'donny_nudges',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['donny-nudges', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Mark nudge as acted
  const actOnNudge = useMutation({
    mutationFn: async (nudgeId: string) => {
      const { error } = await supabase
        .from('donny_nudges')
        .update({ acted_at: new Date().toISOString() })
        .eq('id', nudgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donny-nudges', user?.id] });
    },
  });

  // Dismiss nudge
  const dismissNudge = useMutation({
    mutationFn: async (nudgeId: string) => {
      const { error } = await supabase
        .from('donny_nudges')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', nudgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donny-nudges', user?.id] });
    },
  });

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const unread = nudges.filter((n) => !n.readAt);
    if (unread.length === 0) return;

    await supabase
      .from('donny_nudges')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
  }, [user?.id, nudges]);

  const unreadCount = nudges.filter((n) => !n.readAt).length;

  return {
    nudges,
    unreadCount,
    isLoading,
    actOnNudge: actOnNudge.mutate,
    dismissNudge: dismissNudge.mutate,
    markAllRead,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "donnyNudge\|useDonnyNudges" | head -10`

Note: The `donny_nudges` table may not be in the generated Supabase types yet. If there are type errors on `.from('donny_nudges')`, use `.from('donny_nudges' as any)` temporarily until types are regenerated.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDonnyNudges.ts
git commit -m "feat(donny): add useDonnyNudges hook with real-time subscription"
```

---

## Task 8: Create useDonnyQuickChips Hook

**Files:**
- Create: `src/hooks/useDonnyQuickChips.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useDonnyQuickChips.ts`:

```typescript
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { QuickChip } from '@/types/donnyNudge';
import type { UserRole } from '@/types/user';

const MAX_CHIPS = 5;

// Page-level default chips per role
const PAGE_CHIPS: Record<string, Record<string, QuickChip[]>> = {
  '/dashboard/business': {
    business_client: [
      { label: '📊 Campaign stats', message: 'Show me my campaign stats', variant: 'teal', requiresChat: true },
      { label: '✨ Create campaign', message: 'Help me create a new campaign', variant: 'pink', requiresChat: true },
      { label: '👥 Top creators', message: 'Show me top creators for my campaigns', variant: 'teal', requiresChat: true },
    ],
  },
  '/dashboard/creator': {
    content_creator: [
      { label: '🔍 Find campaigns', message: 'Show me campaigns I should apply to', variant: 'teal', requiresChat: true },
      { label: '💰 Earnings summary', message: 'Show me my earnings summary', variant: 'pink', requiresChat: false },
      { label: '📈 My performance', message: 'How am I performing?', variant: 'teal', requiresChat: true },
    ],
  },
  '/dashboard/brand': {
    brand: [
      { label: '📊 Campaign stats', message: 'Show me my sponsorship stats', variant: 'teal', requiresChat: true },
      { label: '🔍 Find creators', message: 'Help me find creators', variant: 'pink', requiresChat: true },
      { label: '🤝 Active collabs', message: 'Show me active collaborations', variant: 'teal', requiresChat: true },
    ],
  },
  // Messages pages — all roles
  messages: {
    _default: [
      { label: '📨 Unread summary', message: 'Summarize my unread messages', variant: 'teal', requiresChat: true },
      { label: '⚡ Quick replies', message: 'Help me draft quick replies', variant: 'pink', requiresChat: true },
    ],
  },
  // Campaigns pages — all roles
  campaigns: {
    _default: [
      { label: '👀 View applicants', message: 'Show me recent applicants', variant: 'teal', requiresChat: true },
      { label: '🚀 Boost campaign', message: 'How can I boost my campaign performance?', variant: 'pink', requiresChat: true },
    ],
  },
};

function matchPage(pathname: string, userRole: UserRole): QuickChip[] | undefined {
  // Exact match first, then look up by role or _default
  const exactRole = PAGE_CHIPS[pathname];
  if (exactRole) {
    const chips = exactRole[userRole] ?? exactRole._default;
    if (chips) return chips;
  }
  // Partial match (e.g., /dashboard/business/messages → messages)
  if (pathname.includes('/messages')) return PAGE_CHIPS.messages?._default;
  if (pathname.includes('/campaigns')) return PAGE_CHIPS.campaigns?._default;
  return undefined;
}

export function useDonnyQuickChips(userRole: UserRole) {
  const location = useLocation();
  const { user } = useAuth();

  // Fetch state-aware data for override chips
  const { data: stateData } = useQuery({
    queryKey: ['donny-chip-state', user?.id, userRole],
    queryFn: async () => {
      if (!user?.id) return { pendingApplications: 0, hasNoCampaigns: false };

      const results: { pendingApplications: number; hasNoCampaigns: boolean } = {
        pendingApplications: 0,
        hasNoCampaigns: false,
      };

      if (userRole === 'business_client' || userRole === 'brand') {
        const { count } = await supabase
          .from('campaign_applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        results.pendingApplications = count ?? 0;
      }

      if (userRole === 'business_client') {
        const { count } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published');
        results.hasNoCampaigns = (count ?? 0) === 0;
      }

      return results;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const chips = useMemo(() => {
    const stateChips: QuickChip[] = [];

    // State-aware overrides (highest priority)
    if (stateData?.pendingApplications && stateData.pendingApplications > 0) {
      stateChips.push({
        label: `📋 Review ${stateData.pendingApplications} applicant${stateData.pendingApplications > 1 ? 's' : ''}`,
        message: 'Show me pending applications to review',
        variant: 'teal',
        requiresChat: true,
      });
    }

    if (stateData?.hasNoCampaigns) {
      stateChips.push({
        label: '✨ Create your first campaign',
        message: 'Help me create my first campaign',
        variant: 'pink',
        requiresChat: true,
      });
    }

    // Page-level defaults
    const pageChips = matchPage(location.pathname, userRole) ?? [];

    // Merge: state chips first, then fill with page chips up to MAX_CHIPS
    const remaining = MAX_CHIPS - stateChips.length;
    return [...stateChips, ...pageChips.slice(0, remaining)];
  }, [location.pathname, stateData]);

  return chips;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDonnyQuickChips.ts
git commit -m "feat(donny): add useDonnyQuickChips hook with page and state awareness"
```

---

## Task 9: Create DonnyProvider Context

**Files:**
- Create: `src/contexts/DonnyProvider.tsx`

- [ ] **Step 1: Write the provider**

Create `src/contexts/DonnyProvider.tsx`:

```typescript
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDonny } from '@/hooks/useDonny';
import { useDonnyNudges } from '@/hooks/useDonnyNudges';
import { useDonnyQuickChips } from '@/hooks/useDonnyQuickChips';
import type { DonnyStage, DonnyNudge, NudgeAction, QuickChip } from '@/types/donnyNudge';
import type { DonnyMessage, DonnyConversation, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';

interface DonnyContextValue {
  // UI state
  stage: DonnyStage;
  open: () => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;

  // Nudges
  nudges: DonnyNudge[];
  unreadCount: number;
  executeAction: (nudgeId: string, action: NudgeAction) => void;
  dismissNudge: (nudgeId: string) => void;

  // Chat
  messages: DonnyMessage[];
  conversation: DonnyConversation | null;
  avatarState: DonnyAvatarState;
  isStreaming: boolean;
  sendMessage: (msg: string) => void;

  // Context
  currentPage: string;
  userRole: UserRole;
  quickChips: QuickChip[];
}

const DonnyContext = createContext<DonnyContextValue | null>(null);

export function useDonnyContext() {
  const ctx = useContext(DonnyContext);
  if (!ctx) throw new Error('useDonnyContext must be used within DonnyProvider');
  return ctx;
}

interface DonnyProviderProps {
  children: ReactNode;
  userRole: UserRole;
}

export function DonnyProvider({ children, userRole }: DonnyProviderProps) {
  const [stage, setStage] = useState<DonnyStage>('closed');
  const location = useLocation();

  // Existing chat hook
  const donny = useDonny();

  // Nudges
  const {
    nudges,
    unreadCount,
    actOnNudge,
    dismissNudge: dismissNudgeMutation,
    markAllRead,
  } = useDonnyNudges();

  // Quick chips
  const quickChips = useDonnyQuickChips(userRole);

  // Stage transitions
  const open = useCallback(() => {
    setStage('tray');
    markAllRead();
  }, [markAllRead]);

  const expand = useCallback(() => setStage('chat'), []);
  const collapse = useCallback(() => setStage('tray'), []);
  const close = useCallback(() => setStage('closed'), []);

  // Execute a nudge action
  const executeAction = useCallback(
    (nudgeId: string, action: NudgeAction) => {
      // Mark the nudge as acted on
      actOnNudge(nudgeId);

      // Handle the action — for now, send the action as a message to Donny
      // so the chat edge function can execute it via tool calls
      const actionMessage = `Execute action: ${action.action} with ${JSON.stringify(action.payload)}`;
      donny.sendMessage(actionMessage);
    },
    [actOnNudge, donny]
  );

  const dismissNudge = useCallback(
    (nudgeId: string) => dismissNudgeMutation(nudgeId),
    [dismissNudgeMutation]
  );

  const sendMessage = useCallback(
    (msg: string) => {
      donny.sendMessage(msg);
    },
    [donny]
  );

  const value = useMemo<DonnyContextValue>(
    () => ({
      stage,
      open,
      expand,
      collapse,
      close,
      nudges,
      unreadCount,
      executeAction,
      dismissNudge,
      messages: donny.messages,
      conversation: donny.conversation ?? null,
      avatarState: donny.avatarState,
      isStreaming: donny.isStreaming,
      sendMessage,
      currentPage: location.pathname,
      userRole,
      quickChips,
    }),
    [
      stage, open, expand, collapse, close,
      nudges, unreadCount, executeAction, dismissNudge,
      donny.messages, donny.conversation, donny.avatarState, donny.isStreaming,
      sendMessage, location.pathname, userRole, quickChips,
    ]
  );

  return <DonnyContext.Provider value={value}>{children}</DonnyContext.Provider>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "DonnyProvider" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/contexts/DonnyProvider.tsx
git commit -m "feat(donny): add DonnyProvider unified context with stage state machine"
```

---

## Task 10: Create DonnyNudgeCard Component

**Files:**
- Create: `src/components/donny/DonnyNudgeCard.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/donny/DonnyNudgeCard.tsx`:

```typescript
import { DonnyAvatar } from './DonnyAvatar';
import type { DonnyNudge, NudgeAction } from '@/types/donnyNudge';
import { cn } from '@/lib/utils';

interface DonnyNudgeCardProps {
  nudge: DonnyNudge;
  onAction: (action: NudgeAction) => void;
  onDismiss: () => void;
}

const priorityStyles = {
  high: 'bg-gradient-to-r from-teal-50 to-emerald-50 border-teal-300',
  medium: 'bg-gradient-to-r from-pink-50 to-fuchsia-50 border-pink-300',
  low: 'bg-gray-50 border-gray-200',
};

const variantStyles = {
  primary: 'bg-dc-teal text-white',
  secondary: 'bg-white text-gray-600 border border-gray-200',
  ghost: 'bg-gray-100 text-gray-500',
};

export function DonnyNudgeCard({ nudge, onAction, onDismiss }: DonnyNudgeCardProps) {
  return (
    <div className={cn('rounded-xl border p-3 transition-all', priorityStyles[nudge.priority])}>
      <div className="flex items-start gap-2 mb-2">
        <DonnyAvatar size="xs" />
        <p className="text-sm text-gray-700 flex-1">{nudge.summary}</p>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 text-xs leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {nudge.actions.length > 0 && (
        <div className="flex gap-1.5 ml-7">
          {nudge.actions.map((action) => (
            <button
              key={action.action}
              onClick={() => onAction(action)}
              className={cn(
                'flex-1 text-center py-1.5 px-3 rounded-full text-xs font-semibold transition-colors',
                variantStyles[action.variant]
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyNudgeCard.tsx
git commit -m "feat(donny): add DonnyNudgeCard component with inline actions"
```

---

## Task 11: Create DonnyTrayInput Component

**Files:**
- Create: `src/components/donny/DonnyTrayInput.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/donny/DonnyTrayInput.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';

interface DonnyTrayInputProps {
  onSubmit: (message: string) => void;
  onFocus: () => void;
}

export function DonnyTrayInput({ onSubmit, onFocus }: DonnyTrayInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={onFocus}
        placeholder="Ask Donny anything..."
        className="flex-1 bg-gray-100 rounded-full py-2 px-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-dc-teal/30"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white disabled:opacity-30"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyTrayInput.tsx
git commit -m "feat(donny): add DonnyTrayInput component"
```

---

## Task 12: Create DonnyTray Component (Stage 1)

**Files:**
- Create: `src/components/donny/DonnyTray.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/donny/DonnyTray.tsx`:

```typescript
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyNudgeCard } from './DonnyNudgeCard';
import { DonnyTrayInput } from './DonnyTrayInput';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { cn } from '@/lib/utils';

export function DonnyTray() {
  const {
    nudges,
    unreadCount,
    quickChips,
    avatarState,
    executeAction,
    dismissNudge,
    sendMessage,
    expand,
  } = useDonnyContext();

  const handleChipTap = (message: string, requiresChat: boolean) => {
    sendMessage(message);
    if (requiresChat) {
      expand();
    }
  };

  const handleInputSubmit = (message: string) => {
    sendMessage(message);
    expand();
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <DonnyAvatar size="sm" state={avatarState} />
        <span className="font-bold text-sm text-gray-900">Donny</span>
        {unreadCount > 0 && (
          <span className="text-xs font-semibold text-dc-teal bg-teal-50 px-2 py-0.5 rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>

      {/* Nudge cards */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {nudges.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            All caught up! No new notifications.
          </div>
        )}
        {nudges.map((nudge) => (
          <DonnyNudgeCard
            key={nudge.id}
            nudge={nudge}
            onAction={(action) => executeAction(nudge.id, action)}
            onDismiss={() => dismissNudge(nudge.id)}
          />
        ))}
      </div>

      {/* Quick chips */}
      {quickChips.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {quickChips.map((chip) => (
              <button
                key={chip.label}
                onClick={() => handleChipTap(chip.message, chip.requiresChat)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                  chip.variant === 'teal'
                    ? 'bg-teal-50 border-teal-300 text-teal-700'
                    : 'bg-pink-50 border-pink-300 text-pink-700'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <DonnyTrayInput onSubmit={handleInputSubmit} onFocus={expand} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyTray.tsx
git commit -m "feat(donny): add DonnyTray component (Stage 1 — nudges, chips, input)"
```

---

## Task 13: Create DonnyChatHeader, DonnyChatInput, and DonnyChatView (Stage 2)

**Files:**
- Create: `src/components/donny/DonnyChatHeader.tsx`
- Create: `src/components/donny/DonnyChatInput.tsx`
- Create: `src/components/donny/DonnyChatView.tsx`

- [ ] **Step 1: Write DonnyChatHeader**

Create `src/components/donny/DonnyChatHeader.tsx`:

```typescript
import { ChevronDown, X } from 'lucide-react';
import { DonnyAvatar } from './DonnyAvatar';
import type { DonnyAvatarState } from '@/types/donny';

interface DonnyChatHeaderProps {
  avatarState: DonnyAvatarState;
  onCollapse: () => void;
  onClose: () => void;
}

export function DonnyChatHeader({ avatarState, onCollapse, onClose }: DonnyChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-dc-teal to-[#00E5CC]">
      <DonnyAvatar size="md" state={avatarState} />
      <div className="flex-1">
        <div className="font-bold text-sm text-white">Donny</div>
        <div className="text-[10px] text-white/80">Your AI assistant</div>
      </div>
      <button onClick={onCollapse} className="text-white/70 hover:text-white">
        <ChevronDown className="w-5 h-5" />
      </button>
      <button onClick={onClose} className="text-white/70 hover:text-white">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write DonnyChatInput**

Create `src/components/donny/DonnyChatInput.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { Send, Plus } from 'lucide-react';

interface DonnyChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

export function DonnyChatInput({ onSubmit, disabled }: DonnyChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 bg-white border-t border-gray-100">
      <button type="button" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white flex-shrink-0">
        <Plus className="w-4 h-4" />
      </button>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask Donny anything..."
        disabled={disabled}
        className="flex-1 bg-gray-100 rounded-full py-2 px-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-dc-teal/30 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white flex-shrink-0 disabled:opacity-30"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Write DonnyChatView**

Create `src/components/donny/DonnyChatView.tsx`. This wraps the existing `DonnyMessage`, `DonnyRichCard`, `DonnyTypingIndicator`, and `DonnyQuickChips` components:

```typescript
import { useEffect, useRef } from 'react';
import { DonnyChatHeader } from './DonnyChatHeader';
import { DonnyChatInput } from './DonnyChatInput';
import { DonnyMessage } from './DonnyMessage';
import { DonnyTypingIndicator } from './DonnyTypingIndicator';
import { DonnyQuickChips } from './DonnyQuickChips';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export function DonnyChatView() {
  const {
    messages,
    avatarState,
    isStreaming,
    sendMessage,
    quickChips,
    collapse,
    close,
  } = useDonnyContext();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isStreaming]);

  const handleChipTap = (message: string) => {
    sendMessage(message);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <DonnyChatHeader
        avatarState={avatarState}
        onCollapse={collapse}
        onClose={close}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 bg-teal-50/30 space-y-3">
        {messages.map((msg, i) => (
          <DonnyMessage
            key={msg.id ?? i}
            message={msg}
            avatarState={avatarState}
            isLatestAssistant={
              msg.role === 'assistant' &&
              i === messages.findLastIndex((m) => m.role === 'assistant')
            }
          />
        ))}
        {isStreaming && <DonnyTypingIndicator />}
      </div>

      {/* Quick chips */}
      {quickChips.length > 0 && !isStreaming && (
        <div className="px-3 py-1.5 border-t border-gray-100">
          <DonnyQuickChips
            chips={quickChips.map((c) => ({ label: c.label, message: c.message }))}
            onChipTap={handleChipTap}
          />
        </div>
      )}

      <DonnyChatInput onSubmit={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "DonnyChat" | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/DonnyChatHeader.tsx src/components/donny/DonnyChatInput.tsx src/components/donny/DonnyChatView.tsx
git commit -m "feat(donny): add DonnyChatHeader, DonnyChatInput, DonnyChatView (Stage 2)"
```

---

## Task 14: Create DonnyMobileSheet Container

**Files:**
- Create: `src/components/donny/DonnyMobileSheet.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/donny/DonnyMobileSheet.tsx`. This handles the mobile bottom sheet with drag gestures:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { DonnyTray } from './DonnyTray';
import { DonnyChatView } from './DonnyChatView';
import { cn } from '@/lib/utils';

export function DonnyMobileSheet() {
  const { stage, expand, collapse, close } = useDonnyContext();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (dragStartY.current === null) return;
      const deltaY = e.changedTouches[0].clientY - dragStartY.current;
      dragStartY.current = null;

      // Drag up → expand, drag down → collapse/close
      if (deltaY < -50 && stage === 'tray') {
        expand();
      } else if (deltaY > 50) {
        if (stage === 'chat') collapse();
        else if (stage === 'tray') close();
      }
    },
    [stage, expand, collapse, close]
  );

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  if (stage === 'closed') return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 md:hidden"
        onClick={close}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          'fixed left-0 right-0 bottom-0 z-[61] md:hidden rounded-t-2xl shadow-2xl transition-all duration-300 ease-out',
          stage === 'tray' && 'h-[35vh]',
          stage === 'chat' && 'h-[calc(100vh-env(safe-area-inset-top))]'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 bg-white rounded-t-2xl">
          <div className="w-9 h-1 bg-gray-300 rounded-full" />
        </div>

        {stage === 'tray' && <DonnyTray />}
        {stage === 'chat' && <DonnyChatView />}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyMobileSheet.tsx
git commit -m "feat(donny): add DonnyMobileSheet with drag gestures and stage transitions"
```

---

## Task 15: Create DonnyDesktopPanel Container

**Files:**
- Create: `src/components/donny/DonnyDesktopPanel.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/donny/DonnyDesktopPanel.tsx`:

```typescript
import { useEffect } from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { DonnyTray } from './DonnyTray';
import { DonnyChatView } from './DonnyChatView';
import { cn } from '@/lib/utils';

export function DonnyDesktopPanel() {
  const { stage, close } = useDonnyContext();

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  if (stage === 'closed') return null;

  return (
    <div
      className={cn(
        'hidden md:flex flex-col border-l border-gray-200 bg-white transition-all duration-200 flex-shrink-0',
        stage === 'tray' && 'w-80',
        stage === 'chat' && 'w-[420px]'
      )}
    >
      {stage === 'tray' && <DonnyTray />}
      {stage === 'chat' && <DonnyChatView />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyDesktopPanel.tsx
git commit -m "feat(donny): add DonnyDesktopPanel with slim/expanded states"
```

---

## Task 16: Refactor DonnyNavButton

**Files:**
- Modify: `src/components/donny/DonnyNavButton.tsx`

- [ ] **Step 1: Rewrite DonnyNavButton to use DonnyProvider and new emblem**

Replace the contents of `src/components/donny/DonnyNavButton.tsx`:

```typescript
import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export function DonnyNavButton() {
  const { stage, open, close, unreadCount, avatarState } = useDonnyContext();

  const handleClick = () => {
    if (stage === 'closed') {
      open();
    } else {
      close();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex flex-col items-center -mt-4 min-h-[44px] min-w-[44px]"
      aria-label="Open Donny"
    >
      <span className="bg-white w-14 h-14 rounded-full shadow-lg shadow-dc-teal/30 -mt-4 flex items-center justify-center border-[3px] border-white">
        <DonnyAvatar
          size="lg"
          state={unreadCount > 0 ? 'action_needed' : avatarState}
          showBadge={unreadCount > 0}
          badgeCount={unreadCount}
          glow={unreadCount > 0}
        />
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyNavButton.tsx
git commit -m "feat(donny): refactor DonnyNavButton to use DonnyProvider and emblem"
```

---

## Task 17: Update MobileBottomNav to Use DonnyNavButton

**Files:**
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `src/lib/navConfig.ts`

- [ ] **Step 1: Update navConfig.ts — add isDonny flag to center items**

In `src/lib/navConfig.ts`, add an `isDonny` optional field to `BottomNavItem` and set it on center items:

```typescript
// Update BottomNavItem interface:
export interface BottomNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  isCenter?: boolean;
  isDonny?: boolean;
}

// Update each bottom nav array — change the center item:

// businessBottomNav center item (line 98):
{ icon: Plus, label: 'Donny', href: '#donny', isCenter: true, isDonny: true },

// creatorBottomNav center item (line 106):
{ icon: Plus, label: 'Donny', href: '#donny', isCenter: true, isDonny: true },

// brandBottomNav center item (line 114):
{ icon: Plus, label: 'Donny', href: '#donny', isCenter: true, isDonny: true },
```

- [ ] **Step 2: Update MobileBottomNav to render DonnyNavButton for center**

Replace `src/components/MobileBottomNav.tsx`:

```typescript
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import { getBottomNav } from '@/lib/navConfig';
import { DonnyNavButton } from './donny/DonnyNavButton';
import { DonnyMobileSheet } from './donny/DonnyMobileSheet';

interface MobileBottomNavProps {
  userRole: UserRole;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ userRole }) => {
  const location = useLocation();
  const items = getBottomNav(userRole);

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end justify-around px-1 pt-1 pb-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            if (item.isDonny) {
              return <DonnyNavButton key="donny-center" />;
            }

            return (
              <Link
                key={`${item.href}-${item.label}`}
                to={item.href}
                className="flex flex-col items-center gap-0.5 py-1 min-w-0 min-h-[44px] min-w-[44px]"
                aria-label={item.label}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-dc-teal font-bold' : 'text-[#888888]'}`} />
                <span
                  className={`text-[10px] leading-tight truncate ${
                    active ? 'text-dc-teal font-semibold' : 'text-[#888888]'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <DonnyMobileSheet />
    </>
  );
};

export default MobileBottomNav;
```

- [ ] **Step 3: Verify no compile errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileBottomNav.tsx src/lib/navConfig.ts
git commit -m "feat(donny): replace center nav button with DonnyNavButton"
```

---

## Task 18: Update App.tsx — Replace Providers, Add Desktop Panel

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update imports**

In `src/App.tsx`, replace the old imports (lines 8-9, 71-72):

```typescript
// Remove these imports:
// import { AIAssistantProvider } from "@/contexts/AIAssistantContext";
// import { AIChatModalProvider } from "@/contexts/AIChatModalContext";
// import { DonnyDock } from "@/components/DonnyDock";

// Add these imports:
import { DonnyProvider } from "@/contexts/DonnyProvider";
import { DonnyDesktopPanel } from "@/components/donny/DonnyDesktopPanel";
```

- [ ] **Step 2: Replace provider wrapping**

Find the provider nesting around line 496-499 and replace:

```typescript
// Before:
//   </AIChatModalProvider>
// </AIAssistantProvider>

// After — wrap with DonnyProvider instead.
// DonnyProvider needs userRole, which requires auth context.
// It must be inside AuthProvider and BrowserRouter (needs useLocation).
```

The `DonnyProvider` needs to be inside `AuthProvider` and `BrowserRouter`. Replace `AIAssistantProvider` + `AIChatModalProvider` with `DonnyProvider`. Since `DonnyProvider` needs `userRole` from `useAuth()`, create a small bridge component in `App.tsx`:

```typescript
function DonnyProviderWithAuth({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) ?? 'content_creator';
  return <DonnyProvider userRole={userRole}>{children}</DonnyProvider>;
}
```

Then use `<DonnyProviderWithAuth>` in place of the old providers in the JSX tree. It must be inside `AuthProvider` and `BrowserRouter`.

- [ ] **Step 3: Remove DonnyDock, add DonnyDesktopPanel**

Remove the `DonnyDock` ErrorBoundary block (lines 492-494). Add `DonnyDesktopPanel` as a flex sibling to the main content area so the page reflows.

This may require wrapping the routes + panel in a flex container:

```tsx
<div className="flex h-screen">
  <div className="flex-1 overflow-auto">
    <Routes>
      {/* ... all routes ... */}
    </Routes>
    <HelpBriefDrawer />
  </div>
  <DonnyDesktopPanel />
</div>
```

- [ ] **Step 4: Verify app compiles and renders**

Run: `npm run dev`

Open in browser, verify:
- Mobile: center nav shows Donny emblem, tap opens tray
- Desktop: Donny avatar appears in layout, clicking opens side panel

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(donny): wire DonnyProvider and DonnyDesktopPanel into App.tsx"
```

---

## Task 19: Add Desktop Header Trigger

**Files:**
- Modify: the header/top bar component used on desktop pages

- [ ] **Step 1: Find the desktop header component**

Search for the desktop top bar/header that contains the notification bell and profile avatar:

```bash
grep -rl "Bell\|notification" src/components/ --include="*.tsx" | head -10
grep -rl "header" src/components/ --include="*.tsx" -i | head -10
```

Common locations: `src/components/DashboardLayout.tsx`, `src/components/TopBar.tsx`, `src/components/Header.tsx`, or a layout component used by dashboard pages. If no standalone header exists, the Donny trigger may need to be added to each dashboard page's top section — in that case, create a `DonnyHeaderTrigger.tsx` component and import it in the dashboard layout.

- [ ] **Step 2: Add DonnyAvatar trigger to the header**

In the desktop header component, add the Donny avatar button next to the notification bell:

```tsx
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';
import { useDonnyContext } from '@/contexts/DonnyProvider';

// Inside the header's right-side actions:
const { stage, open, close, unreadCount, avatarState } = useDonnyContext();

<button
  onClick={() => stage === 'closed' ? open() : close()}
  className="relative"
  aria-label="Open Donny"
>
  <DonnyAvatar
    size="md"
    state={unreadCount > 0 ? 'action_needed' : avatarState}
    showBadge={unreadCount > 0}
    badgeCount={unreadCount}
    glow={unreadCount > 0}
  />
</button>
```

- [ ] **Step 3: Verify on desktop**

Run: `npm run dev`

Open in browser at desktop width (>768px). Verify Donny avatar appears in header, clicking toggles the side panel.

- [ ] **Step 4: Commit**

```bash
git add src/components/
git commit -m "feat(donny): add Donny avatar trigger to desktop header"
```

Note: Adjust the `git add` path to the specific file(s) modified.

---

## Task 20: Clean Up — Delete Old Components

**Files:**
- Delete: `src/components/DonnyDock.tsx`
- Delete: `src/components/donny/DonnyAskBar.tsx`
- Delete: `src/components/donny/DonnyChatSheet.tsx`
- Delete: `src/components/donny/DonnyCard.tsx`
- Delete: `src/components/dashboard/DonnyAIBar.tsx`
- Delete: `src/features/promotions/components/DonnyCampaignCTA.tsx`
- Delete: `src/contexts/AIAssistantContext.tsx`
- Delete: `src/contexts/AIChatModalContext.tsx`

- [ ] **Step 1: Find and remove all imports of deleted components**

Search for imports of each deleted component across the codebase:

```bash
grep -rl "DonnyDock\|DonnyAskBar\|DonnyChatSheet\|DonnyCard\|DonnyAIBar\|DonnyCampaignCTA\|AIAssistantProvider\|AIChatModalProvider\|useAIAssistant\|useAIChatModal\|donny-open-chat" src/ --include="*.tsx" --include="*.ts"
```

Remove all imports and usages of these components from the files that reference them. For dashboard pages that used `DonnyAIBar`, simply remove the component — Donny is now accessed globally via the nav button.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/DonnyDock.tsx
rm src/components/donny/DonnyAskBar.tsx
rm src/components/donny/DonnyChatSheet.tsx
rm src/components/donny/DonnyCard.tsx
rm src/components/dashboard/DonnyAIBar.tsx
rm src/features/promotions/components/DonnyCampaignCTA.tsx
rm src/contexts/AIAssistantContext.tsx
rm src/contexts/AIChatModalContext.tsx
```

- [ ] **Step 3: Remove donny-open-chat custom event listeners**

Search for any remaining `donny-open-chat` event dispatchers and remove them:

```bash
grep -rn "donny-open-chat" src/ --include="*.tsx" --include="*.ts"
```

- [ ] **Step 4: Verify clean compile**

Run: `npx tsc --noEmit`

Fix any remaining import errors.

- [ ] **Step 5: Verify app runs**

Run: `npm run dev`

Test:
- Mobile: all pages load, center nav shows Donny, tray opens/closes, chat expands
- Desktop: side panel opens/closes, pages reflow correctly
- No console errors related to deleted components

- [ ] **Step 6: Commit**

Stage only the specific deleted and modified files — avoid `git add -A` which could include untracked files:

```bash
git add src/components/DonnyDock.tsx src/components/donny/DonnyAskBar.tsx src/components/donny/DonnyChatSheet.tsx src/components/donny/DonnyCard.tsx src/components/dashboard/DonnyAIBar.tsx src/features/promotions/components/DonnyCampaignCTA.tsx src/contexts/AIAssistantContext.tsx src/contexts/AIChatModalContext.tsx
git add -u  # stages all modifications to tracked files
git commit -m "refactor(donny): remove legacy DonnyDock, DonnyAIBar, DonnyChatSheet, and old contexts

Replaced by unified DonnyProvider, DonnyNavButton, DonnyTray, and DonnyChatView."
```

---

## Task 21: Smoke Test Full Flow

**Files:** None (testing only)

- [ ] **Step 1: Test mobile flow**

Run `npm run dev` and open in mobile viewport (375px width):

1. Verify Donny emblem shows in center nav position
2. Tap Donny → tray slides up (~35% height)
3. Verify nudge cards display (if any exist in DB)
4. Verify quick chips show and are page-appropriate
5. Tap a quick chip → tray expands to full chat, message sent
6. Drag down from chat → collapses to tray
7. Drag down from tray → dismisses
8. Navigate to different page → reopen, verify chips changed

- [ ] **Step 2: Test desktop flow**

Open at desktop width (>768px):

1. Verify Donny avatar in header with badge
2. Click → slim panel (320px) opens on right, page reflows
3. Click input or chip → panel expands to 420px
4. Collapse button → back to slim
5. Close button or Escape → panel closes, page returns to full width
6. Navigate between pages → verify panel persists and chips update

- [ ] **Step 3: Test edge cases**

1. Open Donny, send a message, verify response streams correctly
2. Open Donny, verify existing conversation history loads
3. Resize browser between mobile/desktop → verify correct container renders
4. Open Donny on auth pages → verify it's hidden (check route guards)

- [ ] **Step 4: Document any issues found**

If issues are found, create follow-up tasks before marking this complete.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(donny): address smoke test issues"
```
