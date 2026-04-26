# Campaign Invitations, Shared Context & Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up campaign invitations end-to-end (3 entry points → edge function hub → email + Donny message + bell notification), add campaign context awareness to Donny, and make the notification bell functional for invitations.

**Architecture:** A new `send-campaign-invitation` edge function serves as the single code path for all invitation entry points (Donny, campaign page, creator profile). It handles validation, DB insert, email, and Donny proactive message. The existing `useNotifications` hook gains a realtime subscription for `campaign_invitations` to drive the bell icon. DonnyProvider passes campaign page context to the edge function so Donny can auto-fill campaign IDs.

**Tech Stack:** React 18, TypeScript strict, Tailwind CSS, Supabase (Postgres, Edge Functions, Realtime), React Query, react-router-dom v6

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/functions/send-campaign-invitation/index.ts` | Edge function hub — validates, inserts invitation, sends email, creates Donny message |
| `src/components/campaigns/InviteToCampaignModal.tsx` | Modal with campaign dropdown for inviting from creator profile |
| `src/components/messaging/CampaignConversationHeader.tsx` | Banner showing campaign context at top of linked conversations |
| `src/components/campaign-details/InvitationBanner.tsx` | Yellow "You're invited!" banner for creator campaign detail page |

### Modified files
| File | Changes |
|------|---------|
| `supabase/functions/send-notification-email/index.ts` | Add `campaign_invitation` to NotificationType union + template |
| `supabase/functions/donny-chat/index.ts` | Update `invite_creator` tool handler to call `send-campaign-invitation` |
| `src/types/donny.ts` | Add `quick_actions` field to `DonnyMessage` interface |
| `src/components/donny/DonnyMessage.tsx` | Render quick-action buttons when present |
| `src/contexts/DonnyProvider.tsx` | Extract campaign context from URL, expose via provider |
| `src/hooks/useDonny.ts` | Pass `campaign_context` in edge function call body |
| `src/hooks/useCampaignInvitations.ts` | Change `useInviteCreator` from raw insert to edge function call |
| `src/hooks/useBulkInvite.ts` | Change from raw insert to edge function call per invitation |
| `src/hooks/useNotifications.ts` | Add `campaign_invitation` type + realtime subscription |
| `src/components/notifications/NotificationDropdown.tsx` | Add routing for `campaign_invitation` notifications |
| `src/components/campaigns/CreatorMatchingSection.tsx` | Wire `onInvite` callback through to CreatorMatchCard |
| `src/components/campaign-details/CreatorCampaignDetails.tsx` | Accept + render InvitationBanner |
| `src/pages/CampaignDetailsPage.tsx` | Read `?invited=true` query param, pass to child |
| `src/hooks/useCreateApplication.ts` | Update invitation status to `accepted` on application submit |

### Migration
| File | Changes |
|------|---------|
| `supabase/migrations/20260426_add_quick_actions_to_donny_messages.sql` | Add `quick_actions JSONB` column to `donny_messages` |

---

## Task 1: Add `campaign_invitation` email template

**Files:**
- Modify: `supabase/functions/send-notification-email/index.ts:12-35` (NotificationType union)
- Modify: `supabase/functions/send-notification-email/index.ts:124-649` (templates object)

- [ ] **Step 1: Add `campaign_invitation` to NotificationType union**

In `supabase/functions/send-notification-email/index.ts`, add `'campaign_invitation'` to the `NotificationType` union type (around line 35):

```typescript
| 'campaign_invitation'
```

- [ ] **Step 2: Add data fields to NotificationEmailRequest interface**

In the `NotificationEmailRequest` interface's `data` object (around line 41-73), add the new fields needed by the campaign_invitation template:

```typescript
invitationMessage?: string;
campaignUrl?: string;
businessName?: string;
```

- [ ] **Step 3: Add email template**

Add the `campaign_invitation` template to the `templates` object. Follow the existing pattern (greeting → context → CTA link):

```typescript
campaign_invitation: {
  subject: `You're invited to a campaign on DragonCandy!`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #4DD9C0, #00C9B0); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Campaign Invitation</h1>
      </div>
      <div style="padding: 20px;">
        <p>Hi there!</p>
        <p><strong>${'${data.businessName}'}</strong> has invited you to their campaign: <strong>${'${data.campaignTitle}'}</strong></p>
        ${`\$\{data.invitationMessage ? '<p style="background: #f0fdfa; border-left: 3px solid #4DD9C0; padding: 12px; margin: 16px 0; font-style: italic;">' + data.invitationMessage + '</p>' : ''}`}
        <p>Check out the campaign details and apply if you're interested:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${'${data.campaignUrl}'}" style="background: #4DD9C0; color: white; padding: 12px 32px; border-radius: 24px; text-decoration: none; font-weight: bold;">View Campaign</a>
        </div>
      </div>
    </div>
  `,
},
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: Clean compile or only unrelated warnings.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-notification-email/index.ts
git commit -m "feat: add campaign_invitation email template to send-notification-email"
```

---

## Task 2: DB migration — add `quick_actions` to `donny_messages`

**Files:**
- Create: `supabase/migrations/20260426_add_quick_actions_to_donny_messages.sql`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE donny_messages ADD COLUMN IF NOT EXISTS quick_actions JSONB DEFAULT NULL;

COMMENT ON COLUMN donny_messages.quick_actions IS 'Optional quick-action buttons rendered below the message. Array of {label, action, url?} objects.';
```

- [ ] **Step 2: Apply migration**

Run via Supabase MCP or CLI:
```bash
supabase db push
```

Or apply via the Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260426_add_quick_actions_to_donny_messages.sql
git commit -m "feat: add quick_actions JSONB column to donny_messages"
```

---

## Task 3: Create `send-campaign-invitation` edge function

**Files:**
- Create: `supabase/functions/send-campaign-invitation/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/send-campaign-invitation/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface InvitationRequest {
  campaign_id: string;
  creator_id: string;
  invited_by: string;
  invitation_message?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { campaign_id, creator_id, invited_by, invitation_message } =
      (await req.json()) as InvitationRequest;

    // --- Validation ---
    if (!campaign_id || !creator_id || !invited_by) {
      return new Response(
        JSON.stringify({ error: 'campaign_id, creator_id, and invited_by are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (creator_id === invited_by) {
      return new Response(
        JSON.stringify({ error: 'Cannot invite yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check campaign exists and is published
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, title, user_id, status, budget_min, budget_max, deadline, creator_count, description, delivery_type, ai_analysis')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (campaign.status !== 'published') {
      return new Response(
        JSON.stringify({ error: 'Campaign is not published' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (campaign.user_id !== invited_by) {
      return new Response(
        JSON.stringify({ error: 'Only the campaign owner can send invitations' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check creator exists
    const { data: creator, error: creatorError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', creator_id)
      .single();

    if (creatorError || !creator) {
      return new Response(
        JSON.stringify({ error: 'Creator not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check for duplicate pending invitation
    const { data: existing } = await supabase
      .from('campaign_invitations')
      .select('id, status')
      .eq('campaign_id', campaign_id)
      .eq('creator_id', creator_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ invitation: existing, already_invited: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Insert invitation ---
    const { data: invitation, error: insertError } = await supabase
      .from('campaign_invitations')
      .insert({
        campaign_id,
        creator_id,
        invited_by,
        invitation_message: invitation_message || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting invitation:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Get business name ---
    const { data: businessProfile } = await supabase
      .from('business_profiles')
      .select('business_name')
      .eq('user_id', invited_by)
      .maybeSingle();

    const businessName = businessProfile?.business_name || 'A business';

    // --- Send email notification ---
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'campaign_invitation',
          data: {
            recipientUserId: creator_id,
            businessName,
            campaignTitle: campaign.title,
            invitationMessage: invitation_message || '',
            campaignUrl: `https://dragoncandy.io/dashboard/creator/campaigns/${campaign_id}?invited=true`,
          },
        }),
      });
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
    }

    // --- Create Donny proactive message ---
    try {
      // Find or create creator's Donny conversation
      let { data: donnyConvo } = await supabase
        .from('donny_conversations' as any)
        .select('id')
        .eq('user_id', creator_id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!donnyConvo) {
        const { data: newConvo } = await supabase
          .from('donny_conversations' as any)
          .insert({ user_id: creator_id })
          .select('id')
          .single();
        donnyConvo = newConvo;
      }

      if (donnyConvo) {
        const emoji = (campaign.ai_analysis as any)?.emoji || '📣';
        const budgetStr = campaign.budget_min && campaign.budget_max
          ? `$${campaign.budget_min}–$${campaign.budget_max}`
          : 'TBD';
        const deadlineStr = campaign.deadline
          ? new Date(campaign.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'TBD';

        let messageContent = `Hey! 🎉 **${businessName}** just invited you to their campaign **"${campaign.title}"**!\n\n`;
        messageContent += `Here's the quick scoop:\n`;
        messageContent += `• ${emoji} ${campaign.description?.substring(0, 100) || 'Content creation campaign'}\n`;
        messageContent += `• 💰 ${budgetStr} budget\n`;
        messageContent += `• 📅 Due by ${deadlineStr}\n`;

        if (invitation_message) {
          messageContent += `\nThey said: _"${invitation_message}"_\n`;
        }

        const quickActions = [
          {
            label: 'View Campaign',
            action: 'navigate',
            url: `/dashboard/creator/campaigns/${campaign_id}?invited=true`,
          },
          { label: 'Decide Later', action: 'dismiss' },
        ];

        await supabase.from('donny_messages' as any).insert({
          conversation_id: donnyConvo.id,
          role: 'assistant',
          content: messageContent,
          quick_actions: quickActions,
        });

        // Update conversation last_message_at
        await supabase
          .from('donny_conversations' as any)
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', donnyConvo.id);
      }
    } catch (donnyError) {
      console.error('Failed to create Donny message:', donnyError);
    }

    return new Response(
      JSON.stringify({ invitation, already_invited: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('send-campaign-invitation error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd supabase/functions && deno check send-campaign-invitation/index.ts` (or rely on deploy-time checks)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-campaign-invitation/
git commit -m "feat: create send-campaign-invitation edge function hub"
```

---

## Task 4: Update `donny-chat` to call the new edge function

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts:369-431` (buildSystemPrompt — extend requestContext type)
- Modify: `supabase/functions/donny-chat/index.ts:698-712` (invite_creator handler)

- [ ] **Step 1: Extend requestContext type to include campaign_context**

In `supabase/functions/donny-chat/index.ts`, find the `buildSystemPrompt` function (around line 369). The `requestContext` parameter type is `{ page_url?: string; surface?: string }`. Extend it to include `campaign_context`:

```typescript
requestContext?: {
  page_url?: string;
  surface?: string;
  campaign_context?: { campaign_id: string; title: string; status: string };
}
```

Inside `buildSystemPrompt`, after the existing `page_url` section (around line 407-409), add campaign context to the prompt:

```typescript
if (requestContext?.campaign_context) {
  const cc = requestContext.campaign_context;
  systemParts.push(`The user is currently viewing campaign "${cc.title}" (ID: ${cc.campaign_id}, status: ${cc.status}). Use this as the default campaign for tools like invite_creator unless the user specifies otherwise.`);
}
```

- [ ] **Step 2: Replace raw insert with edge function call**

In the same file, find the `invite_creator` case in the `executeTool` function (around line 698-712). Replace the raw `supabase.from('campaign_invitations').insert(...)` with a fetch call to the new edge function:

```typescript
case 'invite_creator': {
  const { campaign_id, creator_id, message } = toolArgs;

  // Use campaign_id from tool args, fall back to campaign context
  const resolvedCampaignId = campaign_id || requestContext?.campaign_context?.campaign_id;

  if (!resolvedCampaignId) {
    return { success: false, error: 'No campaign specified. Please tell me which campaign to use.' };
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-campaign-invitation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      campaign_id: resolvedCampaignId,
      creator_id,
      invited_by: userId,
      invitation_message: message || null,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    return { success: false, error: result.error || 'Failed to send invitation' };
  }

  if (result.already_invited) {
    return { success: true, already_invited: true, message: 'This creator has already been invited to this campaign.' };
  }

  return { success: true, invitation_id: result.invitation.id };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd supabase/functions && deno check donny-chat/index.ts` (or rely on deploy-time checks)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: update donny-chat invite_creator to call send-campaign-invitation edge function"
```

---

## Task 5: Add campaign context to DonnyProvider + useDonny

**Files:**
- Modify: `src/contexts/DonnyProvider.tsx:9-34` (interface), `49-54` (provider body)
- Modify: `src/hooks/useDonny.ts:142-147` (edge function call)

- [ ] **Step 1: Add campaign context state to DonnyProvider**

In `src/contexts/DonnyProvider.tsx`, add campaign context extraction. After the existing `const location = useLocation()` on line 51:

```typescript
import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
```

Add the campaign context interface and state inside the provider function, after `const location = useLocation();`:

```typescript
// Campaign context — extract campaign ID from URL when on a campaign detail page
const campaignMatch = location.pathname.match(/\/campaigns\/([a-f0-9-]+)/);
const campaignIdFromUrl = campaignMatch?.[1] ?? null;

const [campaignContext, setCampaignContext] = useState<{
  campaign_id: string;
  title: string;
  status: string;
} | null>(null);

useEffect(() => {
  if (!campaignIdFromUrl) {
    setCampaignContext(null);
    return;
  }

  const fetchCampaign = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('id, title, status')
      .eq('id', campaignIdFromUrl)
      .single();

    if (data) {
      setCampaignContext({
        campaign_id: data.id,
        title: data.title,
        status: data.status,
      });
    }
  };

  fetchCampaign();
}, [campaignIdFromUrl]);
```

Add `supabase` import at top:

```typescript
import { supabase } from '@/integrations/supabase/client';
```

Add `campaignContext` to the `DonnyContextValue` interface:

```typescript
campaignContext: { campaign_id: string; title: string; status: string } | null;
```

Include `campaignContext` in the provider value object.

- [ ] **Step 2: Update useDonny hook to accept and pass campaign context**

In `src/hooks/useDonny.ts`:

**a)** Add an options interface and update the hook signature. Find the hook function declaration and change it:

```typescript
// Before:
export function useDonny() {

// After:
interface UseDonnyOptions {
  campaignContext?: { campaign_id: string; title: string; status: string } | null;
}

export function useDonny(options?: UseDonnyOptions) {
```

**b)** Update the `supabase.functions.invoke` call (lines 142-147). Replace:

```typescript
// Before:
const { data, error: fnError } = await supabase.functions.invoke('donny-chat', {
  body: {
    conversation_id: conversation.id,
    message: content,
  },
});

// After:
const { data, error: fnError } = await supabase.functions.invoke('donny-chat', {
  body: {
    conversation_id: conversation.id,
    message: content,
    context: {
      page_url: window.location.pathname,
      campaign_context: options?.campaignContext ?? undefined,
    },
  },
});
```

- [ ] **Step 3: Wire DonnyProvider to pass campaignContext to useDonny**

In `src/contexts/DonnyProvider.tsx`, update the `useDonny()` call on line 54. Replace:

```typescript
// Before:
const donny = useDonny();

// After:
const donny = useDonny({ campaignContext });
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Clean compile.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/DonnyProvider.tsx src/hooks/useDonny.ts
git commit -m "feat: pass campaign page context from DonnyProvider through to donny-chat edge function"
```

---

## Task 6: Add quick-action button rendering to DonnyMessage

**Files:**
- Modify: `src/types/donny.ts:92-101` (DonnyMessage interface)
- Modify: `src/components/donny/DonnyMessage.tsx:80-82` (render quick actions)

- [ ] **Step 1: Add QuickAction type and update DonnyMessage interface**

In `src/types/donny.ts`, add the QuickAction type before the `DonnyMessage` interface (around line 90):

```typescript
export interface DonnyQuickAction {
  label: string;
  action: 'navigate' | 'dismiss';
  url?: string;
}
```

Update the `DonnyMessage` interface to include `quick_actions`:

```typescript
export interface DonnyMessage {
  id: string;
  conversation_id: string;
  role: DonnyMessageRole;
  content: string | null;
  tool_calls: DonnyToolCall[] | null;
  tool_result: Record<string, unknown> | null;
  rich_card: DonnyRichCard | null;
  quick_actions: DonnyQuickAction[] | null;
  created_at: string;
}
```

- [ ] **Step 2: Render quick-action buttons in DonnyMessage component**

In `src/components/donny/DonnyMessage.tsx`, add quick-action button rendering after line 81 (`{message.rich_card && <DonnyRichCard card={message.rich_card} />}`):

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DonnyQuickAction } from '@/types/donny';
```

Add `useNavigate` and `useState` inside the component:

```typescript
const navigate = useNavigate();
const [dismissedActions, setDismissedActions] = useState(false);
```

Add the quick actions rendering after the rich_card line and before the closing `</div>`. The "dismiss" action hides the buttons:

```tsx
{message.quick_actions && message.quick_actions.length > 0 && !dismissedActions && (
  <div className="flex gap-2 flex-wrap mt-2">
    {message.quick_actions.map((action, i) => (
      <button
        key={i}
        type="button"
        onClick={() => {
          if (action.action === 'navigate' && action.url) {
            navigate(action.url);
          } else if (action.action === 'dismiss') {
            setDismissedActions(true);
          }
        }}
        className={
          action.action === 'navigate'
            ? 'bg-[#4DD9C0] text-white text-xs font-semibold px-4 py-2 rounded-full'
            : 'bg-white text-[#EC4899] border border-gray-200 text-xs font-semibold px-4 py-2 rounded-full'
        }
      >
        {action.label}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: Clean compile.

- [ ] **Step 4: Commit**

```bash
git add src/types/donny.ts src/components/donny/DonnyMessage.tsx
git commit -m "feat: add quick-action button rendering to DonnyMessage"
```

---

## Task 7: Update `useInviteCreator` and `useBulkInvite` to call edge function

**Files:**
- Modify: `src/hooks/useCampaignInvitations.ts:41-96`
- Modify: `src/hooks/useBulkInvite.ts:18-74`

- [ ] **Step 1: Update useInviteCreator**

Replace the mutation function in `src/hooks/useCampaignInvitations.ts` (lines 45-74) to call the edge function instead of raw insert:

```typescript
export const useInviteCreator = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      creatorId,
      message,
    }: {
      campaignId: string;
      creatorId: string;
      message?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-campaign-invitation', {
        body: {
          campaign_id: campaignId,
          creator_id: creatorId,
          invited_by: user!.id,
          invitation_message: message,
        },
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);

      return result as { invitation: CampaignInvitation; already_invited: boolean };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-invitations', variables.campaignId] });
      toast({
        title: data.already_invited ? 'Already invited' : 'Invitation sent!',
        description: data.already_invited
          ? 'This creator has already been invited to this campaign.'
          : 'The creator will be notified via email and in-app message.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send invitation',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
```

- [ ] **Step 2: Update useBulkInvite**

In `src/hooks/useBulkInvite.ts`, replace the raw insert loop (lines 29-48) to call the edge function per invitation:

```typescript
const results = { sent: 0, duplicates: 0, errors: 0 };

for (const creatorId of creatorIds) {
  try {
    const { data, error } = await supabase.functions.invoke('send-campaign-invitation', {
      body: {
        campaign_id: campaignId,
        creator_id: creatorId,
        invited_by: user!.id,
        invitation_message: message,
      },
    });

    if (error) {
      results.errors++;
      continue;
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result.already_invited) {
      results.duplicates++;
    } else {
      results.sent++;
    }
  } catch {
    results.errors++;
  }
}

return results;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: Clean compile.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignInvitations.ts src/hooks/useBulkInvite.ts
git commit -m "feat: update invitation hooks to call send-campaign-invitation edge function"
```

---

## Task 8: Wire up CreatorMatchCard invite button

**Files:**
- Modify: `src/components/campaigns/CreatorMatchingSection.tsx:252-263`

- [ ] **Step 1: Import and use the invite hook**

In `src/components/campaigns/CreatorMatchingSection.tsx`, the `CreatorMatchCard` already accepts `onInvite` and `isInvited` props. Wire them up in the parent component.

Add imports and state:

```typescript
import { useInviteCreator, useCampaignInvitations } from '@/hooks/useCampaignInvitations';
```

Inside the component, add:

```typescript
const inviteCreator = useInviteCreator();
const { data: invitations } = useCampaignInvitations(campaignId);
const invitedCreatorIds = new Set((invitations || []).map(inv => inv.creator_id));

const handleInvite = (creatorId: string) => {
  inviteCreator.mutate({ campaignId, creatorId });
};
```

Update the `CreatorMatchCard` rendering (around lines 252-263) to pass these props:

```tsx
<CreatorMatchCard
  key={match.creator_id}
  match={match}
  isInvited={invitedCreatorIds.has(match.creator_id)}
  onInvite={handleInvite}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 3: Test in browser**

Run `npm run dev`. Navigate to a campaign's AI Match tab. Verify:
- "Invite" button appears on each creator card
- Clicking "Invite" sends the invitation and button changes to "Invited"
- Toast confirms success

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CreatorMatchingSection.tsx
git commit -m "feat: wire invite button on CreatorMatchCard in AI Match tab"
```

---

## Task 9: Create InviteToCampaignModal

**Files:**
- Create: `src/components/campaigns/InviteToCampaignModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `src/components/campaigns/InviteToCampaignModal.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useInviteCreator } from '@/hooks/useCampaignInvitations';
import { Send } from 'lucide-react';

interface InviteToCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorId: string;
  creatorName: string;
}

export function InviteToCampaignModal({ open, onOpenChange, creatorId, creatorName }: InviteToCampaignModalProps) {
  const { user } = useAuth();
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [message, setMessage] = useState('');
  const inviteCreator = useInviteCreator();

  const { data: campaigns } = useQuery({
    queryKey: ['my-published-campaigns', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, title, status, creator_count, ai_analysis')
        .eq('user_id', user!.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const handleSend = () => {
    if (!selectedCampaignId) return;

    inviteCreator.mutate(
      { campaignId: selectedCampaignId, creatorId, message: message || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedCampaignId('');
          setMessage('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite {creatorName} to Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Select a Campaign</label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a campaign..." />
              </SelectTrigger>
              <SelectContent>
                {(campaigns || []).map((c) => {
                  const emoji = (c.ai_analysis as any)?.emoji || '📣';
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {emoji} {c.title} — {c.creator_count || '?'} spots
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Personal Note (optional)</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell them why you think they'd be a great fit..."
              className="mt-1 resize-none"
              rows={3}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={!selectedCampaignId || inviteCreator.isPending}
            className="w-full rounded-full bg-dc-teal text-white font-bold"
          >
            <Send className="h-4 w-4 mr-2" />
            {inviteCreator.isPending ? 'Sending...' : 'Send Invitation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add "Invite to Campaign" button on creator profile pages**

Find the creator profile/portfolio page where a business views a creator. Add the button and modal. This will vary based on the component — look for the existing "Message" or "View Portfolio" button and add "Invite to Campaign" alongside it:

```tsx
import { InviteToCampaignModal } from '@/components/campaigns/InviteToCampaignModal';

// In the component:
const [showInviteModal, setShowInviteModal] = useState(false);

// In the JSX, near other action buttons:
<Button
  onClick={() => setShowInviteModal(true)}
  className="w-full rounded-full bg-dc-teal text-white font-bold"
>
  Invite to Campaign
</Button>

<InviteToCampaignModal
  open={showInviteModal}
  onOpenChange={setShowInviteModal}
  creatorId={creatorProfile.user_id}
  creatorName={creatorProfile.creator_name}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 4: Test in browser**

Run `npm run dev`. Navigate to a creator's profile as a business user. Verify:
- "Invite to Campaign" button appears
- Modal opens with campaign dropdown
- Selecting a campaign and sending works
- Toast confirms success

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/InviteToCampaignModal.tsx
git commit -m "feat: create InviteToCampaignModal for inviting creators from profile pages"
```

---

## Task 10: Add invitation notifications to bell icon

**Files:**
- Modify: `src/hooks/useNotifications.ts:8` (Notification type union)
- Modify: `src/hooks/useNotifications.ts:438` (after likesChannel subscription, before cleanup return)
- Modify: `src/hooks/useNotifications.ts:440-444` (cleanup return — add new channel)
- Modify: `src/components/notifications/NotificationDropdown.tsx:42-59` (click handler)

- [ ] **Step 1: Add `campaign_invitation` to Notification type**

In `src/hooks/useNotifications.ts`, update the type union on line 8:

```typescript
type: 'application_received' | 'application_status_changed' | 'milestone_completed' | 'sponsorship_proposal_received' | 'sponsorship_status_changed' | 'content_liked' | 'campaign_invitation';
```

- [ ] **Step 2: Add realtime subscription for campaign_invitations**

After the existing `likesChannel` subscription (around line 438, after `.subscribe()`), add a new channel before the cleanup `return`:

```typescript
// Set up real-time subscription for campaign invitations
const invitationChannel = supabase
  .channel('invitation-updates')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'campaign_invitations',
      filter: `creator_id=eq.${user.id}`,
    },
    async (payload) => {
      console.log('New campaign invitation received:', payload);

      // Fetch campaign title for the notification message
      let campaignTitle = 'a campaign';
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title')
          .eq('id', payload.new.campaign_id)
          .single();
        if (campaign) campaignTitle = campaign.title;
      } catch {}

      toast({
        title: 'Campaign Invitation!',
        description: `You've been invited to "${campaignTitle}"`,
      });

      const notification: Notification = {
        id: `invite-${payload.new.id}`,
        type: 'campaign_invitation',
        title: 'Campaign Invitation',
        message: `You've been invited to "${campaignTitle}"`,
        read: false,
        created_at: new Date().toISOString(),
        data: { campaign_id: payload.new.campaign_id, invitation_id: payload.new.id },
      };

      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    }
  )
  .subscribe();
```

Update the existing cleanup return (lines 440-444) to include the new channel. Add `invitationChannel` to the existing list:

```typescript
return () => {
  supabase.removeChannel(applicationChannel);
  supabase.removeChannel(sponsorshipChannel);
  supabase.removeChannel(likesChannel);
  supabase.removeChannel(invitationChannel);
};
```

- [ ] **Step 3: Add notification routing in NotificationDropdown**

In `src/components/notifications/NotificationDropdown.tsx`, add a new case in `handleNotificationClick` (around line 56):

```typescript
} else if (notification.type === 'campaign_invitation') {
  if (notification.data?.campaign_id) {
    navigate(`/dashboard/creator/campaigns/${notification.data.campaign_id}?invited=true`);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotifications.ts src/components/notifications/NotificationDropdown.tsx
git commit -m "feat: add campaign invitation notifications to bell icon"
```

---

## Task 11: Add invitation banner to creator campaign detail page

**Files:**
- Create: `src/components/campaign-details/InvitationBanner.tsx`
- Modify: `src/components/campaign-details/CreatorCampaignDetails.tsx:22-42`
- Modify: `src/pages/CampaignDetailsPage.tsx:21-26`

- [ ] **Step 1: Create InvitationBanner component**

Create `src/components/campaign-details/InvitationBanner.tsx`:

```tsx
interface InvitationBannerProps {
  businessName?: string;
}

export function InvitationBanner({ businessName }: InvitationBannerProps) {
  return (
    <div className="bg-amber-50 border-b border-amber-300 px-5 py-3 flex items-center gap-3">
      <span className="text-xl">📩</span>
      <div>
        <p className="text-sm font-semibold text-amber-900">You're invited!</p>
        <p className="text-xs text-amber-700">
          {businessName ? `${businessName} personally invited you to this campaign` : 'You were personally invited to this campaign'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Read `?invited=true` query param and check DB for pending invitation**

In `src/pages/CampaignDetailsPage.tsx`, after the existing `useLocation()` call (line 21), extract the query param and also check the DB as a fallback (so creators who navigate directly still see the banner):

```typescript
import { useQuery } from '@tanstack/react-query';

const searchParams = new URLSearchParams(location.search);
const isInvitedByParam = searchParams.get('invited') === 'true';

// Fallback: check if a pending invitation exists for this user+campaign
const { data: pendingInvitation } = useQuery({
  queryKey: ['pending-invitation', id, user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('campaign_invitations')
      .select('id')
      .eq('campaign_id', id!)
      .eq('creator_id', user!.id)
      .eq('status', 'pending')
      .maybeSingle();
    return data;
  },
  enabled: !!id && !!user && isCreatorView,
});

const isInvited = isInvitedByParam || !!pendingInvitation;
```

Pass it to `CreatorCampaignDetails`:

```tsx
<CreatorCampaignDetails campaign={campaign} isInvited={isInvited} />
```

- [ ] **Step 3: Update CreatorCampaignDetails to accept and render banner**

In `src/components/campaign-details/CreatorCampaignDetails.tsx`, add the `isInvited` prop and render the banner:

```typescript
import { InvitationBanner } from './InvitationBanner';

interface CreatorCampaignDetailsProps {
  campaign: Campaign;
  isInvited?: boolean;
}

export function CreatorCampaignDetails({ campaign, isInvited }: CreatorCampaignDetailsProps) {
```

Insert the banner between `CampaignHero` and the content div (after line 42):

```tsx
<CampaignHero campaign={campaign} />

{isInvited && (
  <InvitationBanner
    businessName={(campaign.ai_analysis as any)?.business_name}
  />
)}

<div className="px-5 pt-4 pb-6">
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 5: Test in browser**

Run `npm run dev`. Navigate to `/dashboard/creator/campaigns/:id?invited=true`. Verify:
- Yellow "You're invited!" banner appears below the hero
- Without `?invited=true`, the banner does not show

- [ ] **Step 6: Commit**

```bash
git add src/components/campaign-details/InvitationBanner.tsx src/components/campaign-details/CreatorCampaignDetails.tsx src/pages/CampaignDetailsPage.tsx
git commit -m "feat: add invitation banner to creator campaign detail page"
```

---

## Task 12: Create conversation campaign header

**Files:**
- Create: `src/components/messaging/CampaignConversationHeader.tsx`

- [ ] **Step 1: Create the header component**

Create `src/components/messaging/CampaignConversationHeader.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink } from 'lucide-react';

interface CampaignConversationHeaderProps {
  campaignId: string;
}

export function CampaignConversationHeader({ campaignId }: CampaignConversationHeaderProps) {
  const navigate = useNavigate();

  const { data: campaign } = useQuery({
    queryKey: ['campaign-header', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, title, status, ai_analysis')
        .eq('id', campaignId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });

  if (!campaign) return null;

  const emoji = (campaign.ai_analysis as any)?.emoji || '📣';
  const statusColors: Record<string, string> = {
    published: 'bg-green-100 text-green-700',
    active: 'bg-blue-100 text-blue-700',
    draft: 'bg-gray-100 text-gray-600',
    completed: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 flex items-center gap-2">
      <span className="text-lg">{emoji}</span>
      <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{campaign.title}</span>
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[campaign.status] || 'bg-gray-100 text-gray-600'}`}>
        {campaign.status}
      </span>
      <button
        onClick={() => navigate(`/dashboard/creator/campaigns/${campaign.id}`)}
        className="text-teal-500 hover:text-teal-600"
        aria-label="View campaign details"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into DirectConversationPage**

In `src/pages/DirectConversationPage.tsx`, the conversation object is fetched via `useConversations()` (line 15) and the current one is found on line 23: `const conversation = conversations.find(c => c.conversation_id === conversationId)`. The conversation type from `useConversations` includes `campaign_id: string | null` (from `src/hooks/useConversations.ts:15`).

Add the import and render the header below the chat header div (after line 86, below the `<ArrowLeft>` back button section):

```tsx
import { CampaignConversationHeader } from '@/components/messaging/CampaignConversationHeader';

// After the closing </div> of the chat header (around line 100), before the message thread:
{conversation?.campaign_id && (
  <CampaignConversationHeader campaignId={conversation.campaign_id} />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/components/messaging/CampaignConversationHeader.tsx
git commit -m "feat: create campaign conversation header banner for campaign-linked chats"
```

---

## Task 13: Update invitation status on application submission

**Files:**
- Modify: `src/hooks/useCreateApplication.ts:56-93` (onSuccess handler)

- [ ] **Step 1: Add invitation status update to onSuccess**

In `src/hooks/useCreateApplication.ts`, inside the `onSuccess` handler (after the existing email notification logic around line 90), add:

```typescript
// Update invitation status to 'accepted' if creator was invited
try {
  await supabase
    .from('campaign_invitations')
    .update({ status: 'accepted' })
    .eq('campaign_id', data.campaign_id)
    .eq('creator_id', user!.id)
    .eq('status', 'pending');
} catch (invErr) {
  console.error('Failed to update invitation status:', invErr);
}
```

This goes inside the `onSuccess` callback, after the email notification `try/catch` block (after line 93). If no pending invitation exists for this user+campaign, the update is a no-op.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreateApplication.ts
git commit -m "feat: update invitation status to accepted when creator submits application"
```

---

## Task 14: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation**

Run: `npx tsc --noEmit`

Expected: Clean compile with no errors.

- [ ] **Step 2: Build check**

Run: `npm run build`

Expected: Successful build.

- [ ] **Step 3: Deploy edge functions**

Deploy the new and modified edge functions:
```bash
supabase functions deploy send-campaign-invitation
supabase functions deploy donny-chat
supabase functions deploy send-notification-email
```

- [ ] **Step 4: End-to-end test — Donny entry point**

1. Log in as a business user
2. Navigate to a published campaign
3. Open Donny chat
4. Say "invite [creator name] to this campaign"
5. Verify Donny confirms the invitation
6. Log in as the invited creator
7. Verify: bell notification appears, Donny has a proactive message with "View Campaign" + "Decide Later" buttons
8. Click "View Campaign" — verify campaign detail page shows with yellow invitation banner
9. Apply to the campaign — verify invitation status updates to "accepted"

- [ ] **Step 5: End-to-end test — Campaign page entry point**

1. Log in as a business user
2. Navigate to a campaign → AI Match tab
3. Click "Invite" on a creator card
4. Verify toast confirms success, button changes to "Invited"
5. Verify creator receives notification + Donny message

- [ ] **Step 6: End-to-end test — Creator profile entry point**

1. Log in as a business user
2. Navigate to a creator's profile
3. Click "Invite to Campaign"
4. Select a campaign from dropdown, add optional note, send
5. Verify toast confirms, creator receives notification + Donny message

- [ ] **Step 7: Edge case test**

1. Try inviting the same creator twice — verify "Already invited" toast
2. Try inviting yourself — verify error
3. Navigate to campaign detail page WITHOUT `?invited=true` — verify no banner

- [ ] **Step 8: Commit any cleanup**

```bash
git add -A
git commit -m "chore: integration cleanup for campaign invitations feature"
```
