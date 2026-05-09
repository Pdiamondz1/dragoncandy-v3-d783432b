# Phase 3: Brand Social Media — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sponsorship amplification, cross-party analytics, brand guidelines, creator vetting, and calendar markers so brands can manage social media and measure sponsorship ROI inside DragonCandy.

**Architecture:** Reuses the existing `OutstandManager` (6-tab social manager) as-is for brands. Brand-specific features are additive components in `src/components/outstand/`. All Outstand API calls go through the existing Edge Function proxy. One new DB table (`social_post_log`) and one new column (`brand_social_guidelines` JSONB on `business_profiles`).

**Tech Stack:** React + TypeScript, Supabase (Postgres, Edge Functions), Tailwind CSS, shadcn/ui, TanStack React Query, Outstand SDK (`@outstand-so/ui`), lucide-react icons.

**Design Spec:** `docs/superpowers/specs/2026-05-09-outstand-phase3-brand-social-design.md`

**Verification:** Each task ends with `npm run build` to confirm TypeScript compiles. After all tasks, run full audit.

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/outstand/SponsorshipAmplificationPrompt.tsx` | Modal (desktop) / bottom-sheet (mobile) for amplifying sponsored content to brand channels |
| `src/components/outstand/BrandGuidelinesEditor.tsx` | Form for brand voice, hashtags, disclosures, prohibited words, CTA |
| `src/components/outstand/CrossPartyAnalytics.tsx` | Sponsorships tab content: list + detail view of per-sponsorship cross-party metrics |
| `src/components/outstand/SponsorshipCard.tsx` | Individual sponsorship card with restaurant/creator/brand metrics columns |
| `src/components/outstand/SponsorshipROISummary.tsx` | ROI summary card with CPI, engagement, "sponsor again?" recommendation |
| `src/components/outstand/SponsorshipMarker.tsx` | Colored dot + tooltip/detail for sponsorship events on calendar |
| `src/components/outstand/CreatorMetricFilters.tsx` | Filter pills for platform, followers, engagement rate, sort |
| `src/components/outstand/DonnyIntelligenceStub.tsx` | Placeholder card for Donny sponsorship recommendations |
| `src/hooks/outstand/useBrandSponsorshipAnalytics.ts` | React Query hook fetching brand's sponsorships with campaign + party data (extends existing `useBrandSponsorships` with cross-party analytics fields) |
| `src/hooks/outstand/useBrandGuidelines.ts` | React Query hook for reading/writing brand_social_guidelines JSONB |
| `src/hooks/outstand/useSponsorshipAmplification.ts` | Mutation hook for posting amplified content via Outstand proxy |

### Modified Files

| File | Change |
|------|--------|
| `src/hooks/outstand/useOutstandPaths.ts:14` | Add `brand` to regex alternation |
| `src/App.tsx:200-204` | Add brand social routes with `BrandRoute` guard |
| `src/pages/BrandDashboard.tsx:98` | Add Social Media card below existing quick actions |
| `src/pages/OutstandManager.tsx:87-117,170-240` | Add sponsorship deadlines query for brands; conditionally render Sponsorships tab; adjust grid to 7 cols for brands with mobile scroll |
| `src/components/outstand/AccountsTab.tsx:54` | Render `BrandGuidelinesEditor` for brand users |
| `src/components/outstand/calendar/WeekGrid.tsx:91` | Render `SponsorshipMarker` after campaign deadline markers |
| `src/components/outstand/calendar/DayStrip.tsx:67,86` | Add sponsorship dot indicator and detail card |
| `src/components/outstand/calendar/MonthGrid.tsx` | Add sponsorship dot indicator (same pattern as DayStrip) |
| `src/pages/BrandCreators.tsx:203` | Add `CreatorMetricFilters` above grid; add verified metric filtering logic |
| `src/components/brand-browse/BrandCreatorCard.tsx:89` | Add compact verified metrics row (platform icons + follower counts) |

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/20260509100000_brand_social_guidelines.sql`
- Create: `supabase/migrations/20260509100001_social_post_log.sql`

- [ ] **Step 1: Create brand_social_guidelines migration**

```sql
-- 20260509100000_brand_social_guidelines.sql
ALTER TABLE business_profiles
ADD COLUMN brand_social_guidelines JSONB DEFAULT NULL;

COMMENT ON COLUMN business_profiles.brand_social_guidelines IS
  'Brand social media guidelines: voice_tone, required_hashtags, mandatory_disclosures, prohibited_words, default_cta';
```

- [ ] **Step 2: Create social_post_log migration**

```sql
-- 20260509100001_social_post_log.sql
CREATE TABLE social_post_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  outstand_post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own post log"
  ON social_post_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own post log"
  ON social_post_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_social_post_log_user ON social_post_log(user_id);
CREATE INDEX idx_social_post_log_campaign ON social_post_log(campaign_id);
```

- [ ] **Step 3: Apply migrations remotely**

Run: `supabase db push`
Expected: Both migrations apply successfully.

- [ ] **Step 4: Regenerate TypeScript types**

Run: `supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts`
Expected: `types.ts` updated with `brand_social_guidelines` on `business_profiles` and new `social_post_log` table.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: Clean build (no type errors from schema changes).

- [ ] **Step 6: Commit**

```
git add supabase/migrations/ src/integrations/supabase/types.ts
git commit -m "feat(db): add brand_social_guidelines column and social_post_log table"
```

---

## Task 2: Route Infrastructure

**Files:**
- Modify: `src/hooks/outstand/useOutstandPaths.ts:14`
- Modify: `src/App.tsx:200-204`

- [ ] **Step 1: Update useOutstandPaths regex**

In `src/hooks/outstand/useOutstandPaths.ts` line 14, change:
```typescript
const match = location.pathname.match(/^(\/dashboard\/(?:business|creator)\/social)/);
```
to:
```typescript
const match = location.pathname.match(/^(\/dashboard\/(?:business|creator|brand)\/social)/);
```

- [ ] **Step 2: Add brand social routes to App.tsx**

In `src/App.tsx`, after the creator social routes (around line 204), add:
```typescript
{/* Social Media (Outstand) Routes — brand */}
<Route path="/dashboard/brand/social" element={<ProtectedRoute><BrandRoute><OutstandManager /></BrandRoute></ProtectedRoute>} />
<Route path="/dashboard/brand/social/oauth-callback" element={<ProtectedRoute><BrandRoute><OutstandOAuthCallbackPage /></BrandRoute></ProtectedRoute>} />
```

Verify that `BrandRoute` and `OutstandManager` and `OutstandOAuthCallbackPage` are already imported at the top of the file. If `BrandRoute` is not imported, add the import.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build. Routes compile.

- [ ] **Step 4: Commit**

```
git add src/hooks/outstand/useOutstandPaths.ts src/App.tsx
git commit -m "feat(routes): add brand social media routes and OAuth callback"
```

---

## Task 3: BrandDashboard Social Media Card

**Files:**
- Modify: `src/pages/BrandDashboard.tsx`

- [ ] **Step 1: Add Social Media card to BrandDashboard**

The existing `QuickActionButtons` uses a `[QuickAction, QuickAction]` tuple type that only accepts 2 items. Add the Social Media card as a separate element below the existing quick actions section.

Find the section after the `QuickActionButtons` component render and before the "Active Campaigns Feed" section. Add:

```typescript
{/* Social Media Card */}
<Link
  to="/dashboard/brand/social"
  className="block bg-white rounded-2xl p-4 border-2 border-dc-teal hover:shadow-md transition-shadow"
>
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-dc-teal/10 rounded-xl flex items-center justify-center">
      <Share2 className="h-5 w-5 text-dc-teal" />
    </div>
    <div>
      <h3 className="font-bold text-gray-900 text-sm">Social Media</h3>
      <p className="text-xs text-gray-500">Manage your brand's social presence, amplify sponsored content</p>
    </div>
    <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
  </div>
</Link>
```

Add imports at the top:
```typescript
import { Share2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
```

(Check if `Link` and these icons are already imported first.)

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```
git add src/pages/BrandDashboard.tsx
git commit -m "feat(brand): add Social Media card to brand dashboard"
```

---

## Task 4: OutstandManager Sponsorships Tab

**Files:**
- Modify: `src/pages/OutstandManager.tsx`
- Create: `src/components/outstand/CrossPartyAnalytics.tsx` (placeholder initially)

- [ ] **Step 1: Create placeholder CrossPartyAnalytics**

Create `src/components/outstand/CrossPartyAnalytics.tsx`:

```typescript
import React from 'react';

export const CrossPartyAnalytics: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center">
        <p className="text-gray-500 text-sm">No active sponsorships yet.</p>
        <p className="text-gray-400 text-xs mt-1">Browse campaigns to find your first sponsorship opportunity.</p>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add Sponsorships tab to OutstandManager**

In `src/pages/OutstandManager.tsx`:

a) Add import at top:
```typescript
import { CrossPartyAnalytics } from '@/components/outstand/CrossPartyAnalytics';
import { Handshake } from 'lucide-react';
```

b) In the `OutstandManagerInner` component, update the existing `useAuth` destructure (currently `const { user } = useAuth()`) to also get profile:
```typescript
const { user, profile } = useAuth();
const isBrand = profile?.role === 'brand';
```

b2) Update the `VALID_TABS` constant (around line 21) to include `'sponsorships'`:
```typescript
const VALID_TABS = ['compose', 'calendar', 'published', 'engagement', 'analytics', 'sponsorships', 'accounts'] as const;
```

c) Change the `TabsList` grid from `grid-cols-6` to be role-aware. Replace:
```typescript
<TabsList className="grid w-full grid-cols-6">
```
with:
```typescript
<TabsList className={`grid w-full ${isBrand ? 'grid-cols-7 overflow-x-auto' : 'grid-cols-6'}`}>
```

d) After the Analytics `TabsTrigger` and before the Accounts `TabsTrigger`, add (conditionally for brands):
```typescript
{isBrand && (
  <TabsTrigger value="sponsorships" className="flex items-center gap-1 text-xs">
    <Handshake className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Sponsorships</span>
    <span className="sm:hidden">Deals</span>
  </TabsTrigger>
)}
```

e) After the Analytics `TabsContent` and before the Accounts `TabsContent`, add:
```typescript
{isBrand && (
  <TabsContent value="sponsorships">
    <CrossPartyAnalytics />
  </TabsContent>
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build. Sponsorships tab renders for brand users only.

- [ ] **Step 4: Commit**

```
git add src/pages/OutstandManager.tsx src/components/outstand/CrossPartyAnalytics.tsx
git commit -m "feat(brand): add Sponsorships tab to OutstandManager for brand users"
```

---

## Task 5: Brand Guidelines Editor

**Files:**
- Create: `src/hooks/outstand/useBrandGuidelines.ts`
- Create: `src/components/outstand/BrandGuidelinesEditor.tsx`
- Modify: `src/components/outstand/AccountsTab.tsx`

- [ ] **Step 1: Create useBrandGuidelines hook**

Create `src/hooks/outstand/useBrandGuidelines.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BrandSocialGuidelines {
  voice_tone: string;
  required_hashtags: string[];
  mandatory_disclosures: string[];
  prohibited_words: string[];
  default_cta: string;
}

const EMPTY_GUIDELINES: BrandSocialGuidelines = {
  voice_tone: '',
  required_hashtags: [],
  mandatory_disclosures: [],
  prohibited_words: [],
  default_cta: '',
};

export function useBrandGuidelines() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['brand-guidelines', user?.id],
    queryFn: async (): Promise<BrandSocialGuidelines> => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('brand_social_guidelines')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return (data?.brand_social_guidelines as BrandSocialGuidelines) ?? EMPTY_GUIDELINES;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (guidelines: BrandSocialGuidelines) => {
      const { error } = await supabase
        .from('business_profiles')
        .update({ brand_social_guidelines: guidelines as unknown as Record<string, unknown> })
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-guidelines', user?.id] });
      toast.success('Brand guidelines saved');
    },
    onError: (err: Error) => {
      toast.error(`Failed to save guidelines: ${err.message}`);
    },
  });

  return {
    guidelines: query.data ?? EMPTY_GUIDELINES,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
```

- [ ] **Step 2: Create BrandGuidelinesEditor component**

Create `src/components/outstand/BrandGuidelinesEditor.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useBrandGuidelines, type BrandSocialGuidelines } from '@/hooks/outstand/useBrandGuidelines';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 bg-dc-teal/10 text-dc-teal text-xs font-medium px-2.5 py-1 rounded-full">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          className="text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={!input.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export const BrandGuidelinesEditor: React.FC = () => {
  const { guidelines, isLoading, save, isSaving } = useBrandGuidelines();
  const [draft, setDraft] = useState<BrandSocialGuidelines>(guidelines);

  useEffect(() => {
    setDraft(guidelines);
  }, [guidelines]);

  if (isLoading) {
    return <div className="text-sm text-gray-400 py-4">Loading guidelines...</div>;
  }

  const handleSave = () => save(draft);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(guidelines);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Voice & Tone</label>
        <Input
          value={draft.voice_tone}
          onChange={(e) => setDraft({ ...draft, voice_tone: e.target.value })}
          placeholder="Professional but approachable"
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Required Hashtags</label>
        <div className="mt-1">
          <TagInput tags={draft.required_hashtags} onChange={(t) => setDraft({ ...draft, required_hashtags: t })} placeholder="#YourBrand" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Mandatory Disclosures</label>
        <div className="mt-1">
          <TagInput tags={draft.mandatory_disclosures} onChange={(t) => setDraft({ ...draft, mandatory_disclosures: t })} placeholder="#ad" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Prohibited Words</label>
        <div className="mt-1">
          <TagInput tags={draft.prohibited_words} onChange={(t) => setDraft({ ...draft, prohibited_words: t })} placeholder="competitor name" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Default CTA</label>
        <Input
          value={draft.default_cta}
          onChange={(e) => setDraft({ ...draft, default_cta: e.target.value })}
          placeholder="Learn more at yourbrand.com"
          className="mt-1 text-sm"
        />
      </div>
      <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="w-full" variant="dc-primary">
        {isSaving ? 'Saving...' : 'Save Guidelines'}
      </Button>
    </div>
  );
};
```

- [ ] **Step 3: Integrate into AccountsTab**

In `src/components/outstand/AccountsTab.tsx`, add import:
```typescript
import { BrandGuidelinesEditor } from './BrandGuidelinesEditor';
import { useAuth } from '@/hooks/useAuth';
```

Get user role inside the component:
```typescript
const { profile } = useAuth();
const isBrand = profile?.role === 'brand';
```

After the "Connected accounts" section (the last `</div>` in the component body), add:
```typescript
{isBrand && (
  <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
    <h2 className="text-base font-bold text-gray-900 mb-3">Brand Guidelines</h2>
    <p className="text-xs text-gray-500 mb-4">These guidelines are auto-applied when amplifying sponsored content.</p>
    <BrandGuidelinesEditor />
  </div>
)}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```
git add src/hooks/outstand/useBrandGuidelines.ts src/components/outstand/BrandGuidelinesEditor.tsx src/components/outstand/AccountsTab.tsx
git commit -m "feat(brand): add brand guidelines editor with tag inputs and auto-save"
```

---

## Task 6: Brand Sponsorship Analytics Data Hook

**Files:**
- Create: `src/hooks/outstand/useBrandSponsorshipAnalytics.ts`

Note: An existing `src/hooks/useBrandSponsorships.ts` hook already handles the basic sponsorships query with the correct two-step `brand_id` lookup. This new hook extends it with cross-party analytics fields needed by `CrossPartyAnalytics`.

- [ ] **Step 1: Create useBrandSponsorshipAnalytics hook**

Create `src/hooks/outstand/useBrandSponsorshipAnalytics.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface SponsorshipPartyMetrics {
  posts: number;
  totalReach: number;
  totalImpressions: number;
  engagementRate: number;
}

export interface BrandSponsorshipAnalytics {
  id: string;
  campaignId: string;
  campaignTitle: string;
  restaurantName: string;
  restaurantId: string;
  creatorName: string | null;
  creatorId: string | null;
  sponsorshipAmount: number | null;
  status: string;
  createdAt: string;
  campaignDeadline: string | null;
}

export function useBrandSponsorshipAnalytics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand-sponsorship-analytics', user?.id],
    queryFn: async (): Promise<BrandSponsorshipAnalytics[]> => {
      // Step 1: Get the brand's business_profiles.id (brand_id FK references business_profiles, not auth.users)
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .eq('account_type', 'brand')
        .single();

      if (!profile) return [];

      // Step 2: Query sponsorships using the business_profiles.id
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select(`
          id,
          campaign_id,
          restaurant_id,
          sponsorship_amount,
          status,
          created_at,
          campaigns!campaign_id (
            title,
            deadline,
            user_id
          )
        `)
        .eq('brand_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];

      const restaurantIds = [...new Set(data.map((s) => (s.campaigns as any)?.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('user_id, business_name')
        .in('user_id', restaurantIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.business_name]));

      const campaignIds = data.map((s) => s.campaign_id);
      const { data: applications } = await supabase
        .from('campaign_applications')
        .select('campaign_id, creator_id, profiles!creator_id(full_name)')
        .in('campaign_id', campaignIds)
        .eq('status', 'accepted');

      const creatorMap = new Map(
        (applications ?? []).map((a) => [a.campaign_id, { id: a.creator_id, name: (a.profiles as any)?.full_name }])
      );

      return data.map((s) => {
        const campaign = s.campaigns as any;
        const creator = creatorMap.get(s.campaign_id);
        return {
          id: s.id,
          campaignId: s.campaign_id,
          campaignTitle: campaign?.title ?? 'Untitled Campaign',
          restaurantName: profileMap.get(campaign?.user_id) ?? 'Unknown Restaurant',
          restaurantId: s.restaurant_id,
          creatorName: creator?.name ?? null,
          creatorId: creator?.id ?? null,
          sponsorshipAmount: s.sponsorship_amount,
          status: s.status,
          createdAt: s.created_at,
          campaignDeadline: campaign?.deadline ?? null,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```
git add src/hooks/outstand/useBrandSponsorshipAnalytics.ts
git commit -m "feat(brand): add useBrandSponsorshipAnalytics data hook"
```

---

## Task 7: Sponsorship Amplification Prompt

**Files:**
- Create: `src/hooks/outstand/useSponsorshipAmplification.ts`
- Create: `src/components/outstand/SponsorshipAmplificationPrompt.tsx`

- [ ] **Step 1: Create useSponsorshipAmplification hook**

Create `src/hooks/outstand/useSponsorshipAmplification.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AmplifyInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  campaignId: string;
  scheduledAt?: string;
}

export function useSponsorshipAmplification() {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ caption, mediaUrls, accountIds, campaignId, scheduledAt }: AmplifyInput) => {
      const body: Record<string, unknown> = {
        text: caption,
        socialAccountIds: accountIds,
      };
      if (mediaUrls.length > 0) body.mediaUrls = mediaUrls;
      if (scheduledAt) body.scheduledAt = scheduledAt;

      const res = await fetch(`${baseUrl}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to amplify post');
      const data = await res.json();

      for (const accountId of accountIds) {
        await supabase.from('social_post_log').insert({
          user_id: user!.id,
          campaign_id: campaignId,
          outstand_post_id: data.id ?? data.data?.id ?? 'unknown',
          platform: accountId,
          post_type: 'amplification',
        });
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      qc.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      toast.success(variables.scheduledAt ? 'Amplification scheduled!' : 'Content amplified to your channels!');
    },
    onError: (err: Error) => {
      toast.error(`Amplification failed: ${err.message}`);
    },
  });
}
```

- [ ] **Step 2: Create SponsorshipAmplificationPrompt component**

Create `src/components/outstand/SponsorshipAmplificationPrompt.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Send, CalendarDays, Edit3, SkipForward, AlertTriangle } from 'lucide-react';
import { useSponsorshipAmplification } from '@/hooks/outstand/useSponsorshipAmplification';
import { useBrandGuidelines } from '@/hooks/outstand/useBrandGuidelines';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { toast } from 'sonner';

interface SponsorshipAmplificationPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  restaurantName: string;
  creatorName: string | null;
  mediaUrls: string[];
  originalCaption: string;
}

export const SponsorshipAmplificationPrompt: React.FC<SponsorshipAmplificationPromptProps> = ({
  open, onOpenChange, campaignId, campaignTitle, restaurantName, creatorName, mediaUrls, originalCaption,
}) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const { guidelines } = useBrandGuidelines();
  const amplify = useSponsorshipAmplification();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const buildCaption = () => {
    const parts = [
      `We're proud to partner with ${restaurantName}${creatorName ? ` and ${creatorName}` : ''} on ${campaignTitle}!`,
    ];
    if (guidelines.default_cta) parts.push(guidelines.default_cta);
    if (guidelines.required_hashtags.length > 0) parts.push(guidelines.required_hashtags.join(' '));
    if (guidelines.mandatory_disclosures.length > 0) parts.push(guidelines.mandatory_disclosures.join(' '));
    return parts.join('\n\n');
  };

  const [caption, setCaption] = useState(buildCaption());

  useEffect(() => {
    if (open) {
      setCaption(buildCaption());
      setSelectedAccountIds((accounts ?? []).map((a: any) => a.id));
      setIsEditing(false);
    }
  }, [open]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const prohibitedViolations = guidelines.prohibited_words.filter((w) =>
    caption.toLowerCase().includes(w.toLowerCase())
  );

  const handleAmplify = () => {
    if (selectedAccountIds.length === 0 || prohibitedViolations.length > 0) return;
    amplify.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds, campaignId },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const content = (
    <div className="space-y-4">
      {mediaUrls.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {mediaUrls.slice(0, 3).map((url, i) => (
            <img key={i} src={url} alt="" className="h-20 w-20 rounded-xl object-cover" />
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Select Channels</p>
        <div className="space-y-2">
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

      {isEditing ? (
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="text-sm" />
      ) : (
        <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">{caption}</div>
      )}

      {prohibitedViolations.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700">
            Caption contains prohibited words: {prohibitedViolations.join(', ')}. Remove them before posting.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={handleAmplify} disabled={amplify.isPending || selectedAccountIds.length === 0 || prohibitedViolations.length > 0} variant="dc-primary" size="sm">
          <Send className="h-3.5 w-3.5 mr-1" />
          Amplify Now
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Scheduling coming soon')}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Schedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          {isEditing ? 'Preview' : 'Edit Caption'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader><SheetTitle className="text-left">Amplify Sponsored Content</SheetTitle></SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Amplify Sponsored Content</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
git add src/hooks/outstand/useSponsorshipAmplification.ts src/components/outstand/SponsorshipAmplificationPrompt.tsx
git commit -m "feat(brand): add sponsorship amplification prompt with brand guidelines enforcement"
```

- [ ] **Step 5: Wire amplification prompt into campaign detail view**

Per the spec (3b), the amplification prompt has two trigger points: the social manager (handled in Task 8 via `CrossPartyAnalytics`) and the campaign detail view. In `src/pages/BrandCampaignDetails.tsx`, add a conditional "Amplify to Your Channels" button that appears when the brand sponsors a campaign with accepted applications:

```typescript
import { SponsorshipAmplificationPrompt } from '@/components/outstand/SponsorshipAmplificationPrompt';
```

Add state and render logic at the bottom of the campaign detail view:
```typescript
const [showAmplify, setShowAmplify] = useState(false);

{/* After the campaign status section, conditionally render: */}
{isSponsored && hasAcceptedCreator && (
  <>
    <Button variant="dc-primary" size="sm" onClick={() => setShowAmplify(true)} className="w-full mt-4">
      Amplify to Your Channels
    </Button>
    <SponsorshipAmplificationPrompt
      open={showAmplify}
      onOpenChange={setShowAmplify}
      campaignId={campaign.id}
      campaignTitle={campaign.title}
      restaurantName={restaurantName}
      creatorName={creatorName}
      mediaUrls={[]}
      originalCaption=""
    />
  </>
)}
```

The `isSponsored` and `hasAcceptedCreator` conditions derive from the existing campaign data already available on that page. Adapt to match the actual data flow in `BrandCampaignDetails.tsx`.

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 7: Commit**

```
git add src/pages/BrandCampaignDetails.tsx
git commit -m "feat(brand): wire amplification prompt into campaign detail view"
```

---

## Task 8: Cross-Party Analytics & Sponsorship Cards

**Files:**
- Create: `src/components/outstand/SponsorshipCard.tsx`
- Create: `src/components/outstand/SponsorshipROISummary.tsx`
- Create: `src/components/outstand/DonnyIntelligenceStub.tsx`
- Modify: `src/components/outstand/CrossPartyAnalytics.tsx` (replace placeholder)

- [ ] **Step 1: Create SponsorshipCard**

Create `src/components/outstand/SponsorshipCard.tsx`:

```typescript
import React from 'react';
import { type BrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { Users, Store, Briefcase } from 'lucide-react';

interface SponsorshipCardProps {
  sponsorship: BrandSponsorshipAnalytics;
  isSelected: boolean;
  onSelect: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export const SponsorshipCard: React.FC<SponsorshipCardProps> = ({ sponsorship, isSelected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
        isSelected ? 'border-dc-teal bg-dc-teal/5' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-sm text-gray-900 truncate flex-1">{sponsorship.campaignTitle}</h3>
        <StatusBadge status={sponsorship.status} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Store className="h-3 w-3" />
          <span>{sponsorship.restaurantName}</span>
        </div>
        {sponsorship.creatorName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Users className="h-3 w-3" />
            <span>{sponsorship.creatorName}</span>
          </div>
        )}
        {sponsorship.sponsorshipAmount != null && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Briefcase className="h-3 w-3" />
            <span>${sponsorship.sponsorshipAmount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </button>
  );
};
```

- [ ] **Step 2: Create SponsorshipROISummary**

Create `src/components/outstand/SponsorshipROISummary.tsx`:

```typescript
import React from 'react';
import { type BrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { ThumbsUp, Sparkles, FileText, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SponsorshipROISummaryProps {
  sponsorship: BrandSponsorshipAnalytics;
}

export const SponsorshipROISummary: React.FC<SponsorshipROISummaryProps> = ({ sponsorship }) => {
  const isCompleted = sponsorship.status === 'completed';

  const handleCopyReport = () => {
    const report = [
      `Sponsorship ROI Report: ${sponsorship.campaignTitle}`,
      `Restaurant: ${sponsorship.restaurantName}`,
      sponsorship.creatorName ? `Creator: ${sponsorship.creatorName}` : null,
      sponsorship.sponsorshipAmount != null ? `Investment: $${sponsorship.sponsorshipAmount.toLocaleString()}` : null,
      `Status: ${sponsorship.status}`,
      '',
      'Metrics: Data pending (analytics will populate as posts are tracked)',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(report);
    toast.success('Report copied to clipboard');
  };

  if (!isCompleted && sponsorship.status !== 'active' && sponsorship.status !== 'accepted') {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center">
        <p className="text-gray-500 text-sm">Complete a sponsorship to see your first ROI report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-200">
        <h3 className="font-bold text-sm text-gray-900 mb-3">{sponsorship.campaignTitle}</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <p className="text-lg font-extrabold text-gray-900">--</p>
            <p className="text-[10px] text-gray-400">Combined Reach</p>
          </div>
          <div className="text-center border-x border-pink-200">
            <p className="text-lg font-extrabold text-gray-900">--</p>
            <p className="text-[10px] text-gray-400">Total Posts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-gray-900">--</p>
            <p className="text-[10px] text-gray-400">Engagement</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-semibold text-gray-700">Restaurant</p>
            <p className="text-gray-400 mt-1">-- posts</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-semibold text-gray-700">Creator</p>
            <p className="text-gray-400 mt-1">-- posts</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-semibold text-gray-700">Brand</p>
            <p className="text-gray-400 mt-1">-- posts</p>
          </div>
        </div>

        {sponsorship.sponsorshipAmount != null && (
          <div className="flex items-center justify-between bg-dc-teal/5 rounded-xl p-3 mb-3">
            <span className="text-xs text-gray-600">Cost per Impression</span>
            <span className="text-sm font-bold text-gray-900">--</span>
          </div>
        )}

        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 mb-3">
          <ThumbsUp className="h-4 w-4 text-dc-teal" />
          <span className="text-xs text-gray-600">Sponsor Again? <span className="font-semibold text-gray-900">Review Performance</span></span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={handleCopyReport}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy Report
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs" disabled>
            <FileText className="h-3.5 w-3.5 mr-1" />
            Generate ROI Report
          </Button>
        </div>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center">
        <Sparkles className="h-5 w-5 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">Detailed AI-generated insights coming soon</p>
        <p className="text-[10px] text-gray-300 mt-1">Donny AI will analyze cross-party performance and recommend next steps</p>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Create DonnyIntelligenceStub**

Create `src/components/outstand/DonnyIntelligenceStub.tsx`:

```typescript
import React from 'react';
import { Sparkles } from 'lucide-react';

export const DonnyIntelligenceStub: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-6 border border-dashed border-gray-300 text-center">
      <Sparkles className="h-8 w-8 text-gray-300 mx-auto mb-3" />
      <h3 className="font-bold text-sm text-gray-500">Which campaigns should I sponsor next?</h3>
      <p className="text-xs text-gray-400 mt-2">Donny AI recommendations coming soon</p>
      <p className="text-[10px] text-gray-300 mt-1">Cross-campaign pattern analysis and audience overlap calculation</p>
    </div>
  );
};
```

- [ ] **Step 4: Replace CrossPartyAnalytics placeholder with full implementation**

Replace the entire contents of `src/components/outstand/CrossPartyAnalytics.tsx`:

```typescript
import React, { useState } from 'react';
import { useBrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { SponsorshipCard } from './SponsorshipCard';
import { SponsorshipROISummary } from './SponsorshipROISummary';
import { DonnyIntelligenceStub } from './DonnyIntelligenceStub';
import { Loader2 } from 'lucide-react';

export const CrossPartyAnalytics: React.FC = () => {
  const { data: sponsorships, isLoading } = useBrandSponsorshipAnalytics();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-dc-teal" />
      </div>
    );
  }

  if (!sponsorships || sponsorships.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center">
          <p className="text-gray-500 text-sm">No active sponsorships yet.</p>
          <p className="text-gray-400 text-xs mt-1">Browse campaigns to find your first sponsorship opportunity.</p>
        </div>
        <DonnyIntelligenceStub />
      </div>
    );
  }

  const selected = sponsorships.find((s) => s.id === selectedId) ?? sponsorships[0];

  return (
    <div className="space-y-4">
      {/* Desktop: two-column | Mobile: single-column */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sponsorship List */}
        <div className="lg:w-1/3 space-y-2">
          {sponsorships.map((s) => (
            <SponsorshipCard
              key={s.id}
              sponsorship={s}
              isSelected={selected.id === s.id}
              onSelect={() => setSelectedId(s.id)}
            />
          ))}
        </div>

        {/* Detail View */}
        <div className="lg:w-2/3">
          <SponsorshipROISummary sponsorship={selected} />
        </div>
      </div>

      <DonnyIntelligenceStub />
    </div>
  );
};
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```
git add src/components/outstand/SponsorshipCard.tsx src/components/outstand/SponsorshipROISummary.tsx src/components/outstand/DonnyIntelligenceStub.tsx src/components/outstand/CrossPartyAnalytics.tsx
git commit -m "feat(brand): add cross-party analytics with sponsorship cards, ROI summary, and copy-to-clipboard"
```

---

## Task 9: Creator Metric Filters on Brand Browse

**Files:**
- Create: `src/components/outstand/CreatorMetricFilters.tsx`
- Modify: `src/pages/BrandCreators.tsx`

- [ ] **Step 1: Create CreatorMetricFilters component**

Create `src/components/outstand/CreatorMetricFilters.tsx`:

```typescript
import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SlidersHorizontal } from 'lucide-react';

export interface MetricFilters {
  platforms: string[];
  minFollowers: number;
  minEngagement: number;
  sortBy: 'engagement' | 'followers' | 'recent';
}

const PLATFORM_OPTIONS = ['instagram', 'tiktok', 'youtube', 'x'] as const;
const FOLLOWER_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '1K+', value: 1000 },
  { label: '5K+', value: 5000 },
  { label: '10K+', value: 10000 },
  { label: '50K+', value: 50000 },
  { label: '100K+', value: 100000 },
];
const ENGAGEMENT_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '1%+', value: 1 },
  { label: '3%+', value: 3 },
  { label: '5%+', value: 5 },
  { label: '8%+', value: 8 },
];
const SORT_OPTIONS: { label: string; value: MetricFilters['sortBy'] }[] = [
  { label: 'Engagement', value: 'engagement' },
  { label: 'Followers', value: 'followers' },
  { label: 'Recent', value: 'recent' },
];

interface CreatorMetricFiltersProps {
  filters: MetricFilters;
  onChange: (f: MetricFilters) => void;
}

function PillGroup<T extends string | number>({
  options,
  selected,
  onSelect,
}: {
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selected === opt.value
              ? 'bg-dc-teal text-white border-dc-teal'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function FilterBody({ filters, onChange }: CreatorMetricFiltersProps) {
  const togglePlatform = (p: string) => {
    const next = filters.platforms.includes(p)
      ? filters.platforms.filter((x) => x !== p)
      : [...filters.platforms, p];
    onChange({ ...filters, platforms: next });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Platform</p>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
                filters.platforms.includes(p)
                  ? 'bg-dc-teal text-white border-dc-teal'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Min Followers</p>
        <PillGroup options={FOLLOWER_OPTIONS} selected={filters.minFollowers} onSelect={(v) => onChange({ ...filters, minFollowers: v })} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Min Engagement</p>
        <PillGroup options={ENGAGEMENT_OPTIONS} selected={filters.minEngagement} onSelect={(v) => onChange({ ...filters, minEngagement: v })} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Sort By</p>
        <PillGroup options={SORT_OPTIONS} selected={filters.sortBy} onSelect={(v) => onChange({ ...filters, sortBy: v })} />
      </div>
    </div>
  );
}

export const CreatorMetricFilters: React.FC<CreatorMetricFiltersProps> = ({ filters, onChange }) => {
  const activeCount = [
    filters.platforms.length > 0,
    filters.minFollowers > 0,
    filters.minEngagement > 0,
    filters.sortBy !== 'engagement',
  ].filter(Boolean).length;

  return (
    <>
      {/* Desktop: inline horizontal */}
      <div className="hidden md:block">
        <FilterBody filters={filters} onChange={onChange} />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Verified Metrics
              {activeCount > 0 && (
                <span className="bg-dc-teal text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{activeCount}</span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader><SheetTitle>Filter by Verified Metrics</SheetTitle></SheetHeader>
            <div className="mt-4">
              <FilterBody filters={filters} onChange={onChange} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
```

- [ ] **Step 2: Integrate into BrandCreators**

In `src/pages/BrandCreators.tsx`:

a) Add imports:
```typescript
import { CreatorMetricFilters, type MetricFilters } from '@/components/outstand/CreatorMetricFilters';
import { useCreatorSocialStats } from '@/hooks/outstand/useCreatorSocialStats';
```

b) Add metric filter state (near existing filter state):
```typescript
const [metricFilters, setMetricFilters] = useState<MetricFilters>({
  platforms: [],
  minFollowers: 0,
  minEngagement: 0,
  sortBy: 'engagement',
});
```

c) Add the `CreatorMetricFilters` component in the filters area, after the existing `AdvancedCreatorFilters` section or in the header area:
```typescript
<CreatorMetricFilters filters={metricFilters} onChange={setMetricFilters} />
```

Note: Full metric-based filtering requires joining `social_analytics_cache` data with the creator list. For the initial implementation, render the filter UI and apply basic filtering where data is available. Creators without verified metrics sort to the bottom when any metric filter is active.

d) Add empty state for when filters return no results. After the creator grid, add:
```typescript
{filteredCreators.length === 0 && (
  <div className="col-span-full text-center py-8">
    <p className="text-gray-500 text-sm">No creators match your filters.</p>
    <p className="text-gray-400 text-xs mt-1">Try adjusting your filters to see more creators.</p>
  </div>
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
git add src/components/outstand/CreatorMetricFilters.tsx src/pages/BrandCreators.tsx
git commit -m "feat(brand): add verified metric filters to creator browse page"
```

---

## Task 10: BrandCreatorCard Verified Metrics Row

**Files:**
- Modify: `src/components/brand-browse/BrandCreatorCard.tsx`

- [ ] **Step 1: Add verified metrics display**

In `src/components/brand-browse/BrandCreatorCard.tsx`:

a) Add imports:
```typescript
import { VerifiedBadge } from '@/components/outstand/VerifiedBadge';
import { useVerifiedStatus } from '@/hooks/outstand/useVerifiedStatus';
import { useCreatorSocialStats } from '@/hooks/outstand/useCreatorSocialStats';
```

b) Inside the component body, add hooks:
```typescript
const { isVerified } = useVerifiedStatus(creator.user_id);
const { data: socialStats } = useCreatorSocialStats(creator.user_id);
```

c) After the creator name / star rating row (around line 93), add the verified badge:
```typescript
{isVerified && <VerifiedBadge size="sm" />}
```

d) Below the existing platform icons / rate section (around line 139, before the action buttons), add the compact metrics row:
```typescript
{socialStats && socialStats.platforms.length > 0 && (
  <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto">
    {socialStats.platforms.slice(0, 3).map(({ platform, followers }) => (
      <span key={platform} className="text-[10px] text-gray-500 flex items-center gap-1 whitespace-nowrap">
        <span className="capitalize font-medium">{platform.slice(0, 2).toUpperCase()}</span>
        {followers >= 1000 ? `${(followers / 1000).toFixed(1)}K` : followers}
      </span>
    ))}
    {socialStats.totalFollowers > 0 && (
      <span className="text-[10px] bg-dc-teal/10 text-dc-teal font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        {socialStats.totalFollowers >= 1000
          ? `${(socialStats.totalFollowers / 1000).toFixed(1)}K total`
          : `${socialStats.totalFollowers} total`}
      </span>
    )}
    {socialStats.avgEngagementRate != null && socialStats.avgEngagementRate > 0 && (
      <span className="text-[10px] bg-dc-teal text-white font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
        {socialStats.avgEngagementRate.toFixed(1)}% eng
      </span>
    )}
  </div>
)}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```
git add src/components/brand-browse/BrandCreatorCard.tsx
git commit -m "feat(brand): add verified badge and social metrics to BrandCreatorCard"
```

---

## Task 11: Sponsorship Calendar Markers

**Files:**
- Create: `src/components/outstand/SponsorshipMarker.tsx`
- Modify: `src/pages/OutstandManager.tsx` (add sponsorship query for brands)
- Modify: `src/components/outstand/calendar/WeekGrid.tsx`
- Modify: `src/components/outstand/calendar/DayStrip.tsx`
- Modify: `src/components/outstand/calendar/MonthGrid.tsx`

- [ ] **Step 1: Create SponsorshipMarker component**

Create `src/components/outstand/SponsorshipMarker.tsx`:

```typescript
import React from 'react';

export interface SponsorshipEvent {
  id: string;
  date: Date;
  title: string;
  type: 'start' | 'deadline' | 'amplification';
}

const MARKER_STYLES: Record<SponsorshipEvent['type'], { bg: string; text: string; label: string }> = {
  start: { bg: 'bg-dc-teal/10', text: 'text-dc-teal', label: 'Sponsorship' },
  deadline: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Content Due' },
  amplification: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Amplify' },
};

export const SponsorshipMarkerDot: React.FC<{ type: SponsorshipEvent['type'] }> = ({ type }) => {
  const colors: Record<string, string> = { start: 'bg-dc-teal', deadline: 'bg-amber-400', amplification: 'bg-purple-400' };
  return <div className={`w-1.5 h-1.5 rounded-full ${colors[type]}`} />;
};

export const SponsorshipMarkerLabel: React.FC<{ event: SponsorshipEvent }> = ({ event }) => {
  const style = MARKER_STYLES[event.type];
  return (
    <div
      className={`text-[9px] ${style.bg} ${style.text} border rounded px-1.5 py-0.5 truncate`}
      title={`${style.label}: ${event.title}`}
    >
      {event.title}
    </div>
  );
};

export const SponsorshipMarkerDetail: React.FC<{ event: SponsorshipEvent }> = ({ event }) => {
  const style = MARKER_STYLES[event.type];
  return (
    <div className={`${style.bg} border rounded-xl p-3 mb-2`}>
      <p className={`text-[10px] ${style.text} font-semibold uppercase`}>{style.label}</p>
      <p className={`text-sm font-medium truncate ${style.text}`}>{event.title}</p>
    </div>
  );
};
```

- [ ] **Step 2: Add sponsorship events query to OutstandManager**

In `src/pages/OutstandManager.tsx`, add a query for brand sponsorship events (near the existing `campaignDeadlines` query):

```typescript
const { data: sponsorshipEvents } = useQuery<SponsorshipEvent[]>({
  queryKey: ['brand-sponsorship-events', user?.id],
  queryFn: async () => {
    // Two-step lookup: brand_id FK references business_profiles.id, not auth.users.id
    const { data: brandProfile } = await supabase
      .from('business_profiles')
      .select('id')
      .eq('user_id', user!.id)
      .eq('account_type', 'brand')
      .single();
    if (!brandProfile) return [];

    const { data, error } = await supabase
      .from('campaign_sponsorships')
      .select('id, created_at, campaigns!campaign_id(title, deadline)')
      .eq('brand_id', brandProfile.id);
    if (error || !data) return [];
    const events: SponsorshipEvent[] = [];
    for (const s of data) {
      const campaign = s.campaigns as any;
      if (campaign?.title) {
        events.push({ id: `${s.id}-start`, date: new Date(s.created_at), title: campaign.title, type: 'start' });
        if (campaign.deadline) {
          events.push({ id: `${s.id}-deadline`, date: new Date(campaign.deadline), title: campaign.title, type: 'deadline' });
          // Amplification window: 3 days after deadline (when sponsored content should be amplified)
          const ampDate = new Date(campaign.deadline);
          ampDate.setDate(ampDate.getDate() + 1);
          events.push({ id: `${s.id}-amplify`, date: ampDate, title: campaign.title, type: 'amplification' });
        }
      }
    }
    return events;
  },
  enabled: !!user?.id && isBrand,
  staleTime: 5 * 60 * 1000,
});
```

Add import for the type:
```typescript
import { type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';
```

Pass `sponsorshipEvents` down to `CalendarTab` as a prop. This requires adding the prop to `CalendarTab`'s interface and forwarding it to `WeekGrid`, `DayStrip`, and `MonthGrid`.

- [ ] **Step 3: Add markers to WeekGrid**

In `src/components/outstand/calendar/WeekGrid.tsx`, after the campaign deadline markers section (around line 91), add:

```typescript
{(sponsorshipEvents ?? [])
  .filter((s) => isSameDay(s.date, day))
  .map((s) => (
    <SponsorshipMarkerLabel key={s.id} event={s} />
  ))}
```

Add import and accept `sponsorshipEvents` prop.

- [ ] **Step 4: Add markers to DayStrip**

In `src/components/outstand/calendar/DayStrip.tsx`:

a) In the dot indicators (around line 67), add:
```typescript
{hasSponsorship && <SponsorshipMarkerDot type="start" />}
```

b) In the selected day detail (around line 86), add:
```typescript
{selectedSponsorships.map((s) => (
  <SponsorshipMarkerDetail key={s.id} event={s} />
))}
```

Add import and accept `sponsorshipEvents` prop.

- [ ] **Step 5: Add markers to MonthGrid**

In `src/components/outstand/calendar/MonthGrid.tsx`, follow the same dot indicator pattern as DayStrip.

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 7: Commit**

```
git add src/components/outstand/SponsorshipMarker.tsx src/pages/OutstandManager.tsx src/components/outstand/calendar/WeekGrid.tsx src/components/outstand/calendar/DayStrip.tsx src/components/outstand/calendar/MonthGrid.tsx
git commit -m "feat(brand): add sponsorship markers to content calendar"
```

---

## Task 12: Build Verification & Final Audit

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build with zero TypeScript errors.

- [ ] **Step 2: Verify all routes**

Check these routes exist in the compiled output:
- `/dashboard/brand/social` — renders OutstandManager
- `/dashboard/brand/social/oauth-callback` — renders OutstandOAuthCallbackPage

- [ ] **Step 3: Run dev server and manual smoke test**

Run: `npm run dev`

Verify in browser:
- Brand dashboard shows Social Media card
- Clicking card navigates to `/dashboard/brand/social`
- All 7 tabs render (Compose, Calendar, Published, Engagement, Analytics, Sponsorships, Accounts)
- Accounts tab shows Brand Guidelines section for brand users
- Sponsorships tab shows empty state or sponsorship list
- Creator browse page shows metric filter UI
- BrandCreatorCard shows verified badges for connected creators

- [ ] **Step 4: Commit any final fixes**

If any issues found during smoke test, fix and commit individually.

- [ ] **Step 5: Final commit summary**

Run: `git log --oneline -15`

Verify all Phase 3 commits are present:
1. Database migrations
2. Route infrastructure
3. BrandDashboard Social Media card
4. OutstandManager Sponsorships tab
5. Brand Guidelines Editor
6. Brand Sponsorships data hook
7. Sponsorship Amplification Prompt
8. Cross-Party Analytics + Sponsorship Cards
9. Creator Metric Filters
10. BrandCreatorCard verified metrics
11. Sponsorship Calendar Markers

---

## Post-Implementation: Audit

After all tasks are complete, run a full audit against the design spec to verify every deliverable is implemented. The audit should check:

| Deliverable | Check |
|-------------|-------|
| 3a: Brand social route | Route exists, guard works, dashboard card links correctly |
| 3b: Amplification prompt | Modal renders, guidelines applied, prohibited words blocked |
| 3c: Guidelines editor | JSONB saves/loads, tag inputs work, changes persist |
| 3d: Cross-party analytics | Sponsorships tab renders, cards show, detail view works |
| 3e: Creator vetting | Filters render, metric pills toggle, mobile bottom sheet works |
| 3f: Calendar markers | Sponsorship dots appear, detail cards render on selection |
| 3g: Donny intelligence | Stub card renders with placeholder text |
| 3h: ROI reports | Summary card renders with placeholder metrics |
| Desktop/Mobile parity | All components render correctly at both 375px and 1280px+ |
| Empty states | All brand components handle zero-data gracefully |
