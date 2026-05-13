# Location Sub-Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Add Location" bug, scope all remaining features (conversations, analytics, file uploads, Dragon Feed) to locations, and build a rich location identity UX with guided onboarding.

**Architecture:** Seven independent layers, each shippable on its own. Database changes are additive (nullable columns, `IF NOT EXISTS`). Triggers use `SECURITY DEFINER` to auto-populate `org_unit_id`. Frontend filters by `activeOrgUnit?.id` when set, showing all data when NULL ("All Locations" mode).

**Tech Stack:** React + TypeScript, Supabase (Postgres, RLS, Edge Functions), React Query (TanStack Query), Tailwind CSS, shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-05-13-location-sub-accounts-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260514000001_fix_org_unit_create.sql` | (empty — migration is already written, just needs applying) |
| `supabase/migrations/20260514000002_conversations_org_unit.sql` | Add `org_unit_id` to `conversations`, trigger, RPC update |
| `supabase/migrations/20260514000003_analytics_org_unit.sql` | Add `org_unit_id` to `analytics_events` |
| `supabase/migrations/20260514000004_file_uploads_org_unit.sql` | Add `org_unit_id` to `file_uploads`, trigger |
| `src/components/org/LocationBadge.tsx` | Context badge pill showing active location name |
| `src/components/org/LocationEmptyState.tsx` | Location-aware empty state wrapper using DCEmptyState |
| `src/hooks/useLocationCampaignCounts.ts` | Lightweight aggregate query for switcher stats |

### Modified Files
| File | What Changes |
|------|-------------|
| `src/hooks/useOrgData.ts:179-208` | Conditional payload in `useCreateOrgUnit` mutationFn |
| `src/components/org/AddEditUnitModal.tsx:129-135` | Surface real Supabase error, auto-switch location on create |
| `src/hooks/useConversations.ts:19-44` | Accept `orgUnitId`, pass to RPC |
| `src/hooks/useConversations.ts:46-82` | Pass `org_unit_id` to `create_or_get_direct_conversation` RPC |
| `src/hooks/useConversations.ts:109-170` | Add `org_unit_id` to campaign conversation insert |
| `src/hooks/useUnreadCounts.ts:32-41` | Ensure `useTotalUnreadCount` always uses unfiltered conversations |
| `src/hooks/useAnalyticsBatch.ts:9-15` | Add `org_unit_id` to `AnalyticsBatchEvent` interface |
| `src/hooks/useAnalyticsBatch.ts:36-42` | Include `org_unit_id` in insert payload |
| `src/hooks/useAnalyticsBatch.ts:72-93` | Accept `org_unit_id` in `addEvent` |
| `src/hooks/useAnalyticsBatch.ts:116-135` | Include `org_unit_id` in sendBeacon payload |
| `src/hooks/useOptimizedAnalytics.ts` | Thread `org_unit_id` through all track* functions |
| `src/hooks/useBusinessActivity.ts` | Refactor from effect-based to parameterized; accept `orgUnitId` |
| `src/hooks/useInspirationStrip.ts` | Accept optional `orgUnitId` filter |
| `src/components/org/OrgUnitSwitcher.tsx` | Rich cards dropdown with avatars, stats, status badges |
| `src/pages/BusinessDashboard.tsx` | Location badge, location-aware empty state |
| `src/pages/CampaignsPage.tsx` | Location badge, location-aware empty state |
| `src/pages/DirectMessagesPage.tsx` | Pass `orgUnitId` to conversations hook |

---

## Task 1: Bug Fix — Add Location Error

**Files:**
- Modify: `src/hooks/useOrgData.ts:179-208`
- Modify: `src/components/org/AddEditUnitModal.tsx:78-136`

- [ ] **Step 1: Verify pending migration exists and is correct**

Read `supabase/migrations/20260513100000_org_unit_profile_fields.sql` and confirm it adds all profile columns to `org_units`. This migration needs to be applied to production Supabase. Run it via the Supabase dashboard or CLI:

```bash
# If using Supabase CLI locally:
npx supabase db push
```

If the migration was already applied and the error persists, the issue is solely in the mutation payload (Step 2).

- [ ] **Step 2: Refactor useCreateOrgUnit to conditionally include profile fields**

In `src/hooks/useOrgData.ts`, replace the `mutationFn` inside `useCreateOrgUnit` (lines 179-208). The current code unconditionally sends all fields with fallback defaults. The fix: build a base payload with only core fields, then merge optional profile fields only when explicitly provided.

```typescript
mutationFn: async (input: CreateOrgUnitInput) => {
  if (!orgId) throw new Error('orgId is required');

  const payload: Partial<CreateOrgUnitInput> & { org_id: string } = {
    org_id: orgId,
    unit_type: input.unit_type,
    name: input.name,
    is_primary: input.is_primary ?? false,
    address: input.address ?? null,
    website_url: input.website_url ?? null,
  };

  const optionalKeys: (keyof CreateOrgUnitInput)[] = [
    'description', 'brand_category', 'logo_url', 'sample_content_urls',
    'show_parent_brand', 'instagram_url', 'tiktok_url', 'youtube_url',
    'facebook_url', 'linkedin_url', 'x_url', 'other_social_url',
  ];

  for (const key of optionalKeys) {
    if (input[key] !== undefined) {
      (payload as any)[key] = input[key];
    }
  }

  const { data, error } = await supabase
    .from('org_units')
    .insert(payload)
    .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, stripe_account_id, stripe_onboarding_complete, pending_balance, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
    .single();

  if (error) throw error;
  return data as unknown as OrgUnit;
},
```

- [ ] **Step 3: Improve error toast in AddEditUnitModal**

In `src/components/org/AddEditUnitModal.tsx`, replace the catch block (lines 129-135):

```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  toast({
    title: 'Failed to save location',
    description: message,
    variant: 'destructive',
  });
}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors. Then test manually: log in as a restaurant user, open Locations page, click "+ Add", fill in name + address, click Save. Should succeed without error toast.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOrgData.ts src/components/org/AddEditUnitModal.tsx
git commit -m "fix: conditional payload in useCreateOrgUnit, surface real error messages"
```

---

## Task 2: Location-Scoped Conversations — Migration

**Files:**
- Create: `supabase/migrations/20260514000002_conversations_org_unit.sql`

- [ ] **Step 1: Write the migration**

This migration does three things: adds the column + index, creates the auto-populate trigger, and recreates the `get_user_conversations` RPC with a location filter parameter. Also updates `create_or_get_direct_conversation` to accept `p_org_unit_id`.

```sql
-- 1. Add org_unit_id column to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_org_unit_id
  ON conversations(org_unit_id);

-- 2. Auto-populate trigger
CREATE OR REPLACE FUNCTION trg_conversations_auto_org_unit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_caller  uuid;
BEGIN
  -- If org_unit_id was explicitly set, keep it
  IF NEW.org_unit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to inherit from campaign
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT org_unit_id INTO v_unit_id
      FROM campaigns
     WHERE id = NEW.campaign_id;
    IF v_unit_id IS NOT NULL THEN
      NEW.org_unit_id := v_unit_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Fallback: caller's active org unit
  v_caller := auth.uid();
  IF v_caller IS NOT NULL THEN
    SELECT active_org_unit_id INTO v_unit_id
      FROM profiles
     WHERE id = v_caller;
    NEW.org_unit_id := v_unit_id;  -- may still be NULL
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_auto_org_unit
  BEFORE INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION trg_conversations_auto_org_unit_fn();

-- 3. Recreate get_user_conversations with optional location filter
-- IMPORTANT: Preserves BOTH existing UNION ALL branches exactly. Only adds p_org_unit_id filter.
DROP FUNCTION IF EXISTS get_user_conversations(uuid);

CREATE OR REPLACE FUNCTION public.get_user_conversations(
  user_uuid uuid,
  p_org_unit_id uuid DEFAULT NULL
)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text, campaign_id uuid, campaign_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  -- Branch 1: Direct conversations (from conversations table)
  SELECT 
    c.id as conversation_id,
    c.type as conversation_type,
    c.title as conversation_title,
    c.last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m 
       WHERE m.conversation_id = c.id 
       AND m.recipient_id = user_uuid 
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE WHEN c.type = 'direct' THEN
      (SELECT COALESCE(p.full_name, p.email, 'Unknown User')
       FROM public.conversation_participants cp2
       JOIN public.profiles p ON p.id = cp2.user_id
       WHERE cp2.conversation_id = c.id 
       AND cp2.user_id != user_uuid 
       AND cp2.left_at IS NULL
       LIMIT 1)
    ELSE c.title
    END as other_participant_name,
    CASE WHEN c.type = 'direct' THEN
      (SELECT p.avatar_url 
       FROM public.conversation_participants cp2
       JOIN public.profiles p ON p.id = cp2.user_id
       WHERE cp2.conversation_id = c.id 
       AND cp2.user_id != user_uuid 
       AND cp2.left_at IS NULL
       LIMIT 1)
    ELSE NULL
    END as other_participant_avatar,
    NULL::uuid as campaign_id,
    NULL::text as campaign_status
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = user_uuid 
  AND cp.left_at IS NULL
  AND c.is_archived = false
  AND (p_org_unit_id IS NULL OR c.org_unit_id = p_org_unit_id)

  UNION ALL

  -- Branch 2: Campaign conversations (from campaigns table, using messages)
  SELECT 
    NULL::uuid as conversation_id,
    'campaign'::text as conversation_type,
    CONCAT('Campaign: ', camp.title) as conversation_title,
    (SELECT MAX(m.created_at) FROM public.messages m 
     WHERE m.campaign_id = camp.id 
     AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)) as last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m 
       WHERE m.campaign_id = camp.id 
       AND m.recipient_id = user_uuid 
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE 
      WHEN camp.user_id = user_uuid THEN
        (SELECT COALESCE(cp2.creator_name, p.full_name, p.email, 'Creator')
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        (SELECT COALESCE(bp.business_name, p.full_name, p.email, 'Business Client')
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_name,
    CASE 
      WHEN camp.user_id = user_uuid THEN
        (SELECT COALESCE(cp2.avatar_url, p.avatar_url)
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        (SELECT COALESCE(bp.logo_url, p.avatar_url)
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_avatar,
    camp.id as campaign_id,
    camp.status::text as campaign_status
  FROM public.campaigns camp
  WHERE EXISTS (
    SELECT 1 FROM public.messages m 
    WHERE m.campaign_id = camp.id 
    AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)
  )
  AND (
    camp.user_id = user_uuid OR 
    EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc 
      WHERE cc.campaign_id = camp.id 
      AND cc.creator_id = user_uuid
    )
  )
  AND (p_org_unit_id IS NULL OR camp.org_unit_id = p_org_unit_id)

  ORDER BY last_message_at DESC NULLS LAST;
END;
$function$;

-- 4. Update create_or_get_direct_conversation to accept org_unit_id
DROP FUNCTION IF EXISTS create_or_get_direct_conversation(uuid, uuid);

CREATE OR REPLACE FUNCTION create_or_get_direct_conversation(
  user1_uuid uuid,
  user2_uuid uuid,
  p_org_unit_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Check for existing direct conversation between these two users
  SELECT c.id INTO v_conversation_id
  FROM conversations c
  WHERE c.type = 'direct'
    AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = user1_uuid)
    AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = user2_uuid)
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation with org_unit_id
  INSERT INTO conversations (type, org_unit_id)
  VALUES ('direct', p_org_unit_id)
  RETURNING id INTO v_conversation_id;

  -- Add both participants
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES
    (v_conversation_id, user1_uuid),
    (v_conversation_id, user2_uuid);

  RETURN v_conversation_id;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514000002_conversations_org_unit.sql
git commit -m "feat: add org_unit_id to conversations with trigger and RPC update"
```

---

## Task 3: Location-Scoped Conversations — Frontend

**Files:**
- Modify: `src/hooks/useConversations.ts:19-82, 109-170`
- Modify: `src/hooks/useUnreadCounts.ts:32-41`
- Modify: `src/pages/DirectMessagesPage.tsx`
- Modify: `src/components/messages/DirectMessagesList.tsx:26` (also calls `useConversations()` independently)
- Modify: `src/pages/DirectConversationPage.tsx:17` (also calls `useConversations()` independently)

- [ ] **Step 1: Update useConversations to accept orgUnitId**

In `src/hooks/useConversations.ts`, change the `useConversations` hook (lines 19-44):

```typescript
export const useConversations = (orgUnitId?: string | null) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['conversations', user?.id, orgUnitId ?? 'all'],
    queryFn: async () => {
      if (!user) return [];
      
      const params: { user_uuid: string; p_org_unit_id?: string } = {
        user_uuid: user.id,
      };
      if (orgUnitId) {
        params.p_org_unit_id = orgUnitId;
      }

      const { data, error } = await supabase.rpc('get_user_conversations', params);

      if (error) {
        console.error('Error fetching conversations:', error);
        throw error;
      }
      
      return data as Conversation[];
    },
    enabled: !!user,
    staleTime: 120_000,
    refetchOnWindowFocus: 'always',
  });

  return query;
};
```

- [ ] **Step 2: Update useCreateDirectConversation to pass org_unit_id**

In the same file, update `useCreateDirectConversation` (lines 46-82) — the RPC call at lines 54-57:

```typescript
export const useCreateDirectConversation = () => {
  const { user, activeOrgUnit } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user) throw new Error('User not authenticated');
      
      const params: { user1_uuid: string; user2_uuid: string; p_org_unit_id?: string } = {
        user1_uuid: user.id,
        user2_uuid: otherUserId,
      };
      if (activeOrgUnit?.id) {
        params.p_org_unit_id = activeOrgUnit.id;
      }

      const { data, error } = await supabase.rpc('create_or_get_direct_conversation', params);

      if (error) {
        console.error('Error creating conversation:', error);
        throw error;
      }

      return data;
    },
    // ...onSuccess and onError unchanged
  });
};
```

- [ ] **Step 3: Update useCreateCampaignConversation to include org_unit_id**

In the same file, in `useCreateCampaignConversation` (lines 126-134), the trigger handles this automatically via the `campaign_id`, but we can also be explicit. No code change required here — the trigger will auto-populate from the campaign's `org_unit_id`.

- [ ] **Step 4: Ensure useTotalUnreadCount stays unfiltered**

In `src/hooks/useUnreadCounts.ts`, `useTotalUnreadCount` currently calls `useConversations()` with no args (line 33). This already passes no `orgUnitId`, so it fetches ALL conversations unfiltered. This is the correct behavior for the bottom nav badge — no change needed, but add a comment:

```typescript
export const useTotalUnreadCount = () => {
  // Always unfiltered — nav badge shows total across all locations
  const { data: conversations } = useConversations();

  const total = conversations?.reduce(
    (sum, conv) => sum + (conv.unread_count ?? 0),
    0
  ) ?? 0;

  return Math.min(total, 99);
};
```

- [ ] **Step 5: Pass orgUnitId in DirectMessagesPage**

In `src/pages/DirectMessagesPage.tsx`, import `useAuth` and pass `activeOrgUnit?.id` to `useConversations`:

```typescript
const { activeOrgUnit } = useAuth();
const { data: conversations, isLoading } = useConversations(activeOrgUnit?.id);
```

- [ ] **Step 5b: Update DirectMessagesList.tsx**

`src/components/messages/DirectMessagesList.tsx` line 26 also calls `useConversations()` independently (not via props). Update it to accept and forward `orgUnitId`:

```typescript
// If this component receives conversations as props, just pass orgUnitId through.
// If it calls useConversations() directly:
const { activeOrgUnit } = useAuth();
const { data: conversations = [], isLoading } = useConversations(activeOrgUnit?.id);
```

- [ ] **Step 5c: Update DirectConversationPage.tsx**

`src/pages/DirectConversationPage.tsx` line 17 also calls `useConversations()`. Update it the same way:

```typescript
const { activeOrgUnit } = useAuth();
const { data: conversations = [] } = useConversations(activeOrgUnit?.id);
```

- [ ] **Step 6: Build and verify**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useConversations.ts src/hooks/useUnreadCounts.ts src/pages/DirectMessagesPage.tsx src/components/messages/DirectMessagesList.tsx src/pages/DirectConversationPage.tsx
git commit -m "feat: location-scoped conversations with org_unit_id filtering"
```

---

## Task 4: Location-Scoped Analytics — Migration + Frontend

**Files:**
- Create: `supabase/migrations/20260514000003_analytics_org_unit.sql`
- Modify: `src/hooks/useAnalyticsBatch.ts:9-15, 36-42, 72-93, 116-135`
- Modify: `src/hooks/useOptimizedAnalytics.ts`
- Modify: `src/hooks/useAnalytics.ts:21-39` (legacy direct-insert path)

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_org_unit_id
  ON analytics_events(org_unit_id);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Add org_unit_id to AnalyticsBatchEvent interface**

In `src/hooks/useAnalyticsBatch.ts`, update the interface (lines 9-15):

```typescript
interface AnalyticsBatchEvent {
  event_type: string;
  event_data?: Record<string, any>;
  user_id?: string;
  page_url?: string;
  user_agent?: string;
  org_unit_id?: string | null;
}
```

- [ ] **Step 4: Include org_unit_id in flushBatch insert payload**

In the same file, update the `insertData` mapping inside `flushBatch` (lines 36-42):

```typescript
const insertData: AnalyticsEventInsert[] = eventsToSend.map(event => ({
  event_type: event.event_type,
  event_data: event.event_data || {},
  user_id: event.user_id || null,
  page_url: event.page_url || null,
  user_agent: event.user_agent || null,
  org_unit_id: event.org_unit_id || null,
}));
```

- [ ] **Step 5: Accept org_unit_id in addEvent**

Update `addEvent` (lines 72-93) to accept and store `org_unit_id`:

```typescript
const addEvent = useCallback((eventType: string, eventData?: Record<string, any>, orgUnitId?: string | null) => {
  const event: AnalyticsBatchEvent = {
    event_type: eventType,
    event_data: eventData || {},
    user_id: user?.id,
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    org_unit_id: orgUnitId ?? null,
  };

  batchQueue.current.push(event);

  if (batchQueue.current.length >= BATCH_SIZE) {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushBatch();
  } else {
    scheduleFlush();
  }
}, [user?.id, flushBatch, scheduleFlush]);
```

- [ ] **Step 6: Include org_unit_id in sendBeacon payload**

The `sendBeacon` path (lines 116-135) sends raw `AnalyticsBatchEvent` objects which now include `org_unit_id`. The Supabase REST endpoint will accept the field since the column exists. No additional change needed beyond the interface update — the `batchQueue.current` already contains the full event objects.

- [ ] **Step 7: Thread org_unit_id through useOptimizedAnalytics**

In `src/hooks/useOptimizedAnalytics.ts`, destructure `activeOrgUnit` from `useAuth()` and pass `activeOrgUnit?.id` as the third argument to every `addEvent` call. All four track functions must be updated:

```typescript
import { useAuth } from '@/hooks/useAuth';

// Inside the hook:
const { activeOrgUnit } = useAuth();

const trackEventOptimized = useCallback((eventType: string, eventData?: Record<string, any>) => {
  addEvent(eventType, eventData, activeOrgUnit?.id);
}, [addEvent, activeOrgUnit?.id]);

const trackPageViewOptimized = useCallback((pageUrl: string, eventData?: Record<string, any>) => {
  addEvent('page_view', { ...eventData, page_url: pageUrl }, activeOrgUnit?.id);
}, [addEvent, activeOrgUnit?.id]);

const trackUserActionOptimized = useCallback((action: string, eventData?: Record<string, any>) => {
  addEvent('user_action', { ...eventData, action }, activeOrgUnit?.id);
}, [addEvent, activeOrgUnit?.id]);

const trackCampaignEventOptimized = useCallback((campaignId: string, action: string, eventData?: Record<string, any>) => {
  addEvent('campaign_event', { ...eventData, campaign_id: campaignId, action }, activeOrgUnit?.id);
}, [addEvent, activeOrgUnit?.id]);
```

- [ ] **Step 7b: Update legacy trackEvent in useAnalytics.ts**

`src/hooks/useAnalytics.ts` has a legacy `trackEvent` function (lines 21-39) that inserts directly to `analytics_events` via `supabase.from('analytics_events').insert(...)`, bypassing the batch pipeline. Add `org_unit_id` to this path too:

```typescript
const { activeOrgUnit } = useAuth();

// Inside trackEvent, add to the analyticsEvent object:
const analyticsEvent = {
  event_type: eventType,
  event_data: eventData || {},
  user_id: user?.id || null,
  page_url: window.location.href,
  user_agent: navigator.userAgent,
  org_unit_id: activeOrgUnit?.id ?? null,
};
```

- [ ] **Step 8: Build and verify**

```bash
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260514000003_analytics_org_unit.sql src/hooks/useAnalyticsBatch.ts src/hooks/useOptimizedAnalytics.ts src/hooks/useAnalytics.ts
git commit -m "feat: location-scoped analytics events with org_unit_id"
```

---

## Task 5: Location-Scoped File Uploads — Migration

**Files:**
- Create: `supabase/migrations/20260514000004_file_uploads_org_unit.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE file_uploads
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_file_uploads_org_unit_id
  ON file_uploads(org_unit_id);

-- Auto-populate trigger: inherit from campaign or caller's active unit
CREATE OR REPLACE FUNCTION trg_file_uploads_auto_org_unit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_caller  uuid;
BEGIN
  IF NEW.org_unit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    SELECT org_unit_id INTO v_unit_id
      FROM campaigns
     WHERE id = NEW.campaign_id;
    IF v_unit_id IS NOT NULL THEN
      NEW.org_unit_id := v_unit_id;
      RETURN NEW;
    END IF;
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL THEN
    SELECT active_org_unit_id INTO v_unit_id
      FROM profiles
     WHERE id = v_caller;
    NEW.org_unit_id := v_unit_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_file_uploads_auto_org_unit
  BEFORE INSERT ON file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION trg_file_uploads_auto_org_unit_fn();
```

- [ ] **Step 2: Apply and commit**

```bash
npx supabase db push
git add supabase/migrations/20260514000004_file_uploads_org_unit.sql
git commit -m "feat: add org_unit_id to file_uploads with auto-populate trigger"
```

---

## Task 6: Location-Scoped Dragon Feed — Hook Refactors

**Files:**
- Modify: `src/hooks/useBusinessActivity.ts` (full refactor)
- Modify: `src/hooks/useInspirationStrip.ts`

- [ ] **Step 1: Refactor useBusinessActivity from effect-based to parameterized**

`src/hooks/useBusinessActivity.ts` (114 lines) currently uses `useState` + `useEffect` internally and takes no arguments. It queries `analytics_events` where `event_type = 'dragon_feed_like'`, then fetches `creator_profiles` for the liked content.

Refactor to accept `orgUnitId` and add a conditional filter. The simplest approach: keep the existing effect-based structure but add the parameter and filter:

```typescript
export function useBusinessActivity(orgUnitId?: string | null) {
  const { user } = useAuth();
  // ...existing state...

  useEffect(() => {
    async function fetchActivity() {
      // Existing query builder:
      let query = supabase
        .from('analytics_events')
        .select('*')
        .eq('event_type', 'dragon_feed_like')
        .eq('user_id', user.id);

      // Add location filter when set
      if (orgUnitId) {
        query = query.eq('org_unit_id', orgUnitId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      // ...rest of existing logic...
    }
    fetchActivity();
  }, [user?.id, orgUnitId]); // Add orgUnitId to dependency array
```

Also find callers: `useBusinessActivity()` is called in `src/pages/BusinessDashboard.tsx` and potentially `src/components/first-run/` components. Update each to pass `activeOrgUnit?.id`.

- [ ] **Step 2: Add orgUnitId filter to useInspirationStrip**

In `src/hooks/useInspirationStrip.ts`, add an optional `orgUnitId` parameter and filter the `analytics_events` query when set:

```typescript
export function useInspirationStrip(orgUnitId?: string | null) {
  // Existing query logic, add conditional filter:
  // if (orgUnitId) query = query.eq('org_unit_id', orgUnitId);
}
```

- [ ] **Step 3: Update callers to pass activeOrgUnit?.id**

Find all callers of `useBusinessActivity()` and `useInspirationStrip()` and pass `activeOrgUnit?.id`. These are typically in `BusinessDashboard.tsx` and campaign creator components.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBusinessActivity.ts src/hooks/useInspirationStrip.ts
git commit -m "feat: location-scoped Dragon Feed hooks with orgUnitId filter"
```

---

## Task 7: Rich Location Identity — Switcher Upgrade

**Files:**
- Modify: `src/components/org/OrgUnitSwitcher.tsx` (full rewrite of dropdown content)
- Create: `src/hooks/useLocationCampaignCounts.ts`

- [ ] **Step 1: Create useLocationCampaignCounts hook**

Lightweight aggregate query returning `{ org_unit_id, count }` for the switcher stats line:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface LocationCampaignCount {
  org_unit_id: string;
  count: number;
}

export function useLocationCampaignCounts(orgId?: string | null) {
  return useQuery({
    queryKey: ['location-campaign-counts', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('org_unit_id')
        .eq('org_id', orgId!)
        .in('status', ['active', 'in_progress']);

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.org_unit_id) {
          counts.set(row.org_unit_id, (counts.get(row.org_unit_id) ?? 0) + 1);
        }
      }

      return Array.from(counts.entries()).map(([org_unit_id, count]) => ({
        org_unit_id,
        count,
      })) as LocationCampaignCount[];
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });
}
```

- [ ] **Step 2: Upgrade OrgUnitSwitcher trigger button**

In `src/components/org/OrgUnitSwitcher.tsx`, replace the `PopoverTrigger` button (lines 98-114) to show a branded pill with location avatar:

```tsx
<PopoverTrigger asChild>
  <Button
    variant="outline"
    size="sm"
    data-tour="org-switcher"
    className="rounded-full border-2 border-teal-300 bg-white text-teal-700 hover:bg-teal-50 flex items-center gap-2 px-2 py-1.5 h-auto"
  >
    {activeOrgUnit ? (
      <UnitAvatar unit={activeOrgUnit} />
    ) : (
      <Globe className="w-5 h-5 text-teal-500 shrink-0" />
    )}
    <span className="text-sm font-semibold max-w-[120px] truncate">
      {activeOrgUnit?.name ?? (isRestaurant ? 'All Locations' : 'All Products')}
    </span>
    {units.length > 1 && <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
  </Button>
</PopoverTrigger>
```

- [ ] **Step 3: Upgrade dropdown to rich cards**

Replace the `PopoverContent` internals (lines 117-174) to show rich cards with stats and status badges. Import `useLocationCampaignCounts` and `useLocationSocialAccounts` (from `src/hooks/outstand/useLocationSocialAccounts.ts`).

Each location card shows:
- Circular avatar (logo or initials) — already handled by `UnitAvatar`
- Location name (bold)
- Stats line: "[N] campaigns" or "Setup needed"
- Status badge: "Ready" (green) or "Setup" (amber)

Status logic:
- Ready: `unit.stripe_onboarding_complete === true` AND location has connected social accounts
- Setup: otherwise

For the social account check, query `business_outstand_accounts` filtered by `org_unit_id` — but to avoid N+1 queries, do a single batch query for all unit IDs. The simplest approach: create an inline helper or a small hook that fetches counts grouped by `org_unit_id`.

- [ ] **Step 4: Single-location simplification**

If `units.length === 1`: hide the "All Locations" row, hide the ChevronDown on the trigger, and don't render the popover at all — just show the location name in the pill.

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Test: log in as a restaurant user with multiple locations. The switcher should show rich cards. With one location, the dropdown should be hidden.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useLocationCampaignCounts.ts src/components/org/OrgUnitSwitcher.tsx
git commit -m "feat: rich location identity switcher with stats and status badges"
```

---

## Task 8: Rich Location Identity — Context Badge

**Files:**
- Create: `src/components/org/LocationBadge.tsx`
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: `src/pages/CampaignsPage.tsx`
- Modify: `src/pages/DirectMessagesPage.tsx`

- [ ] **Step 1: Create LocationBadge component**

```tsx
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';

export function LocationBadge() {
  const { activeOrg, activeOrgUnit } = useAuth();
  const { data: units = [] } = useOrgUnits(activeOrg?.id);

  if (!activeOrgUnit || units.length <= 1) return null;

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
      {activeOrgUnit.name}
    </span>
  );
}
```

- [ ] **Step 2: Add LocationBadge to page titles**

In each page component (`BusinessDashboard.tsx`, `CampaignsPage.tsx`, `DirectMessagesPage.tsx`), add `<LocationBadge />` next to the page heading:

```tsx
import { LocationBadge } from '@/components/org/LocationBadge';

// In the JSX, next to the page title:
<div className="flex items-center gap-2">
  <h1 className="text-xl font-bold">Dashboard</h1>
  <LocationBadge />
</div>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Test: with multiple locations, switching to a specific location should show the badge. "All Locations" or single-location orgs should not show it.

- [ ] **Step 4: Commit**

```bash
git add src/components/org/LocationBadge.tsx src/pages/BusinessDashboard.tsx src/pages/CampaignsPage.tsx src/pages/DirectMessagesPage.tsx
git commit -m "feat: location context badge on page titles"
```

---

## Task 9: Post-Creation Onboarding & Empty States

**Files:**
- Create: `src/components/org/LocationEmptyState.tsx`
- Modify: `src/components/org/AddEditUnitModal.tsx:78-136`
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: `src/pages/CampaignsPage.tsx`

- [ ] **Step 1: Auto-switch to new location after creation**

In `src/components/org/AddEditUnitModal.tsx`, after the successful create (inside the `try` block, after `createUnit.mutateAsync`), switch to the new location and navigate to settings:

```typescript
const newUnit = await createUnit.mutateAsync({
  name,
  unit_type: unitType,
  is_primary: form.isPrimary,
  ...fieldPayload,
  ...cloneFields,
});

// Auto-switch to the new location
await switchOrgUnit(newUnit.id);

toast({
  title: 'Location created',
  description: `"${name}" is now active. Complete your setup in Settings.`,
});
onOpenChange(false);

// Navigate to settings for the new location
navigate('/dashboard/business/settings');
```

This requires destructuring `switchOrgUnit` from `useAuth()` (it's exported directly from `AuthContext`, NOT from `useUpdateActiveUnit`) and importing `useNavigate` from react-router-dom. At the top of the component add:

```typescript
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Inside the component:
const { switchOrgUnit } = useAuth();
const navigate = useNavigate();
```

- [ ] **Step 2: Create LocationEmptyState component**

A wrapper around `DCEmptyState` that interpolates the active location name:

```tsx
import { useAuth } from '@/hooks/useAuth';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import type { LucideIcon } from 'lucide-react';

interface LocationEmptyStateProps {
  icon: LucideIcon;
  titleTemplate: string;
  subtitle?: string;
  cta?: { label: string; to?: string; onClick?: () => void };
}

export function LocationEmptyState({ icon, titleTemplate, subtitle, cta }: LocationEmptyStateProps) {
  const { activeOrgUnit } = useAuth();
  const locationName = activeOrgUnit?.name ?? 'your location';
  const title = titleTemplate.replace('[Location]', locationName);

  return <DCEmptyState icon={icon} title={title} subtitle={subtitle} cta={cta} />;
}
```

- [ ] **Step 3: Use LocationEmptyState in BusinessDashboard and CampaignsPage**

Replace generic empty states with location-aware ones:

In `BusinessDashboard.tsx`:
```tsx
<LocationEmptyState
  icon={Megaphone}
  titleTemplate="[Location] is ready for its first campaign"
  cta={{ label: 'Create Campaign', to: '/dashboard/business/campaigns/new' }}
/>
```

In `CampaignsPage.tsx`:
```tsx
<LocationEmptyState
  icon={Megaphone}
  titleTemplate="No campaigns yet for [Location]"
  cta={{ label: 'Launch a Campaign', to: '/dashboard/business/campaigns/new' }}
/>
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Test: create a new location → should auto-switch and redirect to settings. Navigate to dashboard with no campaigns → should show location-specific empty state.

- [ ] **Step 5: Commit**

```bash
git add src/components/org/LocationEmptyState.tsx src/components/org/AddEditUnitModal.tsx src/pages/BusinessDashboard.tsx src/pages/CampaignsPage.tsx
git commit -m "feat: post-creation onboarding flow and location-aware empty states"
```

---

## Task 10: Regenerate Supabase Types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (auto-generated)

- [ ] **Step 1: Regenerate types**

After all migrations are applied:

```bash
npx supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Fix any type errors that surface from the new columns.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate Supabase types after location sub-account migrations"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] Create a new location as a restaurant user — no error, auto-switches to new location, redirects to settings
- [ ] Complete location profile (logo, description, social, Stripe) — completion bar reaches 100%
- [ ] Switch between locations — all pages show filtered data, badge updates
- [ ] "All Locations" mode — shows aggregated data across all locations
- [ ] Single-location org — no badge, no "All Locations" row, clean switcher
- [ ] Create a campaign for a location — campaign shows under that location only
- [ ] Start a conversation from a campaign — conversation inherits location
- [ ] Analytics events record org_unit_id — check Supabase table directly
- [ ] Bottom nav unread badge — always shows total across all locations
- [ ] Messages page — filters by active location
