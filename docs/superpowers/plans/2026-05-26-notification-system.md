# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full notification system with server-side persistence, real-time delivery, a dedicated notification center page, redesigned bell dropdown, per-category preference matrix, and 38 notification event types across 5 categories for all three user roles.

**Architecture:** Edge Function Hub — a single `create-notification` edge function that all event sources call. It persists to `push_notifications`, checks user preferences, and routes to email (Resend) and future SMS (Twilio). Clients subscribe to `push_notifications` via Supabase Realtime. A separate `useRealtimeRefresh` hook subscribes to business tables for dashboard auto-refresh.

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres, Edge Functions, Realtime, RLS), React Query, Tailwind CSS + shadcn/ui, Framer Motion, Deno (edge functions), Resend (email)

**Spec:** `docs/superpowers/specs/2026-05-26-notification-system-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260526100000_notification_system_schema.sql` | Schema migration: add columns, indexes, RLS, Realtime publication |
| `supabase/functions/create-notification/index.ts` | Edge Function Hub: persist, check prefs, route to email |
| `src/types/notifications.ts` | Shared TypeScript types for notification system |
| `src/hooks/useNotificationQueries.ts` | React Query hooks for fetching/mutating notifications from `push_notifications` table |
| `src/hooks/useRealtimeRefresh.ts` | Realtime subscriptions for dashboard auto-refresh on business tables |
| `src/pages/NotificationsPage.tsx` | Dedicated `/notifications` page with category tabs and full history |
| `src/components/notifications/NotificationItem.tsx` | Reusable notification row component (shared between dropdown and page) |
| `src/components/notifications/NotificationCategoryTabs.tsx` | Pill-shaped category tab bar with unread counts |

### Modified Files
| File | Changes |
|------|---------|
| `src/hooks/useNotificationPreferences.ts` | Add `preferences_matrix` JSONB support alongside old booleans |
| `src/components/settings/NotificationPreferencesSection.tsx` | Replace 4-toggle layout with 5×3 matrix UI |
| `src/hooks/useNotifications.ts` | Refactor: subscribe to `push_notifications` Realtime instead of 8+ tables; remove localStorage |
| `src/components/notifications/NotificationDropdown.tsx` | Redesign: 5 items, "See all" link, no auto-mark-on-open, teal brand colors |
| `src/integrations/supabase/types.ts` | Add new columns to `push_notifications` and `notification_preferences` types |
| `src/App.tsx` | Add `/notifications` route |

### Files Where Event Sources Will Call `create-notification` (Task 8)
These are wired up last, after the core system works end-to-end:
- `src/hooks/useCreateApplication.ts` — `application_received`
- `src/hooks/useManageApplication.ts` — `application_accepted`, `application_rejected`
- `src/hooks/useCounterOffers.ts` — `counter_offer_received`, `counter_offer_responded`
- `src/hooks/useMessageMutations.ts` — `message_received`
- Various campaign/sponsorship/file hooks — remaining event types

---

## Task 1: Schema Migration

**Files:**
- Create: `supabase/migrations/20260526100000_notification_system_schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 1. Add new columns to push_notifications
ALTER TABLE push_notifications
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'default';

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_push_notif_user_unread
  ON push_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_notif_user_category
  ON push_notifications(user_id, category, created_at DESC);

-- 3. Add preferences_matrix JSONB column to notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS preferences_matrix JSONB DEFAULT '{
    "campaigns":    { "in_app": true,  "email": true,  "sms": false },
    "messages":     { "in_app": true,  "email": false, "sms": false },
    "transactions": { "in_app": true,  "email": true,  "sms": false },
    "content":      { "in_app": true,  "email": false, "sms": false },
    "account":      { "in_app": true,  "email": true,  "sms": false }
  }'::jsonb;

-- 4. Enable Realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE push_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_collaborations;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_sponsorships;

-- 5. Ensure push_notifications RLS policies exist for new access patterns
-- SELECT policy already exists from original migration (user_id = auth.uid())
-- UPDATE policy already exists from original migration (user_id = auth.uid())
-- No INSERT policy for regular users — edge function uses service role
```

- [ ] **Step 2: Apply migration and verify**

Apply migration to the Supabase project via `supabase apply_migration` MCP tool or the Supabase dashboard. Verify new columns appear on `push_notifications` and `notification_preferences` tables.

Also run: `npm run build`
Expected: PASS (migration doesn't affect frontend build, but confirms nothing else broke)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260526100000_notification_system_schema.sql
git commit -m "feat: add notification system schema migration

Add type, category, action_url, actor_id, actor_name, icon columns to
push_notifications. Add preferences_matrix JSONB to notification_preferences.
Enable Realtime on push_notifications, campaign_applications,
campaign_collaborations, campaign_sponsorships."
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/notifications.ts`
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Create the shared notification types file**

```typescript
// src/types/notifications.ts

export type NotificationCategory = 'campaigns' | 'messages' | 'transactions' | 'content' | 'account';

export type NotificationType =
  // Campaigns (11)
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'campaign_invitation'
  | 'invitation_declined'
  | 'campaign_published'
  | 'revision_requested'
  | 'cgc_submission_received'
  | 'cgc_code_redeemed'
  | 'cgc_promotion_expired'
  | 'cgc_max_redemptions_reached'
  // Messages (1)
  | 'message_received'
  // Transactions (7)
  | 'sponsorship_proposal'
  | 'sponsorship_accepted'
  | 'sponsorship_rejected'
  | 'counter_offer_received'
  | 'counter_offer_responded'
  | 'payment_received'
  | 'project_completed'
  // Content (8)
  | 'content_liked'
  | 'content_approved'
  | 'file_uploaded'
  | 'dragonshare_boost'
  | 'social_post_published'
  | 'social_post_failed'
  | 'social_draft_ready'
  | 'triple_post_completed'
  // Account (11)
  | 'member_joined'
  | 'member_removed'
  | 'member_role_changed'
  | 'unit_created'
  | 'unit_deleted'
  | 'profile_updated'
  | 'social_account_connected'
  | 'social_account_disconnected'
  | 'account_deletion_requested'
  | 'account_restored'
  | 'account_purge_warning';

export interface PushNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType | 'legacy';
  category: NotificationCategory | 'legacy';
  action_url: string | null;
  actor_id: string | null;
  actor_name: string | null;
  icon: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ChannelPreferences {
  in_app: boolean;
  email: boolean;
  sms: boolean;
}

export interface PreferencesMatrix {
  campaigns: ChannelPreferences;
  messages: ChannelPreferences;
  transactions: ChannelPreferences;
  content: ChannelPreferences;
  account: ChannelPreferences;
}

export const DEFAULT_PREFERENCES_MATRIX: PreferencesMatrix = {
  campaigns:    { in_app: true,  email: true,  sms: false },
  messages:     { in_app: true,  email: false, sms: false },
  transactions: { in_app: true,  email: true,  sms: false },
  content:      { in_app: true,  email: false, sms: false },
  account:      { in_app: true,  email: true,  sms: false },
};

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: string; description: string }> = {
  campaigns:    { label: 'Campaigns',    icon: '📋', description: 'Applications, invitations, status changes' },
  messages:     { label: 'Messages',     icon: '💬', description: 'Direct messages and replies' },
  transactions: { label: 'Transactions', icon: '💰', description: 'Payments, sponsorships, counter-offers' },
  content:      { label: 'Content',      icon: '❤️', description: 'Likes, DragonShare, file uploads, social posting' },
  account:      { label: 'Account',      icon: '🏢', description: 'Team members, locations, settings, account' },
};

export const NOTIFICATION_TYPE_TO_EMAIL_TYPE: Record<string, string> = {
  application_received: 'new_application',
  application_accepted: 'application_status',
  application_rejected: 'application_status',
  campaign_invitation: 'campaign_invitation',
  invitation_declined: 'campaign_invitation_declined',
  campaign_published: 'campaign_published',
  revision_requested: 'revision_requested',
  message_received: 'new_message',
  sponsorship_proposal: 'sponsorship_proposal',
  sponsorship_accepted: 'sponsorship_status',
  sponsorship_rejected: 'sponsorship_status',
  counter_offer_received: 'counter_offer',
  counter_offer_responded: 'counter_offer_response',
  payment_received: 'payment_received',
  project_completed: 'project_completion',
  content_liked: 'content_liked',
  content_approved: 'content_approved',
  file_uploaded: 'file_uploaded_by_creator',
};
```

- [ ] **Step 2: Update Supabase types**

Open `src/integrations/supabase/types.ts` and add the new columns to the `push_notifications` Row/Insert/Update types (around lines 4141-4173) and add `preferences_matrix` to the `notification_preferences` types (around lines 3418-3450). Match the exact pattern used by other columns in those type blocks.

Note: These types are auto-generated by Supabase CLI. If the migration is applied first, running `npx supabase gen types typescript` regenerates them. For now, manually add the columns so the frontend can build before the migration is applied to remote.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/notifications.ts src/integrations/supabase/types.ts
git commit -m "feat: add notification system TypeScript types

Shared types for 38 notification types, 5 categories, preferences matrix,
and email type mapping. Update Supabase types for new columns."
```

---

## Task 3: create-notification Edge Function

**Files:**
- Create: `supabase/functions/create-notification/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/create-notification/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface CreateNotificationRequest {
  recipientId: string;
  type: string;
  category: string;
  title: string;
  body: string;
  actionUrl?: string;
  actorId?: string;
  actorName?: string;
  icon?: string;
  data?: Record<string, unknown>;
  forceDelivery?: boolean;
  emailType?: string;
  emailData?: Record<string, unknown>;
}

// Keep in sync with src/types/notifications.ts NOTIFICATION_TYPE_TO_EMAIL_TYPE
const NOTIFICATION_TYPE_TO_EMAIL_TYPE: Record<string, string> = {
  application_received: 'new_application',
  application_accepted: 'application_status',
  application_rejected: 'application_status',
  campaign_invitation: 'campaign_invitation',
  invitation_declined: 'campaign_invitation_declined',
  campaign_published: 'campaign_published',
  revision_requested: 'revision_requested',
  message_received: 'new_message',
  sponsorship_proposal: 'sponsorship_proposal',
  sponsorship_accepted: 'sponsorship_status',
  sponsorship_rejected: 'sponsorship_status',
  counter_offer_received: 'counter_offer',
  counter_offer_responded: 'counter_offer_response',
  payment_received: 'payment_received',
  project_completed: 'project_completion',
  content_liked: 'content_liked',
  content_approved: 'content_approved',
  file_uploaded: 'file_uploaded_by_creator',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const isService = authHeader === `Bearer ${serviceKey}`;

    let callerUserId: string | null = null;

    if (!isService) {
      // Validate JWT for non-service callers
      const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      callerUserId = user.id;
    }

    const body: CreateNotificationRequest = await req.json();
    const { recipientId, type, category, title, body: notifBody, actionUrl, actorId, actorName, icon, data, forceDelivery, emailType, emailData } = body;

    if (!recipientId || !type || !category || !title || !notifBody) {
      return new Response(JSON.stringify({ error: "Missing required fields: recipientId, type, category, title, body" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // JWT callers can only notify themselves (spec requirement)
    if (callerUserId && callerUserId !== recipientId) {
      return new Response(JSON.stringify({ error: "Forbidden: cannot notify other users" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Service-role client for DB operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. INSERT notification (always, regardless of preferences)
    const { data: notification, error: insertError } = await admin
      .from("push_notifications")
      .insert({
        user_id: recipientId,
        type,
        category,
        title,
        body: notifBody,
        action_url: actionUrl ?? null,
        actor_id: actorId ?? null,
        actor_name: actorName ?? null,
        icon: icon ?? "default",
        data: data ?? null,
        sent_at: new Date().toISOString(),
      })
      .select("id, user_id, type, category, title, body, action_url, actor_name, icon, data, read_at, sent_at, created_at")
      .single();

    if (insertError) {
      console.error("Failed to insert notification:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create notification", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 2. Check user preferences
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("preferences_matrix")
      .eq("user_id", recipientId)
      .maybeSingle();

    const defaultMatrix = {
      campaigns:    { in_app: true, email: true, sms: false },
      messages:     { in_app: true, email: false, sms: false },
      transactions: { in_app: true, email: true, sms: false },
      content:      { in_app: true, email: false, sms: false },
      account:      { in_app: true, email: true, sms: false },
    };
    const matrix = (prefs?.preferences_matrix as Record<string, { email: boolean; sms: boolean }>) ?? defaultMatrix;
    const categoryPrefs = matrix[category] ?? { email: false, sms: false };

    // 3. Send email if enabled (or forced)
    let emailSent = false;
    if (forceDelivery || categoryPrefs.email) {
      const resolvedEmailType = emailType ?? NOTIFICATION_TYPE_TO_EMAIL_TYPE[type];
      if (resolvedEmailType) {
        try {
          const emailResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-notification-email`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                type: resolvedEmailType,
                data: {
                  recipientUserId: recipientId,
                  ...emailData,
                  ...(data ?? {}),
                },
              }),
            }
          );
          emailSent = emailResponse.ok;
        } catch (e) {
          console.error("Email delivery failed:", e);
        }
      }
    }

    // 4. SMS placeholder (future Twilio integration)
    const smsSent = false;

    return new Response(
      JSON.stringify({ notification, emailSent, smsSent }),
      {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("create-notification error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS (edge function is Deno, not part of Vite build — but confirms no side-effect breakage)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-notification/index.ts
git commit -m "feat: add create-notification edge function

Central notification hub: persists to push_notifications, checks
preferences_matrix, routes to send-notification-email when enabled.
SMS placeholder for future Twilio integration."
```

---

## Task 4: Notification Preferences Hook & UI

**Files:**
- Modify: `src/hooks/useNotificationPreferences.ts`
- Modify: `src/components/settings/NotificationPreferencesSection.tsx`

- [ ] **Step 1: Update the preferences hook to support preferences_matrix**

Rewrite `src/hooks/useNotificationPreferences.ts` to read/write the `preferences_matrix` JSONB column. Keep the existing query key `['notification-preferences', user?.id]` (note: invalidation uses the prefix `['notification-preferences']` which matches via React Query's prefix matching).

```typescript
// src/hooks/useNotificationPreferences.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { PreferencesMatrix } from '@/types/notifications';
import { DEFAULT_PREFERENCES_MATRIX } from '@/types/notifications';

export const useNotificationPreferences = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notification-preferences', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('id, user_id, preferences_matrix')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const matrix: PreferencesMatrix =
    (query.data?.preferences_matrix as PreferencesMatrix) ?? DEFAULT_PREFERENCES_MATRIX;

  const updateMatrix = useMutation({
    mutationFn: async (newMatrix: PreferencesMatrix) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: user.id, preferences_matrix: newMatrix as unknown as Record<string, unknown> },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });

  return { matrix, isLoading: query.isLoading, updateMatrix };
};
```

- [ ] **Step 2: Rewrite the preferences UI component**

Rewrite `src/components/settings/NotificationPreferencesSection.tsx` to render the 5×3 matrix:
- 5 rows: Campaigns, Messages, Transactions, Content, Account (use `CATEGORY_META` from types)
- 3 columns: In-App, Email, SMS
- SMS column: disabled toggles with "Coming soon" / "Soon" label
- Teal toggle color when ON (use `data-[state=checked]:bg-dc-teal` on Switch)
- Sub-descriptions under each category name
- Loading skeleton while fetching
- Column headers: uppercase labels ("IN-APP", "EMAIL", "SMS")

Mobile: toggles are 36px wide, category descriptions are 10px. Desktop: toggles are 40px, descriptions are 12px. Use responsive Tailwind classes.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Test in browser**

Run: `npm run dev`
Navigate to each settings page (restaurant, creator, brand) and verify:
- Matrix renders with 5 rows × 3 columns
- Toggling In-App/Email saves and persists on refresh
- SMS toggles are disabled with "Coming soon"
- Loading skeleton shows briefly

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotificationPreferences.ts src/components/settings/NotificationPreferencesSection.tsx
git commit -m "feat: redesign notification preferences as 5x3 matrix

Per-category (Campaigns, Messages, Transactions, Content, Account) ×
per-channel (In-App, Email, SMS) preference toggles. SMS disabled with
Coming Soon label. Replaces old 4-toggle layout."
```

---

## Task 5: Notification Query Hooks

**Files:**
- Create: `src/hooks/useNotificationQueries.ts`

- [ ] **Step 1: Create notification data hooks**

```typescript
// src/hooks/useNotificationQueries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { PushNotification, NotificationCategory } from '@/types/notifications';

const PAGE_SIZE = 20;

export const useNotificationsList = (category?: NotificationCategory) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id, category ?? 'all'],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('push_notifications')
        .select('id, user_id, title, body, type, category, action_url, actor_id, actor_name, icon, data, read_at, sent_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PushNotification[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useUnreadNotificationCount = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-unread-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from('push_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useUnreadCountByCategory = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-unread-by-category', user?.id],
    queryFn: async () => {
      if (!user) return {} as Record<string, number>;

      const { data, error } = await supabase
        .from('push_notifications')
        .select('category')
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const cat = row.category ?? 'legacy';
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      return counts;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useMarkNotificationRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('push_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('push_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
    },
  });
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNotificationQueries.ts
git commit -m "feat: add notification query hooks

React Query hooks for notification list (with category filter),
unread count, per-category unread counts, mark-read, and mark-all-read.
All queries use push_notifications table via Supabase."
```

---

## Task 6: Refactor useNotifications + Realtime

**Files:**
- Modify: `src/hooks/useNotifications.ts`
- Create: `src/hooks/useRealtimeRefresh.ts`

- [ ] **Step 1: Rewrite useNotifications**

Rewrite `src/hooks/useNotifications.ts` (currently 730 lines) to:

1. Remove all localStorage read/write logic
2. Remove all individual table subscriptions (campaign_applications, campaign_sponsorships, analytics_events, etc.)
3. Subscribe to a single Realtime channel on `push_notifications` filtered by `user_id` (INSERT events)
4. On INSERT → add notification to React Query cache → show toast if `in_app` preference is enabled → update unread counts
5. Expose: `notifications` (from `useNotificationsList`), `unreadCount` (from `useUnreadNotificationCount`), `markAsRead`, `markAllAsRead`
6. Load `preferences_matrix` via `useNotificationPreferences` to check `in_app` before showing toasts

Keep the same export interface (`useNotifications` returning `{ notifications, unreadCount, markAsRead, markAllAsRead }`) so `NotificationDropdown` and other consumers don't break during migration.

Reference existing Realtime subscription pattern. Subscribe to both INSERT (new notifications → show toast, update cache) and UPDATE (read_at changes → sync across tabs):
```typescript
const channelSuffix = Math.random().toString(36).substring(2, 8);
const channel = supabase
  .channel(`notifications-${user.id}-${channelSuffix}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'push_notifications',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    // Add to React Query cache, show toast if in_app enabled, update unread counts
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'push_notifications',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    // Update notification in cache (e.g., read_at changed from another tab)
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
  })
  .subscribe();
```

- [ ] **Step 2: Create useRealtimeRefresh hook**

Note: These subscriptions receive all changes permitted by RLS. Since Supabase Realtime filters are limited to simple equality on a single column, and the restaurant owner's `user_id` is on the `campaigns` table (not directly on `campaign_applications`), we accept broad invalidation here. React Query will re-fetch from the server with RLS, so users only see their own data. The extra re-fetches are a minor perf cost at ~30 users.

```typescript
// src/hooks/useRealtimeRefresh.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useRealtimeRefresh = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const suffix = Math.random().toString(36).substring(2, 8);
    const channel = supabase
      .channel(`dashboard-refresh-${user.id}-${suffix}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_applications',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
        queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_collaborations',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['campaign-collaborations'] });
        queryClient.invalidateQueries({ queryKey: ['collaboration'] });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_sponsorships',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['campaign-sponsorships'] });
        queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
};
```

- [ ] **Step 3: Wire useRealtimeRefresh into DashboardLayout**

In `src/components/DashboardLayout.tsx`, import and call `useRealtimeRefresh()` at the top of the component so it runs for all authenticated dashboard views. The hook is safe for all roles — it returns early if `!user` and RLS filters query results.

Note: The spec mentions a `freshIds` state set with Framer Motion pulse animation on changed items. This is deferred to a follow-up polish task — the core auto-refresh via React Query invalidation is the priority. The pulse animation requires per-component integration with `freshIds` state, which is best added after the notification system is functional end-to-end.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotifications.ts src/hooks/useRealtimeRefresh.ts src/components/DashboardLayout.tsx
git commit -m "feat: refactor notifications to server-side + add realtime refresh

useNotifications now subscribes to push_notifications via Realtime instead
of 8+ tables. localStorage removed. New useRealtimeRefresh hook subscribes
to campaign_applications, campaign_collaborations, campaign_sponsorships
for instant dashboard updates."
```

---

## Task 7: Notification UI Components

**Files:**
- Create: `src/components/notifications/NotificationItem.tsx`
- Create: `src/components/notifications/NotificationCategoryTabs.tsx`
- Create: `src/pages/NotificationsPage.tsx`
- Modify: `src/components/notifications/NotificationDropdown.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create NotificationItem component**

Shared component used by both the dropdown and the full page. Renders: icon circle (color-coded by category), title, body preview, timestamp, teal unread dot. Props: `notification: PushNotification`, `compact?: boolean` (for dropdown vs page sizing), `onClick: () => void`.

Category-to-color mapping:
- campaigns → `bg-dc-teal`
- messages → `bg-dc-pink`
- transactions → `bg-dc-teal-btn`
- content → `bg-dc-pink-accent`
- account → `bg-indigo-500`
- Unread background: `bg-dc-teal/[0.06]`
- Unread dot: `bg-dc-teal`

Use the `formatTimeAgo` helper already in NotificationDropdown (extract it).

- [ ] **Step 2: Create NotificationCategoryTabs component**

Renders the pill-shaped category tabs with unread count badges. Props: `activeCategory: string`, `onCategoryChange: (cat: string) => void`, `unreadCounts: Record<string, number>`.

Categories: All, Campaigns, Messages, Transactions, Content, Account.
Active tab: `bg-dc-teal text-white`. Inactive: `bg-white/80 text-dc-text-muted` (no gray per design system).
Unread badge: `bg-red-500 text-white` pill inside the tab.
Mobile: horizontally scrollable with `overflow-x-auto flex gap-2`.
Desktop: static flex row.

- [ ] **Step 3: Create NotificationsPage**

Full page at `/notifications`. Structure:
- Header: "Notifications" + "Mark all as read" + Settings link (desktop)
- `NotificationCategoryTabs` for filtering
- List of `NotificationItem` components
- Empty state: "You're all caught up!" with Bell icon
- Mobile: `dc-gray` background. Desktop: white card container.

Use `useNotificationsList(category)` for data, `useUnreadCountByCategory()` for tab badges, `useMarkNotificationRead()` and `useMarkAllNotificationsRead()` for actions. Clicking an item calls `markAsRead` then navigates to `action_url`.

- [ ] **Step 4: Redesign NotificationDropdown**

Rewrite `src/components/notifications/NotificationDropdown.tsx`:
- Show 5 most recent notifications (not 10)
- Remove auto-mark-as-read on open (delete the `useEffect` that calls `markAllAsRead`)
- Add "See all notifications →" footer link that navigates to `/notifications`
- Use `NotificationItem` with `compact={true}` for each item
- Keep bell icon with red badge for unread count
- Add "Mark all read" button in header (existing pattern)

- [ ] **Step 5: Add /notifications route to App.tsx**

In `src/App.tsx`, add a lazy-loaded route:
```typescript
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
```
Add inside the authenticated routes:
```tsx
<Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Test in browser**

Run: `npm run dev`
Test as each role:
- Bell dropdown shows 5 items max + "See all" footer
- Opening dropdown does NOT auto-mark as read
- Clicking "See all" navigates to `/notifications`
- Notifications page shows category tabs with unread counts
- Filtering by category works
- Clicking a notification navigates to its `action_url`
- "Mark all as read" clears unread dots
- Empty state renders when no notifications exist
- Test both desktop and mobile viewports

- [ ] **Step 8: Commit**

```bash
git add src/components/notifications/ src/pages/NotificationsPage.tsx src/App.tsx
git commit -m "feat: add notification center page and redesign bell dropdown

New /notifications page with category tabs, full notification history,
and mark-as-read. Bell dropdown shows 5 items with 'See all' link.
No auto-mark-on-open. Teal brand colors throughout."
```

---

## Task 8: Wire Up Event Sources (Phase 1 — Core Campaign Events)

**Files:**
- Modify: `src/hooks/useCreateApplication.ts`
- Modify: `src/hooks/useManageApplication.ts`

This task wires up the most critical notification events first: campaign applications. Additional event sources (sponsorships, messages, content, CGC, account) follow the same pattern and can be wired up incrementally in subsequent tasks.

- [ ] **Step 1: Find useCreateApplication and add notification call**

After the successful application insert/RPC call, add a call to `create-notification`:

```typescript
// After successful application creation:
await supabase.functions.invoke('create-notification', {
  body: {
    recipientId: campaign.user_id, // restaurant owner
    type: 'application_received',
    category: 'campaigns',
    title: 'New Application',
    body: `${creatorName} applied to your "${campaign.title}" campaign`,
    actionUrl: `/dashboard/business/campaigns/${campaign.id}`,
    actorId: user.id,
    actorName: creatorName,
    icon: 'application',
    data: { campaign_id: campaign.id, application_id: newApplication.id },
    emailData: { campaignTitle: campaign.title, applicantName: creatorName, campaignId: campaign.id },
  },
});
```

This call is fire-and-forget (no `await` needed for UX). Wrap in try/catch to prevent notification failures from breaking the application flow.

- [ ] **Step 2: Find useManageApplication and add notification calls**

On accept: notify creator with `application_accepted`.
On reject: notify creator with `application_rejected`.

Same pattern — fire-and-forget call to `create-notification` after the status update mutation succeeds.

- [ ] **Step 3: Remove corresponding direct email calls**

Find and remove the direct `useEmailNotifications().sendNotification(...)` calls for application events in these hooks, since `create-notification` now handles email routing.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Test end-to-end**

Run: `npm run dev`
1. Log in as creator, apply to a campaign
2. Log in as restaurant in another browser — verify:
   - Toast notification appears within 1-2 seconds
   - Bell badge increments
   - Notification appears in dropdown and /notifications page
   - Check email inbox for notification email (if email preference enabled)
3. Accept the application as restaurant
4. Verify creator receives acceptance notification

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCreateApplication.ts src/hooks/useManageApplication.ts
git commit -m "feat: wire campaign application events to notification system

application_received, application_accepted, application_rejected now
route through create-notification edge function. Direct email calls
removed — email routing handled server-side via preferences."
```

---

## Task 9: Wire Up Remaining Event Sources

**Files:** Various hooks across `src/hooks/`

This task wires up all remaining event sources following the exact same pattern established in Task 8. Each mutation hook that should produce a notification gets a fire-and-forget `supabase.functions.invoke('create-notification', { body: {...} })` call after its success handler.

- [ ] **Step 1: Messages — `message_received`**

In the message send mutation, call `create-notification` for the recipient.

- [ ] **Step 2: Sponsorships — `sponsorship_proposal`, `sponsorship_accepted`, `sponsorship_rejected`**

In sponsorship create/manage hooks.

- [ ] **Step 3: Counter-offers — `counter_offer_received`, `counter_offer_responded`**

In counter-offer hooks.

- [ ] **Step 4: Content — `content_liked`, `content_approved`, `file_uploaded`**

In the relevant like/approve/upload hooks.

- [ ] **Step 5: CGC — `cgc_submission_received`**

In the promotion submission flow. The `cgc_code_redeemed` event fires from the `toast-redemption-webhook` edge function (modify that function to also call `create-notification`). `cgc_promotion_expired` fires from the auto-expiration cron (modify `expire_past_promotions()` or add a post-expiration edge function call).

- [ ] **Step 6: Account — `member_joined`, `member_removed`, `member_role_changed`, `unit_created`, `unit_deleted`**

In org member and org unit hooks. For deletion events (`account_deletion_requested`, `account_restored`, `account_purge_warning`), modify the relevant RPC functions or add calls in the restoration/deletion flows. Use `forceDelivery: true` for deletion events.

- [ ] **Step 7: Social — `social_post_published`, `social_post_failed`, `social_draft_ready`, `triple_post_completed`**

In the Outstand posting hooks and social hook edge functions.

- [ ] **Step 8: Settings — `profile_updated`, `social_account_connected`, `social_account_disconnected`**

In the profile submit hooks and Outstand connection hooks. Only notify *other* org members (skip if user is solo or is the actor).

- [ ] **Step 9: Remove old direct email calls**

As each event source is wired to `create-notification`, remove the corresponding direct `useEmailNotifications().sendNotification(...)` call. The edge function now handles email routing.

- [ ] **Step 10: Verify build and test**

Run: `npm run build`
Run: `npm run dev` — test at least one event from each category to confirm end-to-end delivery.

- [ ] **Step 11: Commit**

```bash
git add src/hooks/ supabase/functions/
git commit -m "feat: wire all 38 notification event types to create-notification

Messages, sponsorships, counter-offers, content, CGC promotions,
account/team events, social posting, and settings changes all route
through the notification hub. Direct email calls removed."
```

---

## Task 10: Final Cleanup and Verification

**Files:**
- Modify: `src/hooks/useNotifications.ts` (remove any remaining localStorage references)
- Various: cleanup unused imports

- [ ] **Step 1: Remove localStorage notification storage**

Search for `dc_notifications_` in the codebase and remove all localStorage read/write calls. The `push_notifications` table is now the single source of truth.

- [ ] **Step 2: Run full build and type check**

Run: `npm run build && npm run typecheck`
Expected: PASS with no errors

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass

- [ ] **Step 4: Production verification**

After push to main (auto-deploys via Lovable.dev):
1. Log in as restaurant (dwilliams@harbormill.net) at dragoncandy.io
2. Verify bell dropdown renders, /notifications page loads
3. Check notification preferences in settings — 5×3 matrix visible
4. Open Chrome DevTools — check for console errors
5. Test mobile viewport (375px) — verify responsive layout
6. Log in as creator (damewillie@gmail.com) — same checks
7. Log in as brand (damesonpoint@gmail.com) — same checks

- [ ] **Step 5: Commit cleanup**

```bash
git add src/hooks/useNotifications.ts
git commit -m "chore: remove localStorage notification storage

push_notifications table is now the single source of truth.
All localStorage references cleaned up."
```

---

## Verification Summary

| Check | How | Expected |
|-------|-----|----------|
| Schema migration | Applied via Supabase dashboard or CLI | New columns visible in push_notifications and notification_preferences |
| Edge function | `supabase functions deploy create-notification` | Function deployed and callable |
| Real-time refresh | Apply as creator → restaurant sees instantly | <2 second latency |
| Bell dropdown | Click bell icon | 5 items, "See all" link, no auto-mark |
| Notification center | Navigate to /notifications | Category tabs, full history, mark-as-read |
| Preferences matrix | Settings page | 5×3 matrix with teal toggles, SMS "Coming soon" |
| Email delivery | Trigger notification with email enabled | Email received via Resend |
| Preference enforcement | Disable email for Campaigns → apply | No email sent |
| Desktop layout | 1280px viewport | White card container, proper spacing |
| Mobile layout | 375px viewport | Gray background, scrollable tabs, compact items |
| Cross-device | Two browsers, same account | Notification appears on both |
