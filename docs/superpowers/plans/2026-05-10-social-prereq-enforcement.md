# Social Integration Audit & Prerequisite Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce three prerequisites (profile completion, Outstand social account, Stripe setup) before any revenue-generating action, and wire post-campaign auto-scheduling + prompt-to-post so approved content flows to connected social accounts.

**Architecture:** A `SECURITY DEFINER` RPC function returns all three prerequisite statuses in one call (needed because `stripe_onboarding_complete` is not client-readable). A `usePrerequisiteStatus` hook wraps that RPC via React Query. A `PrerequisiteGate` component renders either a branded checklist blocker or its children. The gate wraps 11 page files across 5 features. Post-campaign flow extends `fire-campaign-social-hook` Stage 4 to auto-draft posts via `donny-schedule` and surface Donny nudges. A new `social-caption` edge function generates AI captions.

**Tech Stack:** React + TypeScript, Tailwind CSS, Supabase (Postgres RPC, Edge Functions in Deno), React Query (TanStack), Anthropic Haiku via `anthropicFetch`, Outstand API via `outstand-proxy`.

**Spec:** `docs/superpowers/specs/2026-05-10-social-prereq-enforcement-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260510100000_check_prerequisite_status.sql` | `SECURITY DEFINER` RPC returning profile/social/stripe status as JSONB |
| `src/hooks/usePrerequisiteStatus.ts` | React Query hook wrapping the RPC, returns `PrerequisiteStatus` |
| `src/components/PrerequisiteGate.tsx` | Gate component: checklist blocker (full-page or inline) or renders children |
| `supabase/functions/social-caption/index.ts` | Edge function: AI caption generation via Haiku (T1) |

### Modified Files

| File | Change |
|---|---|
| `src/pages/CampaignCreator.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/CampaignWizard.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/BrandCreateCampaign.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/CreatorDragonShare.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/BusinessDragonShare.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/BusinessPromotionalTools.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/PromotionSubmissionPage.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/CampaignDetailsPage.tsx` | Wrap apply section with `<PrerequisiteGate inline>` |
| `src/pages/BrandSponsorships.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/BusinessSponsorships.tsx` | Wrap content with `<PrerequisiteGate>` |
| `src/pages/BusinessProposals.tsx` | Wrap content with `<PrerequisiteGate>` |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Extend Stage 4 with auto-draft + nudge |
| `src/contexts/DonnyProvider.tsx` | Add `post_now` and `navigate` action handlers in `executeAction` |

---

## Task 1: Database Migration — `check_prerequisite_status` RPC

**Files:**
- Create: `supabase/migrations/20260510100000_check_prerequisite_status.sql`

This RPC function is called by the client hook to check all three prerequisites in one roundtrip. It must be `SECURITY DEFINER` because `stripe_onboarding_complete` has SELECT revoked from `authenticated` role.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260510100000_check_prerequisite_status.sql
CREATE OR REPLACE FUNCTION check_prerequisite_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  IF v_role = 'content_creator' THEN
    SELECT jsonb_build_object(
      'role', v_role,
      'profile_complete', (
        creator_name IS NOT NULL AND creator_name != '' AND
        bio IS NOT NULL AND bio != '' AND
        avatar_url IS NOT NULL AND avatar_url != ''
      ),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM creator_profiles WHERE id = p_user_id;
  ELSE
    SELECT jsonb_build_object(
      'role', COALESCE(account_type, 'business_client'),
      'profile_complete', (
        business_name IS NOT NULL AND business_name != '' AND
        description IS NOT NULL AND description != '' AND
        logo_url IS NOT NULL AND logo_url != ''
      ),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM business_profiles WHERE id = p_user_id;
  END IF;

  result = result || jsonb_build_object(
    'social_connected', EXISTS(
      SELECT 1 FROM business_outstand_accounts WHERE user_id = p_user_id
    )
  );

  RETURN COALESCE(result, '{"role":"unknown","profile_complete":false,"social_connected":false,"stripe_complete":false}'::jsonb);
END;
$$;
```

- [ ] **Step 2: Apply the migration to the remote database**

Use the Supabase MCP tool `apply_migration` to run this SQL against the project. The project ID can be found via `list_projects` (look for the DragonCandy project at `zocahiffooqdybdhguqv`).

Alternatively, run via Supabase CLI:
```bash
npx supabase db push
```

- [ ] **Step 3: Verify the RPC works**

Use the Supabase MCP tool `execute_sql` to test:
```sql
SELECT check_prerequisite_status('some-existing-user-id-from-profiles');
```

Expected: a JSONB object with `role`, `profile_complete`, `social_connected`, `stripe_complete` keys.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260510100000_check_prerequisite_status.sql
git commit -m "feat: add check_prerequisite_status RPC for prerequisite gate"
```

---

## Task 2: `usePrerequisiteStatus` Hook

**Files:**
- Create: `src/hooks/usePrerequisiteStatus.ts`
- Reference: `src/hooks/useActiveCampaignGate.ts` (same pattern: `useQuery` + `supabase` + `useAuth`)
- Reference: `src/contexts/AuthContext.tsx` (Profile interface at line 9, role field at line 12)

This hook calls the RPC from Task 1 and maps the result into a typed `PrerequisiteStatus` object with human-readable labels and navigation paths.

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/usePrerequisiteStatus.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PrerequisiteItem {
  key: 'profile' | 'social' | 'stripe';
  met: boolean;
  label: string;
  actionLabel: string;
  actionPath: string;
}

export interface PrerequisiteStatus {
  isLoading: boolean;
  items: PrerequisiteItem[];
  allMet: boolean;
  role: 'content_creator' | 'business_client' | 'brand';
}

interface RpcResult {
  role: string;
  profile_complete: boolean;
  social_connected: boolean;
  stripe_complete: boolean;
}

function buildItems(rpc: RpcResult): PrerequisiteItem[] {
  const isCreator = rpc.role === 'content_creator';
  const dashBase = isCreator ? '/dashboard/creator' : '/dashboard/business';

  return [
    {
      key: 'profile',
      met: rpc.profile_complete,
      label: rpc.profile_complete
        ? 'Profile complete'
        : isCreator
          ? 'Add your name, bio, and photo'
          : 'Add your business name, description, and logo',
      actionLabel: 'Complete Profile',
      actionPath: `${dashBase}/settings`,
    },
    {
      key: 'social',
      met: rpc.social_connected,
      label: rpc.social_connected
        ? 'Social media connected'
        : 'Connect at least one social account',
      actionLabel: 'Connect Social',
      actionPath: `${dashBase}/outstand`,
    },
    {
      key: 'stripe',
      met: rpc.stripe_complete,
      label: rpc.stripe_complete
        ? 'Stripe account active'
        : 'Set up your payment account',
      actionLabel: 'Setup Stripe',
      actionPath: `${dashBase}/settings`,
    },
  ];
}

export function usePrerequisiteStatus(): PrerequisiteStatus {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['prerequisite_status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc('check_prerequisite_status', {
        p_user_id: user.id,
      });
      if (error) throw error;
      return data as RpcResult;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  if (!data) {
    return {
      isLoading: isLoading || !user,
      items: [],
      allMet: false,
      role: 'business_client',
    };
  }

  const items = buildItems(data);
  const role = (data.role === 'content_creator' ? 'content_creator'
    : data.role === 'brand' ? 'brand'
    : 'business_client') as PrerequisiteStatus['role'];

  return {
    isLoading: false,
    items,
    allMet: items.every((i) => i.met),
    role,
  };
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors. The hook won't be consumed yet, but it must compile.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePrerequisiteStatus.ts
git commit -m "feat: add usePrerequisiteStatus hook for 3-check gate"
```

---

## Task 3: `PrerequisiteGate` Component

**Files:**
- Create: `src/components/PrerequisiteGate.tsx`
- Reference: `src/components/projects/PayoutGate.tsx` (existing gate pattern — white card, `rounded-2xl`, teal CTA button)
- Reference: Design system in `CLAUDE.md` (pill buttons `rounded-full`, teal `bg-dc-teal`, card `rounded-2xl border`)

This component wraps gated features. It checks prerequisites via the hook and renders either the children or a branded checklist blocker.

- [ ] **Step 1: Create the component**

```tsx
// src/components/PrerequisiteGate.tsx
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePrerequisiteStatus } from '@/hooks/usePrerequisiteStatus';

interface PrerequisiteGateProps {
  feature: string;
  children: ReactNode;
  inline?: boolean;
}

export function PrerequisiteGate({ feature, children, inline }: PrerequisiteGateProps) {
  const { isLoading, items, allMet } = usePrerequisiteStatus();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (allMet) return <>{children}</>;

  const firstUnmet = items.find((i) => !i.met);

  if (inline) {
    return (
      <div className="rounded-2xl border-2 border-teal-300 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">
          Complete setup to {feature}
        </p>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.met ? (
                <CheckCircle2 className="h-4 w-4 text-teal-500 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />
              )}
              <span className={item.met ? 'text-gray-500' : 'text-gray-800'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
        {firstUnmet && (
          <Button
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold text-sm py-2"
            onClick={() => navigate(firstUnmet.actionPath)}
          >
            {firstUnmet.actionLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border-2 border-teal-300 p-6 space-y-5">
        <div className="text-center">
          <Sparkles className="h-8 w-8 text-teal-500 mx-auto mb-2" />
          <h2 className="text-xl font-bold text-gray-900">Almost there!</h2>
          <p className="text-sm text-gray-500 mt-1">
            Complete these steps to {feature}
          </p>
        </div>

        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.met ? (
                  <CheckCircle2 className="h-5 w-5 text-teal-500 flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
                )}
                <span
                  className={`text-sm ${item.met ? 'text-gray-500 line-through' : 'text-gray-800 font-medium'}`}
                >
                  {item.label}
                </span>
              </div>
              {!item.met && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs flex-shrink-0 border-teal-300 text-teal-700 hover:bg-teal-50"
                  onClick={() => navigate(item.actionPath)}
                >
                  {item.actionLabel}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {firstUnmet && (
          <Button
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold text-base py-6"
            onClick={() => navigate(firstUnmet.actionPath)}
          >
            {firstUnmet.actionLabel} to get started
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PrerequisiteGate.tsx
git commit -m "feat: add PrerequisiteGate component with full-page and inline modes"
```

---

## Task 4: Integrate Gate into Campaign Creation Pages (3 files)

**Files:**
- Modify: `src/pages/CampaignCreator.tsx`
- Modify: `src/pages/CampaignWizard.tsx`
- Modify: `src/pages/BrandCreateCampaign.tsx`

Each page wraps its main content with `<PrerequisiteGate feature="create a campaign">`. The gate goes inside the `DashboardLayout` (or standalone mobile container) so the nav remains visible while the checklist shows.

- [ ] **Step 1: Add gate to `CampaignCreator.tsx`**

This page has two screens (`drop` and `launchpad`) and two layouts (mobile standalone, desktop `DashboardLayout`). The gate wraps the DropScreen/LaunchpadScreen content, not the layout itself.

At the top of `src/pages/CampaignCreator.tsx`, add the import:
```typescript
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
```

For the mobile `drop` screen (around line 50), wrap the `DropScreen` inside the container:
```tsx
<div className="min-h-screen bg-white pb-20">
  <div className="absolute top-6 left-6 z-10">
    {/* back button ... */}
  </div>
  <PrerequisiteGate feature="create a campaign">
    <DropScreen ... />
  </PrerequisiteGate>
  <MobileBottomNav userRole={navRole} />
</div>
```

For the desktop `drop` screen (around line 72):
```tsx
<DashboardLayout userRole={navRole}>
  <PrerequisiteGate feature="create a campaign">
    <DropScreen ... />
  </PrerequisiteGate>
</DashboardLayout>
```

For the mobile `launchpad` screen (around line 105):
```tsx
<div className="min-h-screen bg-white pt-4 pb-20">
  <PrerequisiteGate feature="create a campaign">
    <LaunchpadScreen {...launchpadProps} />
  </PrerequisiteGate>
  {/* AuthenticationModal and MobileBottomNav stay outside */}
</div>
```

For the desktop `launchpad` screen (around line 116):
```tsx
<DashboardLayout userRole={navRole}>
  <PrerequisiteGate feature="create a campaign">
    <div className="flex gap-6 max-w-6xl mx-auto">
      {/* existing content */}
    </div>
  </PrerequisiteGate>
  <AuthenticationModal ... />
</DashboardLayout>
```

- [ ] **Step 2: Add gate to `CampaignWizard.tsx`**

At the top of `src/pages/CampaignWizard.tsx`, add the import:
```typescript
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
```

The component returns `<DashboardLayout>` with a `<div>` inside. Wrap the content div (the one with `px-4 py-6` classes, around line 75) with the gate:
```tsx
<DashboardLayout userRole="business_client">
  <div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full">
    <PageHeader>...</PageHeader>
    <PrerequisiteGate feature="create a campaign">
      <div className="px-4 py-6 pb-28 md:pb-6 space-y-6 md:max-w-3xl md:mx-auto">
        {/* all step content stays here */}
      </div>
    </PrerequisiteGate>
  </div>
</DashboardLayout>
```

- [ ] **Step 3: Add gate to `BrandCreateCampaign.tsx`**

At the top of `src/pages/BrandCreateCampaign.tsx`, add the import:
```typescript
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
```

Same pattern: wrap the step content inside the layout with the gate. The gate goes around the main content area, not around `DashboardLayout` or `PageHeader`.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CampaignCreator.tsx src/pages/CampaignWizard.tsx src/pages/BrandCreateCampaign.tsx
git commit -m "feat: enforce prerequisite gate on all campaign creation pages"
```

---

## Task 5: Integrate Gate into DragonShare Pages (2 files)

**Files:**
- Modify: `src/pages/CreatorDragonShare.tsx`
- Modify: `src/pages/BusinessDragonShare.tsx`

- [ ] **Step 1: Add gate to `CreatorDragonShare.tsx`**

At the top of `src/pages/CreatorDragonShare.tsx`, add:
```typescript
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
```

Wrap the main page content (inside the layout wrapper) with:
```tsx
<PrerequisiteGate feature="use DragonShare">
  {/* existing page content */}
</PrerequisiteGate>
```

- [ ] **Step 2: Add gate to `BusinessDragonShare.tsx`**

Same pattern as above with:
```typescript
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
```

Wrap main content with `<PrerequisiteGate feature="use DragonShare">`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/CreatorDragonShare.tsx src/pages/BusinessDragonShare.tsx
git commit -m "feat: enforce prerequisite gate on DragonShare pages"
```

---

## Task 6: Integrate Gate into Promotions Pages (2 files)

**Files:**
- Modify: `src/pages/BusinessPromotionalTools.tsx`
- Modify: `src/pages/PromotionSubmissionPage.tsx`

- [ ] **Step 1: Add gate to `BusinessPromotionalTools.tsx`**

Import and wrap main content with `<PrerequisiteGate feature="use Promotions">`.

- [ ] **Step 2: Add gate to `PromotionSubmissionPage.tsx`**

Import and wrap main content with `<PrerequisiteGate feature="submit a promotion">`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessPromotionalTools.tsx src/pages/PromotionSubmissionPage.tsx
git commit -m "feat: enforce prerequisite gate on Promotions pages"
```

---

## Task 7: Integrate Gate into Campaign Apply (inline mode)

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx`

This is the special case: the gate wraps only the apply action area (the `StickyApplyCTA` + `OneTapApplySheet`), not the entire page. Creators must still browse campaign details freely.

- [ ] **Step 1: Add inline gate around apply section**

At the top of `src/pages/CampaignDetailsPage.tsx`, add:
```typescript
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
```

Find the `StickyApplyCTA` section (around line 194). Wrap it and the `OneTapApplySheet` together:

```tsx
<PrerequisiteGate feature="apply for this campaign" inline>
  <StickyApplyCTA
    canApply={canApply || canReapply}
    hasApplied={hasApplied}
    applicationStatus={applicationStatus}
    onApply={() => setShowApplySheet(true)}
    onViewProject={() => navigate('/dashboard/creator/projects')}
    spotsTotal={campaign.creator_count}
  />

  <OneTapApplySheet
    open={showApplySheet}
    onOpenChange={setShowApplySheet}
    campaign={campaign}
    onSend={handleDonnySend}
    onEditDetails={handleEditDetails}
  />
</PrerequisiteGate>
```

Note: Only the creator view path in the component renders `StickyApplyCTA`. The gate must wrap just this section, not the brand/business view.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: enforce inline prerequisite gate on campaign apply button"
```

---

## Task 8: Integrate Gate into Sponsorship Pages (3 files)

**Files:**
- Modify: `src/pages/BrandSponsorships.tsx`
- Modify: `src/pages/BusinessSponsorships.tsx`
- Modify: `src/pages/BusinessProposals.tsx`

- [ ] **Step 1: Add gate to `BrandSponsorships.tsx`**

Import and wrap main content with `<PrerequisiteGate feature="manage sponsorships">`.

- [ ] **Step 2: Add gate to `BusinessSponsorships.tsx`**

Import and wrap main content with `<PrerequisiteGate feature="manage sponsorships">`.

- [ ] **Step 3: Add gate to `BusinessProposals.tsx`**

Import and wrap main content with `<PrerequisiteGate feature="manage proposals">`.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/BrandSponsorships.tsx src/pages/BusinessSponsorships.tsx src/pages/BusinessProposals.tsx
git commit -m "feat: enforce prerequisite gate on sponsorship and proposal pages"
```

---

## Task 9: `social-caption` Edge Function

**Files:**
- Create: `supabase/functions/social-caption/index.ts`
- Reference: `supabase/functions/_shared/anthropic-fetch.ts` (retry wrapper)
- Reference: `supabase/functions/_shared/cors.ts` (CORS headers)
- Reference: `supabase/functions/_shared/model-routing.ts` (line 58: `social-caption` routing entry already exists, maps to HAIKU)
- Reference: `supabase/functions/_shared/cost-ledger.ts` (cost logging)

This function generates social media captions tailored to party role and platform.

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/social-caption/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

interface CaptionRequest {
  campaign_title: string;
  campaign_description: string;
  content_type: string;
  party_role: "restaurant" | "creator" | "brand";
  platform: string;
  user_id: string;
}

const ROLE_PROMPTS: Record<string, string> = {
  restaurant:
    "You are writing a social media caption for a restaurant posting campaign content. Use a promotional, inviting tone. Include a call-to-action. Mention the restaurant experience.",
  creator:
    "You are writing a social media caption for a content creator sharing their work. Use an authentic, personal tone. Credit the creator's work. Use creator-style language.",
  brand:
    "You are writing a social media caption for a brand amplifying campaign content. Use professional amplification tone. Include sponsor messaging and brand hashtags.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const body = (await req.json()) as CaptionRequest;
    const { campaign_title, campaign_description, content_type, party_role, platform, user_id } = body;

    if (!campaign_title || !party_role || !platform || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const config = getModelConfig("social-caption");

    const response = await anthropicFetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          messages: [
            {
              role: "user",
              content: `${ROLE_PROMPTS[party_role] ?? ROLE_PROMPTS.restaurant}

Campaign: "${campaign_title}"
Description: ${campaign_description || "N/A"}
Content type: ${content_type}
Platform: ${platform}

Write a short, engaging caption (under 200 characters) and suggest 3-5 relevant hashtags.

Respond in JSON: {"caption": "...", "hashtags": ["#tag1", "#tag2"]}`,
            },
          ],
        }),
      },
      0,
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = await response.json();
    const rawContent = data.content?.[0]?.text ?? "{}";
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    // Log cost
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await logCost(supabaseAdmin, {
      userId: user_id,
      edgeFunction: "social-caption",
      model: config.model,
      tier: config.tier,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    });

    return new Response(
      JSON.stringify({ caption: parsed.caption ?? "", hashtags: parsed.hashtags ?? [] }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[social-caption] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Deploy the edge function**

```bash
npx supabase functions deploy social-caption --no-verify-jwt
```

Or use the Supabase MCP `deploy_edge_function` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/social-caption/index.ts
git commit -m "feat: add social-caption edge function for AI caption generation"
```

---

## Task 10: Extend `fire-campaign-social-hook` Stage 4 with Auto-Draft + Nudge

**Files:**
- Modify: `supabase/functions/fire-campaign-social-hook/index.ts`

After the existing Stage 4 `triple_post_sessions` upsert, add logic to:
1. Query `business_outstand_accounts` for each party
2. Query approved deliverable media from `file_uploads`
3. Call `social-caption` for AI caption generation
4. Insert a `donny_scheduled_posts` draft entry
5. Insert a `donny_nudges` record

- [ ] **Step 1: Add auto-draft logic after the Stage 4 block**

In `supabase/functions/fire-campaign-social-hook/index.ts`, find the existing `if (stage === 4) { ... }` block (lines 97-115). Insert the following code **immediately after** the closing `}` of that block (line 115), but **before** the final `return new Response(...)` at line 117. The variables `parties`, `template`, `campaign`, `campaign_id`, `supabase`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are all in scope from the enclosing `try` block.

```typescript
    // --- Stage 4 auto-draft: create scheduled post drafts + nudges ---
    if (stage === 4) {
      for (const party of parties) {
        try {
          // Check if party has an Outstand-connected account
          const { data: outstandAccounts } = await supabase
            .from('business_outstand_accounts')
            .select('platform, platform_handle')
            .eq('user_id', party.user_id)
            .limit(1);

          if (!outstandAccounts?.length) continue;

          const platform = outstandAccounts[0].platform;

          // Get approved media from file_uploads (linked by campaign_id, not deliverable_id)
          // Schema: file_uploads has campaign_id FK, file_path, bucket_name — no deliverable_id
          const { data: uploadedFiles } = await supabase
            .from('file_uploads')
            .select('file_path, bucket_name, mime_type')
            .eq('campaign_id', campaign_id)
            .eq('upload_status', 'complete')
            .limit(5);

          const mediaUrls: string[] = [];
          if (uploadedFiles?.length) {
            for (const f of uploadedFiles) {
              const { data: signedUrl } = await supabase.storage
                .from(f.bucket_name)
                .createSignedUrl(f.file_path, 3600);
              if (signedUrl?.signedUrl) mediaUrls.push(signedUrl.signedUrl);
            }
          }

          // Determine content type from campaign_deliverables spec
          const { data: delivSpec } = await supabase
            .from('campaign_deliverables')
            .select('content_type')
            .eq('campaign_id', campaign_id)
            .limit(1)
            .single();

          const contentType = delivSpec?.content_type || 'photo';

          // Generate AI caption
          let caption = template;
          let hashtags: string[] = [];
          try {
            const captionResp = await fetch(
              `${SUPABASE_URL}/functions/v1/social-caption`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  campaign_title: campaign.title,
                  campaign_description: '',
                  content_type: contentType,
                  party_role: party.role,
                  platform,
                  user_id: party.user_id,
                }),
              },
            );
            if (captionResp.ok) {
              const captionData = await captionResp.json();
              caption = captionData.caption || caption;
              hashtags = captionData.hashtags || [];
            }
          } catch (captionErr) {
            console.warn('[fire-campaign-social-hook] Caption generation failed, using template:', captionErr.message);
          }

          // Suggest optimal posting time
          let scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          try {
            const scheduleResp = await fetch(
              `${SUPABASE_URL}/functions/v1/donny-schedule`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  action: 'suggest_times',
                  platform,
                  content_type: contentType,
                }),
              },
            );
            if (scheduleResp.ok) {
              const scheduleData = await scheduleResp.json();
              if (scheduleData.suggestions?.[0]?.time) {
                scheduledAt = scheduleData.suggestions[0].time;
              }
            }
          } catch (schedErr) {
            console.warn('[fire-campaign-social-hook] Time suggestion failed, using +24h default:', schedErr.message);
          }

          // Insert draft scheduled post
          const { data: scheduledPost } = await supabase
            .from('donny_scheduled_posts')
            .insert({
              user_id: party.user_id,
              campaign_id,
              platform,
              content_type: contentType,
              caption,
              media_urls: mediaUrls,
              hashtags,
              scheduled_at: scheduledAt,
              status: 'draft',
              ai_suggested_time: true,
              ai_reasoning: `Auto-drafted by campaign social hook (stage 4)`,
              metadata: { source: 'campaign_social_hook', stage: 4 },
            })
            .select('id')
            .single();

          // Get the hook ID for the source reference
          const { data: hookRow } = await supabase
            .from('campaign_social_hooks')
            .select('id')
            .eq('campaign_id', campaign_id)
            .eq('stage', 4)
            .eq('user_id', party.user_id)
            .single();

          // Insert Donny nudge
          if (hookRow) {
            await supabase.from('donny_nudges').upsert(
              {
                user_id: party.user_id,
                type: 'content',
                priority: 'high',
                source_table: 'campaign_social_hooks',
                source_id: hookRow.id,
                summary: 'Your campaign content is ready to share!',
                actions: [
                  {
                    label: 'Post Now',
                    variant: 'primary',
                    action: 'post_now',
                    payload: {
                      scheduled_post_id: scheduledPost?.id ?? null,
                      campaign_id,
                    },
                  },
                  {
                    label: 'Review Draft',
                    variant: 'secondary',
                    action: 'navigate',
                    payload: {
                      route: party.role === 'creator'
                        ? '/dashboard/creator/content-calendar'
                        : '/dashboard/business/content-calendar',
                    },
                  },
                ],
              },
              { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
            );
          }
        } catch (autoDraftErr) {
          console.warn(`[fire-campaign-social-hook] Auto-draft failed for ${party.user_id}:`, autoDraftErr.message);
        }
      }
    }
```

This entire block is placed between the existing Stage 4 closing `}` (line 115) and the `return new Response(...)` (line 117).

- [ ] **Step 2: Deploy the updated function**

```bash
npx supabase functions deploy fire-campaign-social-hook --no-verify-jwt
```

Or use the Supabase MCP `deploy_edge_function` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fire-campaign-social-hook/index.ts
git commit -m "feat: extend Stage 4 hook with auto-draft post and Donny nudge"
```

---

## Task 11: Add `post_now` Action Handler in `DonnyProvider.tsx`

**Files:**
- Modify: `src/contexts/DonnyProvider.tsx`

The current `executeAction` function (line 121-132) sends all actions as messages to Donny chat. We need to intercept the `post_now` action and handle it directly: read the draft post, publish via `outstand-proxy`, update status, log to `social_post_log`.

- [ ] **Step 1: Update the context interface to accept async executeAction**

In `src/contexts/DonnyProvider.tsx`, find the `DonnyContextValue` interface (around line 14). Change the `executeAction` type from `void` to `Promise<void>`:

```typescript
// Line 22: change from:
executeAction: (nudgeId: string, action: NudgeAction) => void;
// to:
executeAction: (nudgeId: string, action: NudgeAction) => void | Promise<void>;
```

- [ ] **Step 2: Add `post_now` handler to `executeAction`**

In `src/contexts/DonnyProvider.tsx`, find the `executeAction` callback (line 121). Replace it with:

```typescript
  const executeAction = useCallback(
    async (nudgeId: string, action: NudgeAction) => {
      actOnNudge(nudgeId);

      if (action.action === 'navigate' && action.payload?.route) {
        window.location.href = action.payload.route as string;
        return;
      }

      if (action.action === 'post_now' && action.payload?.scheduled_post_id) {
        try {
          const postId = action.payload.scheduled_post_id as string;

          // Read the draft post
          const { data: draft, error: draftErr } = await supabase
            .from('donny_scheduled_posts')
            .select('caption, media_urls, platform, content_type, campaign_id')
            .eq('id', postId)
            .single();

          if (draftErr || !draft) throw new Error('Could not load draft post');

          // Publish via outstand-proxy
          const { data: publishData, error: publishErr } = await supabase.functions.invoke(
            'outstand-proxy',
            {
              body: {
                path: '/v1/posts',
                method: 'POST',
                payload: {
                  caption: draft.caption,
                  media_urls: draft.media_urls,
                  platform: draft.platform,
                  content_type: draft.content_type,
                },
              },
            },
          );

          if (publishErr) throw publishErr;

          const outstandPostId = publishData?.id ?? publishData?.post_id ?? 'unknown';

          // Mark draft as published
          await supabase
            .from('donny_scheduled_posts')
            .update({ status: 'published', published_at: new Date().toISOString() })
            .eq('id', postId);

          // Log to social_post_log
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('social_post_log').insert({
              user_id: user.id,
              campaign_id: draft.campaign_id,
              outstand_post_id: String(outstandPostId),
              platform: draft.platform,
              post_type: 'campaign',
            });
          }

          toast.success(`Posted to ${draft.platform}!`);
        } catch (err) {
          console.error('[DonnyProvider] post_now failed:', err);
          toast.error('Failed to publish post. Please try again.');
        }
        return;
      }

      // Default: send as message to Donny for edge function processing
      const actionMessage = `Execute action: ${action.action} with ${JSON.stringify(action.payload)}`;
      donny.sendMessage(actionMessage);
    },
    [actOnNudge, donny],
  );
```

Also add the required imports at the top of the file if not already present:
```typescript
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/DonnyProvider.tsx
git commit -m "feat: add post_now and navigate action handlers in DonnyProvider"
```

---

## Task 12: End-to-End Verification & Re-Audit

**Files:** None (testing only)

- [ ] **Step 1: Verify prerequisite gate on all 5 features**

Start the dev server:
```bash
npm run dev
```

For each of the 5 gated features, navigate as a user who is missing prerequisites and verify:
1. **Campaign creation** (`/campaign-creator`, `/dashboard/business/campaign-wizard`, `/dashboard/brand/create-campaign`) — shows full-page checklist blocker
2. **DragonShare** (`/dashboard/creator/dragonshare`, `/dashboard/business/dragonshare`) — shows full-page checklist blocker
3. **Promotions** (`/dashboard/business/promotions`, `/promo/:id`) — shows full-page checklist blocker
4. **Campaign apply** (any campaign details page) — shows inline checklist where the apply button normally is; rest of campaign details remains visible
5. **Sponsorships** (`/dashboard/brand/sponsorships`, `/dashboard/business/sponsorships`, `/dashboard/business/proposals/:id`) — shows full-page checklist blocker

- [ ] **Step 2: Verify gate clears when all prerequisites are met**

As a user who has completed profile, connected Outstand, and completed Stripe:
- Navigate to each of the 5 features above
- Verify the gate does NOT show and the feature loads normally

- [ ] **Step 3: Verify navigation links**

Click each CTA button in the checklist:
- "Complete Profile" → navigates to correct settings page for role
- "Connect Social" → navigates to Outstand manager page for role
- "Setup Stripe" → navigates to settings page (Stripe section) for role

- [ ] **Step 4: Run build to confirm no regressions**

```bash
npm run build
```

Expected: clean build with no errors.

- [ ] **Step 5: Commit any fixes from verification**

If any issues were found and fixed during verification, commit them.
