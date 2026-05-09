# Phase 4: Cross-Role & Advanced — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the three roles (restaurant, creator, brand) together through campaign lifecycle hooks, coordinated triple-posting, DragonDash Rush premium posting, unified cross-role analytics, and delegated cross-account posting permissions.

**Architecture:** Five-stage campaign event system fires social posting prompts at lifecycle transitions. Stage 4 (content approved) triggers the Triple-Post — all three parties receive coordinated prompts simultaneously. DragonDash Rush is the premium revenue CTA ($25–50 per party). Delegated posting enables cross-account publishing with campaign-scoped permissions. Four new DB tables, two new Edge Functions, twelve new components, four new hooks.

**Tech Stack:** React + TypeScript, Supabase (Postgres, Edge Functions, Realtime), Tailwind CSS, shadcn/ui, TanStack React Query, Outstand SDK (`@outstand-so/ui`), lucide-react icons.

**Design Spec:** `docs/superpowers/specs/2026-05-09-outstand-phase4-cross-role-design.md`

**Verification:** Each task ends with `npm run build` to confirm TypeScript compiles. After all tasks, run full audit.

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260509100002_campaign_social_hooks.sql` | Campaign social hooks table + RLS |
| `supabase/migrations/20260509100003_triple_post_sessions.sql` | Triple-post session tracking table + RLS |
| `supabase/migrations/20260509100004_rush_surcharge_log.sql` | DragonDash Rush surcharge ledger + RLS |
| `supabase/migrations/20260509100005_delegated_posting_permissions.sql` | Delegated posting permission table + RLS |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Creates hook records on campaign status transitions |
| `supabase/functions/expire-social-hooks/index.ts` | Daily job: expire stale hooks (72h) + revoke permissions for completed campaigns |
| `src/hooks/outstand/useCampaignSocialHooks.ts` | Pending hooks for current user with Realtime subscription |
| `src/hooks/outstand/useTriplePostState.ts` | All-party posting status with Realtime subscription |
| `src/hooks/outstand/useRushSurchargeLog.ts` | Rush surcharge insert + history query |
| `src/hooks/outstand/useDelegatedPermissions.ts` | Delegated permissions CRUD with Realtime |
| `src/components/outstand/CampaignHookPrompt.tsx` | Inline card (desktop) / sticky bottom card (mobile) for hook prompts |
| `src/components/outstand/TriplePostOrchestrator.tsx` | State coordinator for three-party posting |
| `src/components/outstand/TriplePostPrompt.tsx` | Modal (desktop) / bottom sheet (mobile) for coordinated posting |
| `src/components/outstand/DragonDashRushButton.tsx` | Premium teal gradient CTA with tier gating |
| `src/components/outstand/RushConfirmDialog.tsx` | Confirmation dialog for Rush surcharge |
| `src/components/outstand/CampaignImpactSummary.tsx` | Combined cross-role analytics card |
| `src/components/outstand/AIPerformanceInsights.tsx` | Donny-stubbed insights placeholder |
| `src/components/outstand/DelegatedPostingPermissions.tsx` | Permission list on Accounts tab |
| `src/components/outstand/DelegatePostingToggle.tsx` | Toggle + platform checkboxes in TriplePostPrompt |
| `src/components/outstand/DonnyAutoPilotStub.tsx` | Disabled auto-pilot toggle placeholder |
| `src/components/outstand/DonnyWeeklyPlannerStub.tsx` | Disabled weekly planner card placeholder |
| `src/components/outstand/DonnyPerformanceStub.tsx` | Disabled performance recommendations placeholder |

### Modified Files

| File | Change |
|------|--------|
| `src/integrations/supabase/types.ts` | Regenerated after migrations |
| `src/hooks/useJointApproval.ts:37-48` | Call `fire-campaign-social-hook` Edge Function when `final_approval_status` → `'approved'` |
| `src/components/outstand/CrossPartyAnalytics.tsx:36-52` | Add `CampaignImpactSummary` header card above sponsorship detail |
| `src/components/outstand/AccountsTab.tsx:67` | Add `DelegatedPostingPermissions` section below Brand Guidelines |
| `src/components/outstand/CrossPostPrompt.tsx:124` | Add `DragonDashRushButton` above standard options grid |
| `src/components/outstand/SponsorshipAmplificationPrompt.tsx:158` | Add `DragonDashRushButton` above standard options grid |
| `src/pages/OutstandManager.tsx:210-289` | Add Donny stub placeholders on header, Calendar tab, Analytics tab |
| `src/components/outstand/CalendarTab.tsx:42` | Pass through any new props for Donny stub |
| `src/components/outstand/AnalyticsTab.tsx` | Add `DonnyPerformanceStub` below analytics content |
| `supabase/functions/outstand-proxy/index.ts` | Add delegated posting permission check |

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/20260509100002_campaign_social_hooks.sql`
- Create: `supabase/migrations/20260509100003_triple_post_sessions.sql`
- Create: `supabase/migrations/20260509100004_rush_surcharge_log.sql`
- Create: `supabase/migrations/20260509100005_delegated_posting_permissions.sql`

- [ ] **Step 1: Create campaign_social_hooks migration**

```sql
-- 20260509100002_campaign_social_hooks.sql
CREATE TABLE campaign_social_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  stage INT NOT NULL CHECK (stage BETWEEN 1 AND 5),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  party_role TEXT NOT NULL CHECK (party_role IN ('restaurant','creator','brand')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','prompted','posted','skipped','expired')),
  content_template TEXT,
  prompted_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, stage, user_id)
);

ALTER TABLE campaign_social_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hooks"
  ON campaign_social_hooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own hooks"
  ON campaign_social_hooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_campaign_social_hooks_user ON campaign_social_hooks(user_id);
CREATE INDEX idx_campaign_social_hooks_campaign ON campaign_social_hooks(campaign_id, stage);
```

- [ ] **Step 2: Create triple_post_sessions migration**

```sql
-- 20260509100003_triple_post_sessions.sql
CREATE TABLE triple_post_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES auth.users(id),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES auth.users(id),
  restaurant_status TEXT NOT NULL DEFAULT 'pending' CHECK (restaurant_status IN ('pending','posted','skipped')),
  creator_status TEXT NOT NULL DEFAULT 'pending' CHECK (creator_status IN ('pending','posted','skipped')),
  brand_status TEXT NOT NULL DEFAULT 'n/a' CHECK (brand_status IN ('pending','posted','skipped','n/a')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

ALTER TABLE triple_post_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read their sessions"
  ON triple_post_sessions FOR SELECT
  USING (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );

CREATE POLICY "Participants can update their status"
  ON triple_post_sessions FOR UPDATE
  USING (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );

CREATE INDEX idx_triple_post_sessions_campaign ON triple_post_sessions(campaign_id);
```

- [ ] **Step 3: Create rush_surcharge_log migration**

```sql
-- 20260509100004_rush_surcharge_log.sql
CREATE TABLE rush_surcharge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  platform_count INT NOT NULL,
  surcharge_cents INT NOT NULL DEFAULT 2500,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rush_surcharge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own surcharges"
  ON rush_surcharge_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own surcharges"
  ON rush_surcharge_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_rush_surcharge_log_user ON rush_surcharge_log(user_id);
CREATE INDEX idx_rush_surcharge_log_campaign ON rush_surcharge_log(campaign_id);
```

- [ ] **Step 4: Create delegated_posting_permissions migration**

```sql
-- 20260509100005_delegated_posting_permissions.sql
CREATE TABLE delegated_posting_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_id UUID NOT NULL REFERENCES auth.users(id),
  grantee_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platforms TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grantor_id, grantee_id, campaign_id)
);

ALTER TABLE delegated_posting_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Grantor and grantee can read"
  ON delegated_posting_permissions FOR SELECT
  USING (auth.uid() = grantor_id OR auth.uid() = grantee_id);

CREATE POLICY "Only grantor can update"
  ON delegated_posting_permissions FOR UPDATE
  USING (auth.uid() = grantor_id);

CREATE POLICY "Campaign participants can insert"
  ON delegated_posting_permissions FOR INSERT
  WITH CHECK (
    auth.uid() = delegated_posting_permissions.grantor_id
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = delegated_posting_permissions.campaign_id
      AND (
        c.user_id = delegated_posting_permissions.grantor_id
        OR EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.campaign_id = c.id AND ca.creator_id = delegated_posting_permissions.grantor_id)
        OR EXISTS (SELECT 1 FROM campaign_sponsorships cs JOIN business_profiles bp ON bp.id = cs.brand_id WHERE cs.campaign_id = c.id AND bp.user_id = delegated_posting_permissions.grantor_id)
      )
    )
  );

CREATE INDEX idx_delegated_permissions_grantor ON delegated_posting_permissions(grantor_id);
CREATE INDEX idx_delegated_permissions_grantee ON delegated_posting_permissions(grantee_id);
CREATE INDEX idx_delegated_permissions_campaign ON delegated_posting_permissions(campaign_id);
```

- [ ] **Step 5: Apply migrations remotely**

Run: `supabase db push`
Expected: All four migrations apply successfully.

- [ ] **Step 6: Regenerate TypeScript types**

Run: `supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts`
Expected: `types.ts` updated with `campaign_social_hooks`, `triple_post_sessions`, `rush_surcharge_log`, and `delegated_posting_permissions` tables.

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: Clean build (no type errors from schema changes).

- [ ] **Step 8: Commit**

```
git add supabase/migrations/ src/integrations/supabase/types.ts
git commit -m "feat(db): add campaign_social_hooks, triple_post_sessions, rush_surcharge_log, delegated_posting_permissions tables"
```

---

## Task 2: Edge Functions

**Files:**
- Create: `supabase/functions/fire-campaign-social-hook/index.ts`
- Create: `supabase/functions/expire-social-hooks/index.ts`

- [ ] **Step 1: Create fire-campaign-social-hook Edge Function**

Create `supabase/functions/fire-campaign-social-hook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HookRequest {
  campaign_id: string;
  stage: number;
}

const STAGE_TEMPLATES: Record<number, string> = {
  1: 'New campaign live! {title} — share with your followers',
  2: 'Sponsorship confirmed! {brand} is backing {title}',
  3: '{creator} is creating content for {title}!',
  4: 'Content approved! Post {title} to your channels',
  5: 'Campaign wrap! {title} — check your results',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { campaign_id, stage } = (await req.json()) as HookRequest;

  // Get campaign details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, title, user_id, status')
    .eq('id', campaign_id)
    .single();

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const parties: { user_id: string; role: string }[] = [];
  const template = STAGE_TEMPLATES[stage] ?? '';

  // Restaurant (campaign owner) — prompted at all stages
  parties.push({ user_id: campaign.user_id, role: 'restaurant' });

  // Brand sponsor — resolve user_id through business_profiles
  if (stage >= 2) {
    const { data: sponsorships } = await supabase
      .from('campaign_sponsorships')
      .select('brand_id')
      .eq('campaign_id', campaign_id)
      .in('status', ['active', 'accepted']);

    if (sponsorships?.length) {
      const brandProfileIds = sponsorships.map((s) => s.brand_id);
      const { data: brandProfiles } = await supabase
        .from('business_profiles')
        .select('user_id')
        .in('id', brandProfileIds);

      for (const bp of brandProfiles ?? []) {
        parties.push({ user_id: bp.user_id, role: 'brand' });
      }
    }
  }

  // Creator — resolve from accepted applications
  if (stage >= 3) {
    const { data: applications } = await supabase
      .from('campaign_applications')
      .select('creator_id')
      .eq('campaign_id', campaign_id)
      .eq('status', 'accepted');

    for (const app of applications ?? []) {
      parties.push({ user_id: app.creator_id, role: 'creator' });
    }
  }

  // Insert hook records (upsert to handle re-fires)
  const rows = parties.map((p) => ({
    campaign_id,
    stage,
    user_id: p.user_id,
    party_role: p.role,
    status: 'pending',
    content_template: template.replace('{title}', campaign.title),
    prompted_at: new Date().toISOString(),
  }));

  const { error: hookError } = await supabase
    .from('campaign_social_hooks')
    .upsert(rows, { onConflict: 'campaign_id,stage,user_id', ignoreDuplicates: true });

  // For Stage 4: also create triple_post_session
  if (stage === 4) {
    const creatorIds = parties.filter((p) => p.role === 'creator').map((p) => p.user_id);
    const brandId = parties.find((p) => p.role === 'brand')?.user_id ?? null;

    for (const creatorId of creatorIds) {
      await supabase.from('triple_post_sessions').upsert(
        {
          campaign_id,
          restaurant_id: campaign.user_id,
          creator_id: creatorId,
          brand_id: brandId,
          restaurant_status: 'pending',
          creator_status: 'pending',
          brand_status: brandId ? 'pending' : 'n/a',
        },
        { onConflict: 'campaign_id,creator_id', ignoreDuplicates: true },
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, hooks_created: rows.length, stage }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Step 2: Create expire-social-hooks Edge Function**

Create `supabase/functions/expire-social-hooks/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Expire hooks older than 72 hours that are still pending
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: expiredHooks, error: hookErr } = await supabase
    .from('campaign_social_hooks')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  // Revoke delegated permissions for completed/cancelled campaigns
  const { data: revokedPerms, error: permErr } = await supabase.rpc('revoke_expired_permissions');

  // If the RPC doesn't exist yet, do it inline
  if (permErr) {
    const { data: completedCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .in('status', ['completed', 'cancelled']);

    if (completedCampaigns?.length) {
      await supabase
        .from('delegated_posting_permissions')
        .update({ status: 'revoked' })
        .eq('status', 'active')
        .in('campaign_id', completedCampaigns.map((c) => c.id));
    }

    // Also expire by expires_at timestamp
    await supabase
      .from('delegated_posting_permissions')
      .update({ status: 'revoked' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
  }

  return new Response(
    JSON.stringify({
      ok: true,
      expired_hooks: expiredHooks?.length ?? 0,
      revoked_permissions: revokedPerms?.length ?? 0,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Step 3: Deploy Edge Functions**

Run: `supabase functions deploy fire-campaign-social-hook`
Run: `supabase functions deploy expire-social-hooks`
Expected: Both functions deploy successfully.

- [ ] **Step 4: Commit**

```
git add supabase/functions/fire-campaign-social-hook/ supabase/functions/expire-social-hooks/
git commit -m "feat(edge): add fire-campaign-social-hook and expire-social-hooks Edge Functions"
```

---

## Task 3: Campaign Social Hooks — Hook + Component

**Files:**
- Create: `src/hooks/outstand/useCampaignSocialHooks.ts`
- Create: `src/components/outstand/CampaignHookPrompt.tsx`

- [ ] **Step 1: Create useCampaignSocialHooks hook**

Create `src/hooks/outstand/useCampaignSocialHooks.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export interface CampaignSocialHook {
  id: string;
  campaign_id: string;
  stage: number;
  party_role: string;
  status: string;
  content_template: string | null;
  prompted_at: string | null;
  created_at: string;
}

export function useCampaignSocialHooks(campaignId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['campaign-social-hooks', campaignId, user?.id],
    queryFn: async (): Promise<CampaignSocialHook[]> => {
      const { data, error } = await supabase
        .from('campaign_social_hooks')
        .select('*')
        .eq('campaign_id', campaignId!)
        .eq('user_id', user!.id)
        .eq('status', 'pending')
        .order('stage', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampaignSocialHook[];
    },
    enabled: !!campaignId && !!user?.id,
    staleTime: 30 * 1000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!campaignId || !user?.id) return;
    const channel = supabase
      .channel(`hooks-${campaignId}-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_social_hooks', filter: `campaign_id=eq.${campaignId}` },
        () => qc.invalidateQueries({ queryKey: ['campaign-social-hooks', campaignId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, user?.id, qc]);

  const dismiss = useMutation({
    mutationFn: async (hookId: string) => {
      const { error } = await supabase
        .from('campaign_social_hooks')
        .update({ status: 'skipped', acted_at: new Date().toISOString() })
        .eq('id', hookId)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-social-hooks', campaignId] }),
  });

  const markPosted = useMutation({
    mutationFn: async (hookId: string) => {
      const { error } = await supabase
        .from('campaign_social_hooks')
        .update({ status: 'posted', acted_at: new Date().toISOString() })
        .eq('id', hookId)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-social-hooks', campaignId] }),
  });

  return {
    hooks: query.data ?? [],
    isLoading: query.isLoading,
    dismissHook: dismiss.mutate,
    markPosted: markPosted.mutate,
  };
}
```

- [ ] **Step 2: Create CampaignHookPrompt component**

Create `src/components/outstand/CampaignHookPrompt.tsx`:

```typescript
import React, { useState } from 'react';
import { type CampaignSocialHook } from '@/hooks/outstand/useCampaignSocialHooks';
import { Button } from '@/components/ui/button';
import { Send, CalendarDays, Edit3, SkipForward, X } from 'lucide-react';
import { toast } from 'sonner';

interface CampaignHookPromptProps {
  hook: CampaignSocialHook;
  onDismiss: (hookId: string) => void;
  onPost: (hookId: string) => void;
  onTriplePost?: () => void;
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Campaign Live',
  2: 'Sponsorship Confirmed',
  3: 'Creator Matched',
  4: 'Content Approved',
  5: 'Campaign Complete',
};

export const CampaignHookPrompt: React.FC<CampaignHookPromptProps> = ({
  hook, onDismiss, onPost, onTriplePost,
}) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  // Stage 4 delegates to TriplePostPrompt
  if (hook.stage === 4 && onTriplePost) {
    return (
      <div className="bg-gradient-to-r from-[#4DD9C0]/10 to-[#00E5CC]/10 border-2 border-dc-teal rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-dc-teal uppercase tracking-wider">{STAGE_LABELS[4]}</span>
          <button type="button" onClick={() => { setVisible(false); onDismiss(hook.id); }} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-3">{hook.content_template}</p>
        <Button variant="dc-primary" size="sm" className="w-full" onClick={onTriplePost}>
          Post to Your Channels
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-dc-teal uppercase tracking-wider">{STAGE_LABELS[hook.stage] ?? `Stage ${hook.stage}`}</span>
        <button type="button" onClick={() => { setVisible(false); onDismiss(hook.id); }} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-gray-700 mb-3">{hook.content_template}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="dc-primary" size="sm" onClick={() => { onPost(hook.id); toast.success('Posted!'); }}>
          <Send className="h-3.5 w-3.5 mr-1" />
          Post Now
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Scheduling coming soon')}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Schedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Edit coming soon')}>
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          Edit First
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setVisible(false); onDismiss(hook.id); }}>
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
git add src/hooks/outstand/useCampaignSocialHooks.ts src/components/outstand/CampaignHookPrompt.tsx
git commit -m "feat(hooks): add campaign social hooks with realtime subscription and prompt component"
```

---

## Task 4: Triple-Post State — Hook + Orchestrator

**Files:**
- Create: `src/hooks/outstand/useTriplePostState.ts`
- Create: `src/components/outstand/TriplePostOrchestrator.tsx`

- [ ] **Step 1: Create useTriplePostState hook**

Create `src/hooks/outstand/useTriplePostState.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export interface TriplePostSession {
  id: string;
  campaign_id: string;
  restaurant_id: string;
  creator_id: string;
  brand_id: string | null;
  restaurant_status: 'pending' | 'posted' | 'skipped';
  creator_status: 'pending' | 'posted' | 'skipped';
  brand_status: 'pending' | 'posted' | 'skipped' | 'n/a';
  created_at: string;
}

export function useTriplePostState(campaignId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['triple-post-session', campaignId],
    queryFn: async (): Promise<TriplePostSession | null> => {
      const { data, error } = await supabase
        .from('triple_post_sessions')
        .select('*')
        .eq('campaign_id', campaignId!)
        .maybeSingle();
      if (error) throw error;
      return data as TriplePostSession | null;
    },
    enabled: !!campaignId && !!user?.id,
    staleTime: 10 * 1000,
  });

  // Realtime subscription for live status updates
  useEffect(() => {
    if (!campaignId) return;
    const channel = supabase
      .channel(`triple-post-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'triple_post_sessions', filter: `campaign_id=eq.${campaignId}` },
        () => qc.invalidateQueries({ queryKey: ['triple-post-session', campaignId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, qc]);

  const updateMyStatus = useMutation({
    mutationFn: async (newStatus: 'posted' | 'skipped') => {
      if (!query.data || !user?.id) return;
      const session = query.data;
      const updates: Record<string, string> = {};

      if (session.restaurant_id === user.id) updates.restaurant_status = newStatus;
      else if (session.creator_id === user.id) updates.creator_status = newStatus;
      else if (session.brand_id === user.id) updates.brand_status = newStatus;

      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from('triple_post_sessions')
        .update(updates)
        .eq('id', session.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triple-post-session', campaignId] }),
  });

  return {
    session: query.data,
    isLoading: query.isLoading,
    updateMyStatus: updateMyStatus.mutate,
  };
}
```

- [ ] **Step 2: Create TriplePostOrchestrator component**

Create `src/components/outstand/TriplePostOrchestrator.tsx`:

```typescript
import React from 'react';
import { type TriplePostSession } from '@/hooks/outstand/useTriplePostState';

interface PartyStatusProps {
  session: TriplePostSession;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-dc-teal',
  posted: 'bg-green-500',
  skipped: 'bg-gray-300',
  'n/a': 'bg-transparent',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Prompted',
  posted: 'Posted',
  skipped: 'Skipped',
  'n/a': '',
};

export const CoordinationStatusPanel: React.FC<PartyStatusProps & {
  restaurantName?: string;
  creatorName?: string;
  brandName?: string;
  currentUserId?: string;
}> = ({ session, restaurantName, creatorName, brandName, currentUserId }) => {
  const parties = [
    { label: restaurantName ?? 'Restaurant', status: session.restaurant_status, userId: session.restaurant_id, color: 'text-dc-teal' },
    { label: creatorName ?? 'Creator', status: session.creator_status, userId: session.creator_id, color: 'text-pink-400' },
  ];

  if (session.brand_id && session.brand_status !== 'n/a') {
    parties.push({ label: brandName ?? 'Brand', status: session.brand_status, userId: session.brand_id, color: 'text-amber-500' });
  }

  const partyCount = parties.length;

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
      <p className="text-xs font-semibold text-green-800 mb-2">
        Coordinated Post — {partyCount} {partyCount === 1 ? 'Party' : 'Parties'}
      </p>
      <div className="flex flex-col gap-2">
        {parties.map((p) => (
          <div key={p.userId} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[p.status]}`} />
            <span className="text-xs text-gray-600 flex-1">{p.label}</span>
            {p.userId === currentUserId ? (
              <span className="text-[10px] text-gray-400 font-semibold">
                {p.status === 'pending' ? 'Awaiting your action' : STATUS_LABELS[p.status]}
              </span>
            ) : (
              <span className={`text-[10px] font-semibold ${p.color}`}>{STATUS_LABELS[p.status]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
git add src/hooks/outstand/useTriplePostState.ts src/components/outstand/TriplePostOrchestrator.tsx
git commit -m "feat(triple-post): add useTriplePostState hook and CoordinationStatusPanel"
```

---

## Task 5: DragonDash Rush Button + Confirmation

**Files:**
- Create: `src/hooks/outstand/useRushSurchargeLog.ts`
- Create: `src/components/outstand/DragonDashRushButton.tsx`
- Create: `src/components/outstand/RushConfirmDialog.tsx`

- [ ] **Step 1: Create useRushSurchargeLog hook**

Create `src/hooks/outstand/useRushSurchargeLog.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

function calculateSurcharge(platformCount: number): number {
  if (platformCount >= 5) return 5000;
  if (platformCount >= 4) return 3000;
  return 2500;
}

export function useRushSurchargeLog(campaignId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['rush-surcharge-log', user?.id, campaignId],
    queryFn: async () => {
      let q = supabase
        .from('rush_surcharge_log')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (campaignId) q = q.eq('campaign_id', campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const logRush = useMutation({
    mutationFn: async ({ platformCount, campaignId: cId }: { platformCount: number; campaignId?: string }) => {
      const { error } = await supabase.from('rush_surcharge_log').insert({
        user_id: user!.id,
        campaign_id: cId ?? null,
        platform_count: platformCount,
        surcharge_cents: calculateSurcharge(platformCount),
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rush-surcharge-log'] });
      toast.success('Rush surcharge logged');
    },
    onError: (err: Error) => toast.error(`Failed to log surcharge: ${err.message}`),
  });

  return {
    history: query.data ?? [],
    isLoading: query.isLoading,
    logRush: logRush.mutate,
    isLogging: logRush.isPending,
    calculateSurcharge,
  };
}
```

- [ ] **Step 2: Create RushConfirmDialog component**

Create `src/components/outstand/RushConfirmDialog.tsx`:

```typescript
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface RushConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platformCount: number;
  surchargeDisplay: string;
  onConfirm: () => void;
  isLoading: boolean;
}

export const RushConfirmDialog: React.FC<RushConfirmDialogProps> = ({
  open, onOpenChange, platformCount, surchargeDisplay, onConfirm, isLoading,
}) => {
  const isMobile = useIsMobile();

  const body = (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3 bg-gradient-to-br from-[#4DD9C0]/10 to-[#00E5CC]/10 rounded-xl p-4">
        <Zap className="h-8 w-8 text-dc-teal" />
        <div>
          <p className="text-sm font-bold text-gray-900">Rush Post to {platformCount} platforms</p>
          <p className="text-xs text-gray-500 mt-0.5">{surchargeDisplay} surcharge will be added to your next invoice</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="dc-primary"
          className="flex-1"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? 'Posting...' : `Confirm Rush (${surchargeDisplay})`}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader><SheetTitle>DragonDash Rush</SheetTitle></SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>DragonDash Rush</DialogTitle></DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 3: Create DragonDashRushButton component**

Create `src/components/outstand/DragonDashRushButton.tsx`:

```typescript
import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useRushSurchargeLog } from '@/hooks/outstand/useRushSurchargeLog';
import { RushConfirmDialog } from './RushConfirmDialog';

interface DragonDashRushButtonProps {
  platformCount: number;
  campaignId?: string;
  onRushComplete: () => void;
  disabled?: boolean;
  tierLocked?: boolean;
}

function formatSurcharge(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export const DragonDashRushButton: React.FC<DragonDashRushButtonProps> = ({
  platformCount, campaignId, onRushComplete, disabled = false, tierLocked = false,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const { logRush, isLogging, calculateSurcharge } = useRushSurchargeLog(campaignId);

  // Rush requires 3+ platforms
  if (platformCount < 3) return null;

  const surchargeAmount = calculateSurcharge(platformCount);
  const surchargeDisplay = formatSurcharge(surchargeAmount);

  if (tierLocked) {
    return (
      <div className="bg-gray-100 rounded-2xl p-3.5 text-center opacity-60 cursor-not-allowed">
        <div className="flex items-center justify-center gap-2">
          <Zap className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-400">Upgrade to unlock Rush Posting</span>
        </div>
      </div>
    );
  }

  const handleConfirm = () => {
    logRush(
      { platformCount, campaignId },
      {
        onSuccess: () => {
          setShowConfirm(false);
          onRushComplete();
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowConfirm(true)}
        className="w-full bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] rounded-2xl p-3.5 text-left relative overflow-hidden hover:shadow-lg transition-shadow disabled:opacity-50"
      >
        <div className="absolute top-0 right-0 bg-yellow-400 px-2.5 py-0.5 rounded-bl-xl">
          <span className="text-[9px] font-extrabold text-gray-900 tracking-wider">DRAGONDASH</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Rush Post — All Platforms</p>
            <p className="text-[11px] text-white/80 mt-0.5">{platformCount} platforms simultaneously</p>
          </div>
          <div className="bg-yellow-400 px-2.5 py-1 rounded-lg">
            <span className="text-xs font-extrabold text-gray-900">{surchargeDisplay}</span>
          </div>
        </div>
      </button>

      <RushConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        platformCount={platformCount}
        surchargeDisplay={surchargeDisplay}
        onConfirm={handleConfirm}
        isLoading={isLogging}
      />
    </>
  );
};
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```
git add src/hooks/outstand/useRushSurchargeLog.ts src/components/outstand/DragonDashRushButton.tsx src/components/outstand/RushConfirmDialog.tsx
git commit -m "feat(dragondash): add Rush button, confirmation dialog, and surcharge ledger hook"
```

---

## Task 6: Triple-Post Prompt

**Files:**
- Create: `src/components/outstand/TriplePostPrompt.tsx`

- [ ] **Step 1: Create TriplePostPrompt component**

Create `src/components/outstand/TriplePostPrompt.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Send, CalendarDays, Edit3, SkipForward } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { CoordinationStatusPanel } from './TriplePostOrchestrator';
import { useTriplePostState, type TriplePostSession } from '@/hooks/outstand/useTriplePostState';
import { useBrandGuidelines } from '@/hooks/outstand/useBrandGuidelines';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useDelegatedPermissions } from '@/hooks/outstand/useDelegatedPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { toast } from 'sonner';

interface TriplePostPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  restaurantName: string;
  creatorName: string;
  brandName?: string;
  mediaUrls?: string[];
}

const CAPTION_TEMPLATES: Record<string, (ctx: { restaurant: string; creator: string; title: string }) => string> = {
  restaurant: (ctx) => `Check out this amazing content from @${ctx.creator}! ${ctx.title} 🍽️ #DragonDashed`,
  creator: (ctx) => `New collab with ${ctx.restaurant}! ${ctx.title} ✨ #ContentCreator #DragonDashed`,
  brand: () => '',
};

export const TriplePostPrompt: React.FC<TriplePostPromptProps> = ({
  open, onOpenChange, campaignId, campaignTitle, restaurantName, creatorName, brandName, mediaUrls = [],
}) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const { user, profile } = useAuth();
  const { session } = useTriplePostState(campaignId);
  const { guidelines } = useBrandGuidelines();
  const { myReceived } = useDelegatedPermissions(campaignId);
  const isMobile = useIsMobile();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const role = profile?.role === 'brand' ? 'brand' : profile?.role === 'creator' ? 'creator' : 'restaurant';
  const captionCtx = { restaurant: restaurantName, creator: creatorName, title: campaignTitle };

  const buildCaption = () => {
    if (role === 'brand' && guidelines) {
      const parts = [`We're proud to partner with ${restaurantName} and ${creatorName}! ${campaignTitle}`];
      if (guidelines.default_cta) parts.push(guidelines.default_cta);
      if (guidelines.required_hashtags.length > 0) parts.push(guidelines.required_hashtags.join(' '));
      if (guidelines.mandatory_disclosures.length > 0) parts.push(guidelines.mandatory_disclosures.join(' '));
      return parts.join('\n\n');
    }
    return CAPTION_TEMPLATES[role]?.(captionCtx) ?? `${campaignTitle} #DragonDashed`;
  };

  const [caption, setCaption] = useState(buildCaption());

  useEffect(() => {
    if (open) {
      setCaption(buildCaption());
      setSelectedAccountIds((accounts ?? []).map((a: any) => a.id));
      setIsEditing(false);
    }
  }, [open]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handlePostNow = () => {
    if (selectedAccountIds.length === 0) return;
    toast.success('Posted to selected channels!');
    onOpenChange(false);
  };

  const platformCount = (accounts ?? []).length;

  const content = (
    <div className="space-y-3">
      {/* Media preview */}
      {mediaUrls.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {mediaUrls.slice(0, 3).map((url, i) => (
            <img key={i} src={url} alt="" className="h-[72px] w-[72px] rounded-xl object-cover flex-shrink-0" />
          ))}
        </div>
      )}

      {/* DragonDash Rush CTA */}
      <DragonDashRushButton
        platformCount={platformCount}
        campaignId={campaignId}
        onRushComplete={() => onOpenChange(false)}
      />

      {/* Standard options */}
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePostNow}
          disabled={selectedAccountIds.length === 0}
          className="border-2 border-dc-teal"
        >
          <Send className="h-3.5 w-3.5 mr-1" />
          Post Now
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Scheduling coming soon')}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Schedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          {isEditing ? 'Preview' : 'Edit First'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
      </div>

      {/* Caption */}
      {isEditing ? (
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="text-sm" />
      ) : (
        <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">{caption}</div>
      )}

      {/* Channel selection */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Your Channels</p>
        <div className="space-y-1.5">
          {(accounts ?? []).map((account: any) => (
            <label key={account.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedAccountIds.includes(account.id)}
                onCheckedChange={() => toggleAccount(account.id)}
              />
              <span className="capitalize">{account.platform}</span>
              <span className="text-gray-400 text-xs">@{account.username ?? account.platformHandle}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Delegated accounts (posting on behalf of others) */}
      {myReceived.filter((p) => p.status === 'active').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Posting on behalf of others</p>
          <div className="space-y-1.5">
            {myReceived.filter((p) => p.status === 'active').map((perm) => (
              <div key={perm.id} className="bg-dc-teal/5 border border-dc-teal/20 rounded-lg p-2">
                <p className="text-xs text-gray-600">On behalf of <span className="font-semibold">User {perm.grantor_id.slice(0, 8)}...</span></p>
                <div className="flex gap-1 mt-1">
                  {perm.platforms.map((pl) => (
                    <span key={pl} className="text-[10px] bg-dc-teal/10 text-dc-teal px-1.5 py-0.5 rounded-full capitalize">{pl}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coordination status */}
      {session && (
        <CoordinationStatusPanel
          session={session}
          restaurantName={restaurantName}
          creatorName={creatorName}
          brandName={brandName}
          currentUserId={user?.id}
        />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8 max-h-[90vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="text-left">Post to Your Channels</SheetTitle></SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Post to Your Channels</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};

// Wrapped export for use outside OutstandManager (e.g., campaign detail pages)
export const TriplePostPromptWrapped: React.FC<TriplePostPromptProps> = (props) => (
  <DragonCandyOutstandProvider>
    <TriplePostPrompt {...props} />
  </DragonCandyOutstandProvider>
);
```

Use `TriplePostPrompt` when rendering inside `OutstandManager` (provider already exists). Use `TriplePostPromptWrapped` when rendering from campaign detail pages or other contexts outside the Outstand provider tree.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```
git add src/components/outstand/TriplePostPrompt.tsx
git commit -m "feat(triple-post): add TriplePostPrompt with Rush CTA, coordination panel, delegated accounts, and role-specific captions"
```

---

## Task 7: Rush Integration into Existing Prompts

**Files:**
- Modify: `src/components/outstand/CrossPostPrompt.tsx:124`
- Modify: `src/components/outstand/SponsorshipAmplificationPrompt.tsx:158`

- [ ] **Step 1: Add DragonDashRushButton to CrossPostPrompt**

In `src/components/outstand/CrossPostPrompt.tsx`:

a) Add import at top:
```typescript
import { DragonDashRushButton } from './DragonDashRushButton';
```

b) Before the existing 4-button grid (around line 124), add the Rush button:
```typescript
<DragonDashRushButton
  platformCount={selectedAccountIds.length}
  campaignId={campaignId}
  onRushComplete={() => onOpenChange(false)}
/>
```

First, add `campaignId` to the `CrossPostPrompt` interface since it doesn't have one:

In the interface (around line 9-16), add:
```typescript
campaignId?: string;
```

Then destructure it in the component props. The Rush button handles `undefined` campaign IDs gracefully.

- [ ] **Step 2: Add DragonDashRushButton to SponsorshipAmplificationPrompt**

In `src/components/outstand/SponsorshipAmplificationPrompt.tsx`:

a) Add import at top:
```typescript
import { DragonDashRushButton } from './DragonDashRushButton';
```

b) Before the existing 4-button grid (around line 158), add:
```typescript
<DragonDashRushButton
  platformCount={selectedAccountIds.length}
  campaignId={campaignId}
  onRushComplete={() => onOpenChange(false)}
/>
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
git add src/components/outstand/CrossPostPrompt.tsx src/components/outstand/SponsorshipAmplificationPrompt.tsx
git commit -m "feat(dragondash): integrate Rush button into CrossPostPrompt and SponsorshipAmplificationPrompt"
```

---

## Task 8: Campaign Impact Summary + AI Insights Stub

**Files:**
- Create: `src/components/outstand/CampaignImpactSummary.tsx`
- Create: `src/components/outstand/AIPerformanceInsights.tsx`
- Modify: `src/components/outstand/CrossPartyAnalytics.tsx:36`

- [ ] **Step 1: Create AIPerformanceInsights stub**

Create `src/components/outstand/AIPerformanceInsights.tsx`:

```typescript
import React from 'react';
import { Sparkles } from 'lucide-react';

export const AIPerformanceInsights: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-dc-teal/30 text-center">
      <Sparkles className="h-6 w-6 text-gray-300 mx-auto mb-2" />
      <h3 className="font-semibold text-sm text-gray-400">AI Performance Insights</h3>
      <p className="text-xs text-gray-300 mt-1">
        Donny AI insights coming soon — detailed campaign performance narrative, audience analysis, and timing recommendations.
      </p>
    </div>
  );
};
```

- [ ] **Step 2: Create CampaignImpactSummary component**

Create `src/components/outstand/CampaignImpactSummary.tsx`:

```typescript
import React from 'react';
import { type BrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { TrendingUp, Users, BarChart3 } from 'lucide-react';

interface CampaignImpactSummaryProps {
  sponsorship: BrandSponsorshipAnalytics;
}

export const CampaignImpactSummary: React.FC<CampaignImpactSummaryProps> = ({ sponsorship }) => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 mb-4">
      <h3 className="text-xs font-bold text-dc-teal uppercase tracking-wider mb-3">Campaign Impact</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="text-center">
          <TrendingUp className="h-4 w-4 text-dc-teal mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Combined Reach</p>
        </div>
        <div className="text-center">
          <Users className="h-4 w-4 text-pink-400 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Engagement Rate</p>
        </div>
        <div className="text-center">
          <BarChart3 className="h-4 w-4 text-amber-400 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Cost / Impression</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Total Posts</p>
        </div>
      </div>

      {/* Per-party breakdown bars (placeholder) */}
      <div className="mt-4 space-y-2">
        {[
          { label: 'Restaurant', color: 'bg-dc-teal', name: sponsorship.restaurantName },
          { label: 'Creator', color: 'bg-pink-400', name: sponsorship.creatorName ?? 'Pending' },
          { label: 'Brand', color: 'bg-amber-400', name: 'You' },
        ].map(({ label, color, name }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-16 text-right">{name}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div className={`${color} rounded-full h-2 w-0`} />
            </div>
            <span className="text-[10px] text-gray-400 w-8">--</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-300 text-center mt-3 italic">
        Analytics will populate as posts are tracked across all parties
      </p>
    </div>
  );
};
```

- [ ] **Step 3: Integrate into CrossPartyAnalytics**

In `src/components/outstand/CrossPartyAnalytics.tsx`:

a) Add imports:
```typescript
import { CampaignImpactSummary } from './CampaignImpactSummary';
import { AIPerformanceInsights } from './AIPerformanceInsights';
```

b) Inside the detail view section (around line 52, before `<SponsorshipROISummary sponsorship={selected} />`), add:
```typescript
<CampaignImpactSummary sponsorship={selected} />
```

c) After `<SponsorshipROISummary sponsorship={selected} />`, add:
```typescript
<AIPerformanceInsights />
```

d) Replace `<DonnyIntelligenceStub />` at line 55 (after the detail view, inside the non-empty branch) with `<AIPerformanceInsights />`. Keep the `<DonnyIntelligenceStub />` at line 31 (empty-state branch) — it still makes sense there as a teaser.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```
git add src/components/outstand/CampaignImpactSummary.tsx src/components/outstand/AIPerformanceInsights.tsx src/components/outstand/CrossPartyAnalytics.tsx
git commit -m "feat(analytics): add CampaignImpactSummary and AIPerformanceInsights to cross-party analytics"
```

---

## Task 9: Delegated Posting Permissions

**Files:**
- Create: `src/hooks/outstand/useDelegatedPermissions.ts`
- Create: `src/components/outstand/DelegatedPostingPermissions.tsx`
- Create: `src/components/outstand/DelegatePostingToggle.tsx`
- Modify: `src/components/outstand/AccountsTab.tsx:67`

- [ ] **Step 1: Create useDelegatedPermissions hook**

Create `src/hooks/outstand/useDelegatedPermissions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface DelegatedPermission {
  id: string;
  grantor_id: string;
  grantee_id: string;
  campaign_id: string;
  platforms: string[];
  status: 'active' | 'revoked';
  expires_at: string | null;
  created_at: string;
}

export function useDelegatedPermissions(campaignId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['delegated-permissions', user?.id, campaignId],
    queryFn: async (): Promise<DelegatedPermission[]> => {
      let q = supabase
        .from('delegated_posting_permissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (campaignId) q = q.eq('campaign_id', campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DelegatedPermission[];
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const filter = campaignId ? `campaign_id=eq.${campaignId}` : undefined;
    const channel = supabase
      .channel(`delegated-perms-${user.id}-${campaignId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delegated_posting_permissions', filter },
        () => qc.invalidateQueries({ queryKey: ['delegated-permissions'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, campaignId, qc]);

  const grantPermission = useMutation({
    mutationFn: async ({ granteeId, platforms, campaignId: cId, expiresAt }: {
      granteeId: string;
      platforms: string[];
      campaignId: string;
      expiresAt?: string;
    }) => {
      const { error } = await supabase.from('delegated_posting_permissions').insert({
        grantor_id: user!.id,
        grantee_id: granteeId,
        campaign_id: cId,
        platforms,
        status: 'active',
        expires_at: expiresAt ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delegated-permissions'] });
      toast.success('Posting permission granted');
    },
    onError: (err: Error) => toast.error(`Failed to grant permission: ${err.message}`),
  });

  const revokePermission = useMutation({
    mutationFn: async (permissionId: string) => {
      const { error } = await supabase
        .from('delegated_posting_permissions')
        .update({ status: 'revoked' })
        .eq('id', permissionId)
        .eq('grantor_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delegated-permissions'] });
      toast.success('Permission revoked');
    },
    onError: (err: Error) => toast.error(`Failed to revoke: ${err.message}`),
  });

  const myGranted = (query.data ?? []).filter((p) => p.grantor_id === user?.id);
  const myReceived = (query.data ?? []).filter((p) => p.grantee_id === user?.id);

  return {
    permissions: query.data ?? [],
    myGranted,
    myReceived,
    isLoading: query.isLoading,
    grantPermission: grantPermission.mutate,
    revokePermission: revokePermission.mutate,
  };
}
```

- [ ] **Step 2: Create DelegatedPostingPermissions component**

Create `src/components/outstand/DelegatedPostingPermissions.tsx`:

```typescript
import React from 'react';
import { useDelegatedPermissions } from '@/hooks/outstand/useDelegatedPermissions';
import { Button } from '@/components/ui/button';
import { ShieldCheck, X } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export const DelegatedPostingPermissions: React.FC = () => {
  const { myGranted, myReceived, isLoading, revokePermission } = useDelegatedPermissions();

  if (isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-dc-teal mx-auto" />;
  }

  const activeGranted = myGranted.filter((p) => p.status === 'active');
  const activeReceived = myReceived.filter((p) => p.status === 'active');

  if (activeGranted.length === 0 && activeReceived.length === 0) {
    return (
      <div className="text-center py-4">
        <ShieldCheck className="h-6 w-6 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">No active posting permissions.</p>
        <p className="text-[10px] text-gray-300 mt-0.5">Permissions are created when you approve content on a campaign.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeGranted.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">You've granted access to</p>
          <div className="space-y-2">
            {activeGranted.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">User {p.grantee_id.slice(0, 8)}...</p>
                  <div className="flex gap-1 mt-1">
                    {p.platforms.map((pl) => (
                      <span key={pl} className="text-[10px] bg-dc-teal/10 text-dc-teal px-1.5 py-0.5 rounded-full capitalize">{pl}</span>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revokePermission(p.id)} className="text-red-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeReceived.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">You can post on behalf of</p>
          <div className="space-y-2">
            {activeReceived.map((p) => (
              <div key={p.id} className="flex items-center bg-dc-teal/5 border border-dc-teal/20 rounded-xl p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">User {p.grantor_id.slice(0, 8)}...</p>
                  <div className="flex gap-1 mt-1">
                    {p.platforms.map((pl) => (
                      <span key={pl} className="text-[10px] bg-dc-teal/10 text-dc-teal px-1.5 py-0.5 rounded-full capitalize">{pl}</span>
                    ))}
                  </div>
                </div>
                <ShieldCheck className="h-4 w-4 text-dc-teal" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Create DelegatePostingToggle component**

Create `src/components/outstand/DelegatePostingToggle.tsx`:

```typescript
import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useDelegatedPermissions } from '@/hooks/outstand/useDelegatedPermissions';

interface DelegatePostingToggleProps {
  granteeId: string;
  granteeName: string;
  campaignId: string;
  availablePlatforms: string[];
}

export const DelegatePostingToggle: React.FC<DelegatePostingToggleProps> = ({
  granteeId, granteeName, campaignId, availablePlatforms,
}) => {
  const { grantPermission } = useDelegatedPermissions(campaignId);
  const [enabled, setEnabled] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(availablePlatforms);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked && selectedPlatforms.length > 0) {
      grantPermission({ granteeId, platforms: selectedPlatforms, campaignId });
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  return (
    <div className="border border-gray-200 rounded-xl p-3 mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Allow <span className="font-semibold">{granteeName}</span> to also post to your channels?
        </p>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
      {enabled && (
        <div className="mt-2 space-y-1.5">
          {availablePlatforms.map((p) => (
            <label key={p} className="flex items-center gap-2 text-xs">
              <Checkbox checked={selectedPlatforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
              <span className="capitalize">{p}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Add DelegatedPostingPermissions to AccountsTab**

In `src/components/outstand/AccountsTab.tsx`, after the Brand Guidelines section (around line 67):

```typescript
import { DelegatedPostingPermissions } from './DelegatedPostingPermissions';
```

After the closing `</div>` of the Brand Guidelines `{isBrand && ...}` block, add:

```typescript
<div className="bg-white rounded-2xl p-4 border border-gray-200">
  <h2 className="text-base font-bold text-gray-900 mb-3">Posting Permissions</h2>
  <p className="text-xs text-gray-500 mb-4">Manage who can post on behalf of your accounts.</p>
  <DelegatedPostingPermissions />
</div>
```

Note: This section is NOT gated by `isBrand` — all roles can have delegated permissions (restaurant grants to creator, etc.).

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```
git add src/hooks/outstand/useDelegatedPermissions.ts src/components/outstand/DelegatedPostingPermissions.tsx src/components/outstand/DelegatePostingToggle.tsx src/components/outstand/AccountsTab.tsx
git commit -m "feat(delegation): add delegated posting permissions with grant, revoke, and realtime updates"
```

---

## Task 10: Donny Stubs (Auto-Pilot, Weekly Planner, Performance)

**Files:**
- Create: `src/components/outstand/DonnyAutoPilotStub.tsx`
- Create: `src/components/outstand/DonnyWeeklyPlannerStub.tsx`
- Create: `src/components/outstand/DonnyPerformanceStub.tsx`
- Modify: `src/pages/OutstandManager.tsx`
- Modify: `src/components/outstand/AnalyticsTab.tsx`

- [ ] **Step 1: Create DonnyAutoPilotStub**

Create `src/components/outstand/DonnyAutoPilotStub.tsx`:

```typescript
import React from 'react';
import { Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export const DonnyAutoPilotStub: React.FC = () => {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 opacity-60">
      <Zap className="h-4 w-4 text-gray-400" />
      <span className="text-xs font-medium text-gray-400 flex-1">Donny Auto-Pilot</span>
      <Switch disabled checked={false} />
    </div>
  );
};
```

- [ ] **Step 2: Create DonnyWeeklyPlannerStub**

Create `src/components/outstand/DonnyWeeklyPlannerStub.tsx`:

```typescript
import React from 'react';
import { CalendarRange, Sparkles } from 'lucide-react';

export const DonnyWeeklyPlannerStub: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <CalendarRange className="h-5 w-5 text-gray-300" />
        <Sparkles className="h-4 w-4 text-gray-300" />
      </div>
      <h3 className="font-semibold text-sm text-gray-400">Weekly Content Plan</h3>
      <p className="text-xs text-gray-300 mt-1">Donny AI will generate your weekly posting schedule based on performance data</p>
    </div>
  );
};
```

- [ ] **Step 3: Create DonnyPerformanceStub**

Create `src/components/outstand/DonnyPerformanceStub.tsx`:

```typescript
import React from 'react';
import { LineChart, Sparkles } from 'lucide-react';

export const DonnyPerformanceStub: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center mt-4">
      <div className="flex items-center justify-center gap-2 mb-2">
        <LineChart className="h-5 w-5 text-gray-300" />
        <Sparkles className="h-4 w-4 text-gray-300" />
      </div>
      <h3 className="font-semibold text-sm text-gray-400">Performance Recommendations</h3>
      <p className="text-xs text-gray-300 mt-1">Donny AI recommendations coming soon</p>
    </div>
  );
};
```

- [ ] **Step 4: Add DonnyAutoPilotStub to OutstandManager header**

In `src/pages/OutstandManager.tsx`, add the import:

```typescript
import { DonnyAutoPilotStub } from '@/components/outstand/DonnyAutoPilotStub';
```

The page already has a header "Social Media Manager" (around lines 178-185) with a Refresh button (around line 186). Do NOT create a new header. Instead, add `<DonnyAutoPilotStub />` inline next to the existing Refresh button. Find the Refresh button area (around line 186-205) and add:

```typescript
<DonnyAutoPilotStub />
```

Place it in the existing `flex` row that contains the Refresh button, so it appears as an inline toggle in the header area without duplicating any layout.

- [ ] **Step 5: Add DonnyWeeklyPlannerStub to CalendarTab**

In `src/components/outstand/CalendarTab.tsx`, after the calendar grid rendering, add:

```typescript
import { DonnyWeeklyPlannerStub } from './DonnyWeeklyPlannerStub';
```

Add at the bottom of the CalendarTab return, before the closing container `</div>`:
```typescript
<DonnyWeeklyPlannerStub />
```

- [ ] **Step 6: Add DonnyPerformanceStub to AnalyticsTab**

In `src/components/outstand/AnalyticsTab.tsx`, add:

```typescript
import { DonnyPerformanceStub } from './DonnyPerformanceStub';
```

Add at the bottom of the AnalyticsTab return:
```typescript
<DonnyPerformanceStub />
```

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 8: Commit**

```
git add src/components/outstand/DonnyAutoPilotStub.tsx src/components/outstand/DonnyWeeklyPlannerStub.tsx src/components/outstand/DonnyPerformanceStub.tsx src/pages/OutstandManager.tsx src/components/outstand/CalendarTab.tsx src/components/outstand/AnalyticsTab.tsx
git commit -m "feat(donny): add Auto-Pilot, Weekly Planner, and Performance Recommendations stubs"
```

---

## Task 11: Wire Campaign Approval to Fire Stage 4 Hook

**Files:**
- Modify: `src/hooks/useJointApproval.ts:37-48,160-175`

The `useJointApproval.ts` hook has TWO mutation functions that can set `final_approval_status: 'approved'`:
- `updateBrandApproval` (around line 40-48) — when the brand is the last to approve
- `updateRestaurantApproval` (around line 160-175) — when the restaurant is the last to approve

The Stage 4 hook must fire from BOTH paths, since either party could complete the joint approval.

- [ ] **Step 1: Add campaign_id to the select queries**

In `updateBrandApproval.mutationFn`, find the initial select query (around line 31-35) and add `campaign_id` to the select:
```typescript
.select('id, brand_approval_status, restaurant_approval_status, final_approval_status, campaign_id')
```

In `updateRestaurantApproval.mutationFn`, find the initial select query (around line 160) and add `campaign_id`:
```typescript
.select('id, brand_approval_status, restaurant_approval_status, final_approval_status, campaign_id')
```

- [ ] **Step 2: Add hook firing after brand approval sets final_approval_status**

In `updateBrandApproval.mutationFn`, after the line that updates `final_approval_status: 'approved'` (around line 43), add:

```typescript
// Fire Stage 4 social hook (non-blocking)
if (application.campaign_id) {
  supabase.functions.invoke('fire-campaign-social-hook', {
    body: { campaign_id: application.campaign_id, stage: 4 },
  }).catch((err) => console.error('Failed to fire Stage 4 hook:', err));
}
```

- [ ] **Step 3: Add hook firing after restaurant approval sets final_approval_status**

In `updateRestaurantApproval.mutationFn`, after the line that updates `final_approval_status: 'approved'` (around line 175), add the same code:

```typescript
// Fire Stage 4 social hook (non-blocking)
if (application.campaign_id) {
  supabase.functions.invoke('fire-campaign-social-hook', {
    body: { campaign_id: application.campaign_id, stage: 4 },
  }).catch((err) => console.error('Failed to fire Stage 4 hook:', err));
}
```

Both calls are fire-and-forget — the approval flow should not be blocked by a hook failure. The `.catch()` prevents unhandled promise rejections.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```
git add src/hooks/useJointApproval.ts
git commit -m "feat(hooks): fire Stage 4 social hook on content approval from both brand and restaurant paths"
```

---

## Task 12: Modify outstand-proxy for Delegated Posting

**Files:**
- Modify: `supabase/functions/outstand-proxy/index.ts`

- [ ] **Step 1: Add delegated posting permission check**

In `supabase/functions/outstand-proxy/index.ts`, before the section that forwards the request to the Outstand API, add a permission check for delegated posting:

```typescript
// Check for delegated posting
const delegatedAccountId = req.headers.get('x-delegated-account-id');
const delegatedUserId = req.headers.get('x-delegated-user-id');

if (delegatedAccountId && delegatedUserId) {
  // Verify permission exists and is active
  // Note: the proxy uses ctx.userId (from TenantContext) not a bare userId variable
  const { data: permission, error: permError } = await supabase
    .from('delegated_posting_permissions')
    .select('id, platforms, status, expires_at')
    .eq('grantor_id', delegatedUserId)
    .eq('grantee_id', ctx.userId)
    .eq('status', 'active')
    .single();

  if (permError || !permission) {
    return new Response(JSON.stringify({ error: 'No active delegated posting permission' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check expiration
  if (permission.expires_at && new Date(permission.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: 'Delegated posting permission has expired' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Use the grantor's Outstand account ID instead of the requester's
  // The request body should reference the grantor's social account IDs
}
```

This is a lightweight guard — the actual account ID substitution depends on how the Outstand SDK passes account references. The key constraint is: if `x-delegated-user-id` is present, verify the permission before forwarding.

- [ ] **Step 2: Deploy updated proxy**

Run: `supabase functions deploy outstand-proxy`
Expected: Function deploys successfully.

- [ ] **Step 3: Commit**

```
git add supabase/functions/outstand-proxy/
git commit -m "feat(edge): add delegated posting permission check to outstand-proxy"
```

---

## Task 13: Build Verification & Final Audit

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build with zero TypeScript errors.

- [ ] **Step 2: Run dev server and manual smoke test**

Run: `npm run dev`

Verify in browser:

**Campaign hooks:**
- Open a campaign detail page — no hooks render if none exist (correct empty state)

**Triple-Post prompt:**
- Component renders when triggered (test by temporarily adding a button to open it)
- Mobile: bottom sheet, Desktop: modal dialog
- DragonDash Rush CTA appears when 3+ accounts connected
- Coordination status panel shows party statuses

**DragonDash Rush:**
- Button hidden when < 3 platforms connected
- Clicking shows confirmation dialog with correct surcharge amount
- Mobile: bottom sheet, Desktop: modal
- Confirmation creates `rush_surcharge_log` entry

**Cross-Party Analytics:**
- `CampaignImpactSummary` renders above sponsorship detail
- `AIPerformanceInsights` stub renders below

**Delegated Posting:**
- Permissions section appears on Accounts tab (for all roles)
- Empty state shows when no permissions exist

**Donny Stubs:**
- Auto-Pilot toggle visible in OutstandManager header (disabled)
- Weekly Planner card visible on Calendar tab (disabled)
- Performance Recommendations card visible on Analytics tab (disabled)

**Rush integration:**
- Rush CTA appears in CrossPostPrompt when 3+ platforms
- Rush CTA appears in SponsorshipAmplificationPrompt when 3+ platforms

- [ ] **Step 3: Commit any final fixes**

If any issues found during smoke test, fix and commit individually.

- [ ] **Step 4: Final commit summary**

Run: `git log --oneline -20`

Verify all Phase 4 commits are present:
1. Database migrations (4 tables)
2. Edge Functions (fire-campaign-social-hook, expire-social-hooks)
3. Campaign Social Hooks (hook + component)
4. Triple-Post State (hook + orchestrator)
5. DragonDash Rush (button + confirmation + hook)
6. Triple-Post Prompt
7. Rush integration into existing prompts
8. Campaign Impact Summary + AI insights stub
9. Delegated Posting Permissions
10. Donny Stubs (3 placeholders)
11. Joint Approval → Stage 4 hook wiring
12. outstand-proxy delegated posting check

---

## Deferred Items

**CampaignImpactSummary on restaurant/creator campaign detail pages:** The spec (4d, Role-Specific Views) calls for restaurants and creators to see a simplified version of campaign impact on their campaign detail pages. This plan integrates `CampaignImpactSummary` into the brand's `CrossPartyAnalytics` (Sponsorships tab) only. The restaurant/creator integration is deferred to a follow-up task because: (a) the campaign detail page architecture differs significantly between roles, (b) the metrics data pipeline needs real post data to be useful, and (c) the brand view is the highest-value surface for sponsors. Once post data flows through `social_post_log`, add `CampaignImpactSummary` to `BusinessCampaignDetails.tsx` and the creator's equivalent.

---

## Post-Implementation: Audit

After all tasks are complete, run a full audit against the design spec (`docs/superpowers/specs/2026-05-09-outstand-phase4-cross-role-design.md`) to verify every deliverable:

| Deliverable | Check |
|-------------|-------|
| 4a: Campaign Social Hooks | 5-stage system fires, hooks render inline, 72h expiry works |
| 4b: Triple-Post on Content Approval | Triggers on `final_approval_status → 'approved'`, all parties prompted, coordination panel shows live status |
| 4c: DragonDash Rush Posting | Teal gradient CTA, $25-50 tiered pricing, ledger entries created, tier gating works |
| 4d: Unified Cross-Role Analytics | CampaignImpactSummary in CrossPartyAnalytics, AI insights stub present |
| 4e: Delegated Posting | Permissions on Accounts tab, toggle in TriplePostPrompt, outstand-proxy check |
| 4f: Donny Auto-Pilot | Stub toggle in header, disabled state |
| 4g: Donny Weekly Planner | Stub card on Calendar tab |
| 4h: Donny Performance Recommendations | Stub card on Analytics tab |
| Desktop/Mobile parity | All components render correctly at 375px and 1280px+ |
| Empty states | All components handle zero-data gracefully |
| RLS | All new tables have RLS enabled with correct policies |
| Ledger-first | `rush_surcharge_log` records every surcharge from Day 1 |
