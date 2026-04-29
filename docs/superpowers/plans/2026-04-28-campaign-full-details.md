# Campaign Full Details Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all campaign details visible after save/launch for every role (business, creator, brand), make all fields editable, and fix draft save to persist everything.

**Architecture:** Build 4 shared read-only section components mirroring the creation form's accordions. Each role-specific page composes these sections. The edit page reuses creation form input components. Data layer fixes ensure `saveDraft`, `launchCampaign`, and hydration all handle every field consistently via the `ai_analysis` JSON blob.

**Tech Stack:** React + TypeScript, Tailwind CSS, React Query, Supabase, existing campaign-creator components (EditorSection, PlatformChips, DeliverablesList, BudgetSlider, TimelinePicker, TierBadge).

**Spec:** `docs/superpowers/specs/2026-04-28-campaign-full-details-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/campaign-details/sections/CampaignOverviewSection.tsx` | Read-only display: title, tagline, description, campaign_type |
| `src/components/campaign-details/sections/ContentRequirementsSection.tsx` | Read-only display: platforms, structured deliverables, style_direction, key_messages, hashtags |
| `src/components/campaign-details/sections/CompensationSection.tsx` | Read-only display: budget, per_creator_cap, usage/exclusivity rights, cost breakdown (business) or earnings (creator) |
| `src/components/campaign-details/sections/LogisticsSection.tsx` | Read-only display: deadline, delivery tier, geographic scope, target creator count, target personas |

### Modified Files
| File | Change |
|------|--------|
| `src/hooks/useCampaignQueries.ts` | Add 4 fields to Campaign interface; expand hydrateCampaignFromAnalysis |
| `src/hooks/useCampaignCreator.ts` | Fix saveDraft to persist all fields; verify launchCampaign ai_analysis completeness |
| `src/components/campaigns/CampaignDetailsOverview.tsx` | Replace two-column grid + CampaignAnalysisDisplay with 4 shared sections |
| `src/components/campaign-details/CreatorCampaignDetails.tsx` | Replace CampaignBriefSection/Timeline/BudgetDetail/scope with 4 shared sections |
| `src/components/campaigns/CampaignDetailModal.tsx` | Add rich summary fields + "View Full Details" button |
| `src/hooks/useCampaignEditForm.ts` | Expand CampaignEditFormData with all fields; update save logic to write ai_analysis |
| `src/pages/CampaignEditPage.tsx` | Replace 5 form components with 4 EditorSection groups using creation form components |

---

### Task 1: Expand Campaign Interface + Hydration

**Files:**
- Modify: `src/hooks/useCampaignQueries.ts`

- [ ] **Step 1: Add missing fields to Campaign interface**

In `src/hooks/useCampaignQueries.ts`, add 4 new optional fields to the `Campaign` interface after the existing `ai_analysis` field (around line 61):

```typescript
export interface Campaign {
  // ... existing fields through line 60 ...
  ai_analysis?: CampaignAnalysis | null;
  ai_preview_status?: string | null;
  // Hydrated from ai_analysis (not DB columns)
  key_messages?: string[];
  style_direction?: string;
  tier_reasoning?: string;
  created_at: string;
  updated_at: string;
}
```

Note: `delivery_fee` already exists on the interface at line 45, so we only add 3 new fields plus `key_messages`.

- [ ] **Step 2: Expand hydrateCampaignFromAnalysis**

In the same file, update the `hydrateCampaignFromAnalysis` function to extract the 3 new fields from `ai_analysis`:

```typescript
export function hydrateCampaignFromAnalysis<T extends Campaign>(campaign: T): T {
  const ai = campaign.ai_analysis as Record<string, unknown> | null;
  if (!ai) return campaign;
  return {
    ...campaign,
    tagline: campaign.tagline || (ai.tagline as string) || undefined,
    campaign_type: campaign.campaign_type || (ai.campaign_type as string) || undefined,
    per_creator_cap: campaign.per_creator_cap ?? (ai.per_creator_cap as number) ?? undefined,
    usage_rights_days: campaign.usage_rights_days ?? (ai.usage_rights_days as number) ?? undefined,
    exclusivity_days: campaign.exclusivity_days ?? (ai.exclusivity_days as number) ?? undefined,
    geographic_scope: campaign.geographic_scope || (ai.geographic_scope as Campaign['geographic_scope']) || undefined,
    creator_count: campaign.creator_count ?? (ai.creator_count as number) ?? undefined,
    target_creator_personas: campaign.target_creator_personas?.length
      ? campaign.target_creator_personas
      : (ai.target_creator_personas as string[]) || (ai.target_creator_persona as string[]) || undefined,
    hashtag_requirements: campaign.hashtag_requirements
      || (Array.isArray(ai.hashtags) ? (ai.hashtags as string[]).join(' ') : (ai.hashtag_requirements as string))
      || undefined,
    key_messages: campaign.key_messages?.length
      ? campaign.key_messages
      : (ai.key_messages as string[]) || undefined,
    style_direction: campaign.style_direction || (ai.style_direction as string) || undefined,
    tier_reasoning: campaign.tier_reasoning || (ai.tier_reasoning as string) || undefined,
    delivery_fee: campaign.delivery_fee ?? (ai.delivery_fee as number) ?? undefined,
  };
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors related to Campaign type.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignQueries.ts
git commit -m "feat: expand Campaign interface and hydration with key_messages, style_direction, tier_reasoning"
```

---

### Task 2: Fix saveDraft + Verify launchCampaign

**Files:**
- Modify: `src/hooks/useCampaignCreator.ts`

- [ ] **Step 1: Fix saveDraft to persist all fields**

Replace the authenticated branch of `saveDraft` (lines 355-366) so it matches `launchCampaign`'s field coverage:

```typescript
const saveDraft = useCallback(async () => {
  if (!editedCampaign) return;
  if (user) {
    const { error } = await supabase.from('campaigns').insert({
      user_id: user.id,
      title: editedCampaign.title,
      description: editedCampaign.description,
      goals: editedCampaign.key_messages.join(', '),
      platforms: editedCampaign.platforms,
      budget_min: editedCampaign.budget_min,
      budget_max: editedCampaign.budget_max,
      deadline: editedCampaign.deadline,
      delivery_type: editedCampaign.delivery_type,
      delivery_fee: resolveTierFee(editedCampaign.delivery_type),
      style: editedCampaign.style_direction,
      status: 'draft' as const,
      ai_analysis: {
        ...businessContext,
        brand_fields: userRole === 'brand' ? brandFields : undefined,
        tagline: editedCampaign.tagline || null,
        campaign_type: editedCampaign.campaign_type,
        per_creator_cap: editedCampaign.per_creator_cap || null,
        usage_rights_days: editedCampaign.usage_rights_days,
        exclusivity_days: editedCampaign.exclusivity_days,
        geographic_scope: editedCampaign.geographic_scope,
        creator_count: editedCampaign.target_creator_count,
        target_creator_persona: editedCampaign.target_creator_persona,
        target_creator_personas: editedCampaign.target_creator_persona,
        hashtags: editedCampaign.hashtags,
        hashtag_requirements: editedCampaign.hashtags.join(' '),
        key_messages: editedCampaign.key_messages,
        style_direction: editedCampaign.style_direction,
        tier_reasoning: editedCampaign.tier_reasoning,
        delivery_fee: resolveTierFee(editedCampaign.delivery_type),
      },
    });
    if (error) throw error;
    toast.success('Draft saved');
  } else {
    const id = draftId || generateDraftId();
    if (!draftId) setDraftId(id);
    saveDraftToStorage({
      id,
      businessContext,
      selectedIdeaId,
      campaignIdeas,
      editedCampaign,
      brandFields,
      updatedAt: new Date().toISOString(),
    });
    toast.success('Draft saved locally');
  }
}, [editedCampaign, user, businessContext, draftId, selectedIdeaId, campaignIdeas, brandFields, userRole]);
```

- [ ] **Step 2: Verify launchCampaign includes key_messages and style_direction in ai_analysis**

Check the `launchMutation` `ai_analysis` object (around line 305). Confirm it already contains `tier_reasoning` (line 319) and `hashtags` (line 317). It does NOT currently include `key_messages` or `style_direction` in the blob. Add them:

In the `ai_analysis` object inside `launchMutation.mutationFn`, after the `tier_reasoning` line, add:

```typescript
ai_analysis: {
  ...businessContext,
  brand_fields: userRole === 'brand' ? brandFields : undefined,
  tagline: editedCampaign.tagline || null,
  campaign_type: editedCampaign.campaign_type,
  per_creator_cap: editedCampaign.per_creator_cap || null,
  usage_rights_days: editedCampaign.usage_rights_days,
  exclusivity_days: editedCampaign.exclusivity_days,
  geographic_scope: editedCampaign.geographic_scope,
  creator_count: editedCampaign.target_creator_count,
  target_creator_persona: editedCampaign.target_creator_persona,
  target_creator_personas: editedCampaign.target_creator_persona,
  hashtags: editedCampaign.hashtags,
  hashtag_requirements: editedCampaign.hashtags.join(' '),
  tier_reasoning: editedCampaign.tier_reasoning,
  key_messages: editedCampaign.key_messages,
  style_direction: editedCampaign.style_direction,
  delivery_fee: resolveTierFee(editedCampaign.delivery_type),
},
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignCreator.ts
git commit -m "fix: saveDraft persists all campaign fields; launchCampaign includes key_messages/style_direction in ai_analysis"
```

---

### Task 3: Create CampaignOverviewSection

**Files:**
- Create: `src/components/campaign-details/sections/CampaignOverviewSection.tsx`

- [ ] **Step 1: Create the sections directory**

```bash
mkdir -p src/components/campaign-details/sections
```

- [ ] **Step 2: Create CampaignOverviewSection.tsx**

```tsx
import { Badge } from '@/components/ui/badge';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignOverviewSectionProps {
  campaign: Campaign;
}

export function CampaignOverviewSection({ campaign }: CampaignOverviewSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Campaign Overview</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">Title</span>
          <p className="text-base font-semibold text-gray-900">{campaign.title}</p>
        </div>

        <div>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">Tagline</span>
          {campaign.tagline ? (
            <p className="text-sm text-gray-600 italic">{campaign.tagline}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">No tagline</p>
          )}
        </div>

        {campaign.description && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Description</span>
            <p className="text-sm text-gray-600 leading-relaxed">{campaign.description}</p>
          </div>
        )}

        {campaign.campaign_type && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Campaign Type</span>
            <div className="mt-1">
              <Badge variant="outline" className="capitalize">
                {campaign.campaign_type.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/sections/CampaignOverviewSection.tsx
git commit -m "feat: add CampaignOverviewSection shared component"
```

---

### Task 4: Create ContentRequirementsSection

**Files:**
- Create: `src/components/campaign-details/sections/ContentRequirementsSection.tsx`

- [ ] **Step 1: Create ContentRequirementsSection.tsx**

```tsx
import { Badge } from '@/components/ui/badge';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface ContentRequirementsSectionProps {
  campaign: Campaign;
  campaignId: string;
}

const contentTypeLabels: Record<string, string> = {
  photo: 'Photo',
  video_reel: 'Reel',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YT Short',
};

const platformLabels: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  facebook: 'FB',
  youtube: 'YT',
  google_business: 'Google',
  multi_platform: 'Multi',
};

export function ContentRequirementsSection({ campaign, campaignId }: ContentRequirementsSectionProps) {
  const { data: structuredDeliverables } = useCampaignDeliverables(campaignId);
  const hasStructured = structuredDeliverables && structuredDeliverables.length > 0;
  const hashtags = campaign.hashtag_requirements?.split(' ').filter(Boolean) ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Content Requirements</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {/* Platforms */}
        {campaign.platforms && campaign.platforms.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Platforms</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {campaign.platforms.map((platform) => (
                <Badge key={platform} variant="outline" className="capitalize">
                  {platform.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Structured Deliverables or fallback */}
        <div>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">Deliverables</span>
          <div className="mt-2 space-y-2">
            {hasStructured
              ? structuredDeliverables.map((d, i) => (
                  <div key={d.id} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-dc-teal text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {contentTypeLabels[d.content_type] ?? d.content_type} · {platformLabels[d.platform] ?? d.platform} · {d.aspect_ratio}
                      </p>
                      {d.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                      )}
                      {d.max_duration_seconds && (
                        <p className="text-xs text-gray-400">Max {d.max_duration_seconds}s</p>
                      )}
                    </div>
                  </div>
                ))
              : campaign.deliverables?.map((d, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-dc-teal text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-800">{d}</p>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Style Direction */}
        {campaign.style_direction && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Style Direction</span>
            <p className="text-sm text-gray-600 leading-relaxed mt-1">{campaign.style_direction}</p>
          </div>
        )}

        {/* Key Messages */}
        {campaign.key_messages && campaign.key_messages.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Key Messages</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {campaign.key_messages.map((msg, i) => (
                <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                  {msg}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Hashtags</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {hashtags.map((tag, i) => (
                <span key={i} className="text-teal-600 text-sm font-medium">
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/sections/ContentRequirementsSection.tsx
git commit -m "feat: add ContentRequirementsSection shared component"
```

---

### Task 5: Create CompensationSection

**Files:**
- Create: `src/components/campaign-details/sections/CompensationSection.tsx`

- [ ] **Step 1: Create CompensationSection.tsx**

```tsx
import { DollarSign, Shield, Lock, UserCheck } from 'lucide-react';
import CostBreakdown from '@/components/campaigns/CostBreakdown';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CompensationSectionProps {
  campaign: Campaign;
  campaignId: string;
  role: 'business' | 'creator';
}

function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function CompensationSection({ campaign, campaignId, role }: CompensationSectionProps) {
  const { data: deliverables } = useCampaignDeliverables(campaignId);
  const deliverableCount = deliverables?.length ?? campaign.deliverables?.length ?? 1;
  const perCreatorCap = campaign.per_creator_cap ?? campaign.budget_max ?? 0;
  const tier = mapDeliveryType(campaign.delivery_type);
  const premiumFee = tier ? TIER_LIMITS[tier].fee : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Compensation & Terms</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Budget Range */}
        <div className="flex items-center gap-3">
          <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Budget Range</span>
            <p className="text-sm font-medium text-gray-900">
              {formatCurrency(campaign.budget_min)} — {formatCurrency(campaign.budget_max)}
            </p>
          </div>
        </div>

        {/* Per-Creator Cap */}
        {campaign.per_creator_cap != null && (
          <div className="flex items-center gap-3">
            <UserCheck className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Per-Creator Cap</span>
              <p className="text-sm font-medium text-gray-900">{formatCurrency(campaign.per_creator_cap)}</p>
            </div>
          </div>
        )}

        {/* Usage Rights */}
        {campaign.usage_rights_days != null && (
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Usage Rights</span>
              <p className="text-sm font-medium text-gray-900">{campaign.usage_rights_days} days</p>
            </div>
          </div>
        )}

        {/* Exclusivity */}
        {campaign.exclusivity_days != null && (
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Exclusivity</span>
              <p className="text-sm font-medium text-gray-900">{campaign.exclusivity_days} days</p>
            </div>
          </div>
        )}

        {/* Role-specific: Cost Breakdown vs Earnings */}
        {role === 'business' ? (
          <CostBreakdown
            deliverableCount={deliverableCount}
            budgetTotal={perCreatorCap + premiumFee}
            baseCostPerDeliverable={deliverableCount > 0 ? perCreatorCap / deliverableCount : perCreatorCap}
            premiumAmount={premiumFee}
            deliveryType={tier ?? ''}
          />
        ) : (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-teal-700">
              Your potential earnings: up to {formatCurrency(campaign.per_creator_cap ?? campaign.budget_max)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Payment via Stripe upon approval</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/sections/CompensationSection.tsx
git commit -m "feat: add CompensationSection shared component with role-based cost/earnings display"
```

---

### Task 6: Create LogisticsSection

**Files:**
- Create: `src/components/campaign-details/sections/LogisticsSection.tsx`

- [ ] **Step 1: Create LogisticsSection.tsx**

```tsx
import { Calendar, Globe, Users } from 'lucide-react';
import { Sparkles, Rocket, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface LogisticsSectionProps {
  campaign: Campaign;
}

export function LogisticsSection({ campaign }: LogisticsSectionProps) {
  const tier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = tier ? TIER_LIMITS[tier] : null;

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const TierIcon = campaign.delivery_type === 'dragonrush' ? Sparkles
    : campaign.delivery_type === 'expedited' ? Rocket
    : Package;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Logistics & Targeting</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {/* Deadline */}
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Deadline</span>
            <p className="text-sm font-medium text-gray-900">{formatDate(campaign.deadline)}</p>
          </div>
        </div>

        {/* Delivery Tier */}
        {tierConfig && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Delivery Tier</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                campaign.delivery_type === 'dragonrush' ? 'bg-teal-100 text-teal-800' :
                campaign.delivery_type === 'expedited' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-700'
              }`}>
                <TierIcon className="w-3.5 h-3.5" />
                {tierConfig.label} · {tierConfig.timeframe}
              </span>
            </div>
            {campaign.tier_reasoning && (
              <p className="text-xs text-gray-500 mt-1 italic">{campaign.tier_reasoning}</p>
            )}
          </div>
        )}

        {/* Geographic Scope */}
        {campaign.geographic_scope && (
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Geographic Scope</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {['city', 'region', 'national'].map((scope) => (
                  <Badge
                    key={scope}
                    variant={campaign.geographic_scope === scope ? 'default' : 'outline'}
                    className={`capitalize ${campaign.geographic_scope === scope ? 'bg-dc-teal text-white' : ''}`}
                  >
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Target Creator Count */}
        {campaign.creator_count != null && (
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Target Creator Count</span>
              <p className="text-sm font-medium text-gray-900">{campaign.creator_count}</p>
            </div>
          </div>
        )}

        {/* Target Creator Personas */}
        {campaign.target_creator_personas && campaign.target_creator_personas.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Target Creators</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {campaign.target_creator_personas.map((persona, i) => (
                <Badge key={i} variant="outline" className="capitalize">
                  {persona}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/sections/LogisticsSection.tsx
git commit -m "feat: add LogisticsSection shared component"
```

---

### Task 7: Update Business/Restaurant Detail View

**Files:**
- Modify: `src/components/campaigns/CampaignDetailsOverview.tsx`

- [ ] **Step 1: Replace CampaignDetailsOverview with shared sections**

Rewrite the entire file:

```tsx
import { Badge } from '@/components/ui/badge';
import type { Campaign } from '@/hooks/useCampaignQueries';
import { CampaignOverviewSection } from '@/components/campaign-details/sections/CampaignOverviewSection';
import { ContentRequirementsSection } from '@/components/campaign-details/sections/ContentRequirementsSection';
import { CompensationSection } from '@/components/campaign-details/sections/CompensationSection';
import { LogisticsSection } from '@/components/campaign-details/sections/LogisticsSection';

interface CampaignDetailsOverviewProps {
  campaign: Campaign;
}

const CampaignDetailsOverview: React.FC<CampaignDetailsOverviewProps> = ({ campaign }) => {
  return (
    <div className="space-y-6">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Badge variant={campaign.status === 'published' ? 'default' : 'secondary'}>
          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
        </Badge>
      </div>

      <CampaignOverviewSection campaign={campaign} />
      <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
      <CompensationSection campaign={campaign} campaignId={campaign.id} role="business" />
      <LogisticsSection campaign={campaign} />
    </div>
  );
};

export default CampaignDetailsOverview;
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Verify in browser**

Navigate to a business campaign detail page (e.g. `/dashboard/business/campaigns/<id>`). Confirm all 4 sections render with full data. Check: title, tagline, description, campaign_type, platforms, deliverables (structured), style_direction, key_messages, hashtags, budget range, per_creator_cap, usage rights, exclusivity, cost breakdown, deadline, delivery tier + reasoning, geographic scope, target creator count, target personas.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignDetailsOverview.tsx
git commit -m "feat: business detail view uses shared section components — full campaign details visible"
```

---

### Task 8: Update Creator Detail View

**Files:**
- Modify: `src/components/campaign-details/CreatorCampaignDetails.tsx`

- [ ] **Step 1: Replace scattered sub-components with shared sections**

Rewrite the file, keeping CampaignHero, CampaignMetricsBar, references, footage, business strip, and invitation banner:

```tsx
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CampaignHero } from './CampaignHero';
import { CampaignMetricsBar } from './CampaignMetricsBar';
import { CampaignReferencesGallery } from './CampaignReferencesGallery';
import { CampaignFootageSection } from './CampaignFootageSection';
import { BusinessProfileStrip } from './BusinessProfileStrip';
import { InvitationBanner } from './InvitationBanner';
import { CampaignOverviewSection } from './sections/CampaignOverviewSection';
import { ContentRequirementsSection } from './sections/ContentRequirementsSection';
import { CompensationSection } from './sections/CompensationSection';
import { LogisticsSection } from './sections/LogisticsSection';

interface CreatorCampaignDetailsProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  isInvited?: boolean;
  hasApplied?: boolean;
}

export function CreatorCampaignDetails({
  campaign,
  enrichedDetail,
  isInvited,
  hasApplied,
}: CreatorCampaignDetailsProps) {
  const businessName =
    (campaign.ai_analysis as Record<string, unknown>)?.business_name as string | undefined;

  const rawFootage = enrichedDetail?.media.filter((m) => m.media_type === 'raw_footage') ?? [];

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <CampaignHero
        campaign={campaign}
        media={enrichedDetail?.media}
        businessLogoUrl={enrichedDetail?.businessProfile?.logo_url}
        distance={undefined}
        applicationCount={enrichedDetail?.applicationCount}
      />

      {isInvited && <InvitationBanner businessName={businessName} />}

      <CampaignMetricsBar
        campaign={campaign}
        deliverableCount={enrichedDetail?.deliverables.length ?? campaign.deliverables?.length ?? 0}
        matchScore={enrichedDetail?.matchScore ?? null}
      />

      <div className="px-5 pt-4 pb-6 space-y-5">
        <CampaignOverviewSection campaign={campaign} />

        {enrichedDetail && (
          <CampaignReferencesGallery referenceMedia={enrichedDetail.referenceMedia} />
        )}

        {enrichedDetail && (
          <CampaignFootageSection
            footageItems={rawFootage}
            hasApplied={hasApplied ?? false}
          />
        )}

        <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
        <CompensationSection campaign={campaign} campaignId={campaign.id} role="creator" />
        <LogisticsSection campaign={campaign} />

        {enrichedDetail?.businessProfile && (
          <div className="mt-3">
            <BusinessProfileStrip
              profile={enrichedDetail.businessProfile}
              completedCampaignCount={enrichedDetail.completedCampaignCount}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Verify in browser**

Navigate to a creator campaign detail page. Confirm all 4 shared sections render between the metrics bar and business profile strip. Verify the CampaignHero, CampaignMetricsBar, references gallery, and footage section still work.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/CreatorCampaignDetails.tsx
git commit -m "feat: creator detail view uses shared section components — full campaign details visible"
```

---

### Task 9: Update Creator Browse Modal

**Files:**
- Modify: `src/components/campaigns/CampaignDetailModal.tsx`

- [ ] **Step 1: Add rich summary fields and "View Full Details" button**

Add imports at the top of the file:

```tsx
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { hydrateCampaignFromAnalysis } from '@/hooks/useCampaignQueries';
```

Note: `Link` is already imported. We also need `useNavigate` for the View Full Details button if we want programmatic navigation, or we can use a `Link`. Since `Link` is already imported, we'll use that.

After the "About This Campaign" section (around line 156, after the closing `</div>` of that section), add a new "Campaign Details Summary" section before Visual References:

```tsx
{/* Campaign Details Summary */}
<div className="px-4 py-4 border-b border-gray-100 space-y-3">
  <h3 className="text-sm font-bold text-gray-900 mb-2">Campaign Details</h3>

  {/* Campaign type + tagline */}
  <div className="flex flex-wrap gap-2 items-center">
    {campaign.campaign_type && (
      <Badge variant="outline" className="capitalize text-xs">
        {campaign.campaign_type.replace(/_/g, ' ')}
      </Badge>
    )}
    {campaign.tagline && (
      <span className="text-xs text-gray-500 italic">{campaign.tagline}</span>
    )}
  </div>

  {/* Platforms */}
  {campaign.platforms && campaign.platforms.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {campaign.platforms.map((p) => (
        <span key={p} className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full capitalize">
          {p.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  )}

  {/* Budget + per-creator */}
  {campaign.per_creator_cap != null && (
    <div className="text-sm text-gray-600">
      Per creator: up to <strong className="text-gray-800">${campaign.per_creator_cap}</strong>
    </div>
  )}

  {/* Delivery tier + deadline */}
  <div className="flex flex-wrap gap-2 items-center">
    {tierConfig && deliveryTier && (
      <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe />
    )}
    {campaign.deadline && (
      <span className="text-xs text-gray-500">
        Due {new Date(campaign.deadline).toLocaleDateString()}
      </span>
    )}
  </div>

  {/* Geographic scope + creator count */}
  <div className="flex flex-wrap gap-3 text-xs text-gray-600">
    {campaign.geographic_scope && (
      <span className="capitalize">{campaign.geographic_scope} scope</span>
    )}
    {campaign.creator_count != null && (
      <span>{campaign.creator_count} creator{campaign.creator_count !== 1 ? 's' : ''} wanted</span>
    )}
  </div>

  {/* Target personas */}
  {campaign.target_creator_personas && campaign.target_creator_personas.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {campaign.target_creator_personas.map((p, i) => (
        <span key={i} className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full capitalize">
          {p}
        </span>
      ))}
    </div>
  )}

  {/* Hashtags */}
  {campaign.hashtag_requirements && (
    <div className="flex flex-wrap gap-2">
      {campaign.hashtag_requirements.split(' ').filter(Boolean).map((tag, i) => (
        <span key={i} className="text-teal-600 text-xs font-medium">
          {tag.startsWith('#') ? tag : `#${tag}`}
        </span>
      ))}
    </div>
  )}

  {/* Key messages */}
  {campaign.key_messages && campaign.key_messages.length > 0 && (
    <div>
      <span className="text-[11px] text-gray-500 uppercase tracking-wider">Key Messages</span>
      <ul className="mt-1 space-y-0.5">
        {campaign.key_messages.map((msg, i) => (
          <li key={i} className="text-xs text-gray-600">• {msg}</li>
        ))}
      </ul>
    </div>
  )}

  {/* Style direction */}
  {campaign.style_direction && (
    <p className="text-xs text-gray-500 italic">{campaign.style_direction}</p>
  )}

  {/* Usage rights + exclusivity */}
  <div className="flex flex-wrap gap-3 text-xs text-gray-600">
    {campaign.usage_rights_days != null && (
      <span>Usage: {campaign.usage_rights_days} days</span>
    )}
    {campaign.exclusivity_days != null && (
      <span>Exclusivity: {campaign.exclusivity_days} days</span>
    )}
  </div>
</div>

{/* View Full Details link */}
<div className="px-4 py-3 border-b border-gray-100">
  <Link
    to={`/campaigns/${campaign.id}`}
    className="w-full flex items-center justify-center rounded-full border-2 border-dc-teal text-dc-teal font-bold py-2.5 text-sm hover:bg-teal-50 transition-colors"
    onClick={(e) => e.stopPropagation()}
  >
    View Full Details
  </Link>
</div>
```

This block goes between the "About This Campaign" section and the "Visual References" section. The `campaign` object (type `PublicCampaign` which extends `Campaign`) already has the hydrated fields since `usePublicCampaigns` calls `hydrateCampaignFromAnalysis`.

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Verify in browser**

Open the creator campaign browse view and tap a campaign card to open the modal. Confirm:
- Campaign type badge + tagline visible below title
- Platforms as small pills
- Per-creator earnings shown
- Delivery tier + deadline visible
- Geographic scope + creator count visible
- Target personas as pills
- Hashtags shown
- Key messages listed
- Style direction shown as muted text
- "View Full Details" button navigates to the full campaign page

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignDetailModal.tsx
git commit -m "feat: campaign modal shows rich summary with all details + View Full Details link"
```

---

### Task 10: Expand Edit Form Data + Save Logic

**Files:**
- Modify: `src/hooks/useCampaignEditForm.ts`

- [ ] **Step 1: Expand CampaignEditFormData and initialization**

Rewrite the entire file to handle all fields and save them correctly (including ai_analysis blob):

```typescript
import { useState, useEffect } from 'react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import { useQueryClient } from '@tanstack/react-query';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { Deliverable } from '@/types/campaignMedia';

export interface CampaignEditFormData {
  title: string;
  description: string;
  goals: string;
  deliverables: string[];
  platforms: string[];
  budget_min: string;
  budget_max: string;
  deadline: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  style: string;
  tone: string;
  open_for_sponsorship: boolean;
  tagline: string;
  campaign_type: string;
  per_creator_cap: string;
  usage_rights_days: string;
  exclusivity_days: string;
  geographic_scope: string;
  target_creator_count: string;
  target_creator_personas: string[];
  delivery_type: string;
  style_direction: string;
  key_messages: string[];
  hashtags: string[];
  tier_reasoning: string;
}

export const useCampaignEditForm = (campaign: Campaign | undefined) => {
  const { updateCampaign } = useCampaigns();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [structuredDeliverables, setStructuredDeliverables] = useState<Deliverable[]>([]);

  const [formData, setFormData] = useState<CampaignEditFormData>({
    title: '',
    description: '',
    goals: '',
    deliverables: [],
    platforms: [],
    budget_min: '',
    budget_max: '',
    deadline: '',
    status: 'draft',
    style: '',
    tone: '',
    open_for_sponsorship: false,
    tagline: '',
    campaign_type: '',
    per_creator_cap: '',
    usage_rights_days: '',
    exclusivity_days: '',
    geographic_scope: '',
    target_creator_count: '',
    target_creator_personas: [],
    delivery_type: 'standard',
    style_direction: '',
    key_messages: [],
    hashtags: [],
    tier_reasoning: '',
  });

  useEffect(() => {
    if (campaign) {
      const hashtags = campaign.hashtag_requirements?.split(' ').filter(Boolean) ?? [];
      setFormData({
        title: campaign.title || '',
        description: campaign.description || '',
        goals: campaign.goals || '',
        deliverables: campaign.deliverables || [],
        platforms: campaign.platforms || [],
        budget_min: campaign.budget_min?.toString() || '',
        budget_max: campaign.budget_max?.toString() || '',
        deadline: campaign.deadline ? new Date(campaign.deadline).toISOString().split('T')[0] : '',
        status: campaign.status,
        style: campaign.style || '',
        tone: campaign.tone || '',
        open_for_sponsorship: campaign.open_for_sponsorship || false,
        tagline: campaign.tagline || '',
        campaign_type: campaign.campaign_type || '',
        per_creator_cap: campaign.per_creator_cap?.toString() || '',
        usage_rights_days: campaign.usage_rights_days?.toString() || '',
        exclusivity_days: campaign.exclusivity_days?.toString() || '',
        geographic_scope: campaign.geographic_scope || '',
        target_creator_count: campaign.creator_count?.toString() || '',
        target_creator_personas: campaign.target_creator_personas || [],
        delivery_type: campaign.delivery_type || 'standard',
        style_direction: campaign.style_direction || '',
        key_messages: campaign.key_messages || [],
        hashtags,
        tier_reasoning: campaign.tier_reasoning || '',
      });
    }
  }, [campaign]);

  const handleInputChange = (field: keyof CampaignEditFormData, value: string | boolean | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: 'platforms' | 'deliverables' | 'target_creator_personas', value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked
        ? [...(prev[field] as string[]), value]
        : (prev[field] as string[]).filter(item => item !== value),
    }));
  };

  const handleChipListChange = (field: 'key_messages' | 'hashtags', values: string[]) => {
    setFormData(prev => ({ ...prev, [field]: values }));
  };

  const handleStructuredDeliverablesChange = (deliverables: Deliverable[]) => {
    setStructuredDeliverables(deliverables);
  };

  const handleSave = async (saveStatus: 'draft' | 'published') => {
    if (!campaign) return;

    setIsSaving(true);
    try {
      const existingAnalysis = campaign.ai_analysis as Record<string, unknown> | null;

      const updates: Record<string, unknown> = {
        title: formData.title,
        description: formData.description,
        goals: formData.key_messages.length > 0 ? formData.key_messages.join(', ') : formData.goals,
        deliverables: formData.deliverables,
        platforms: formData.platforms,
        budget_min: formData.budget_min ? parseFloat(formData.budget_min) : undefined,
        budget_max: formData.budget_max ? parseFloat(formData.budget_max) : undefined,
        deadline: formData.deadline || undefined,
        status: saveStatus,
        style: formData.style_direction || formData.style,
        tone: formData.tone,
        open_for_sponsorship: formData.open_for_sponsorship,
        delivery_type: formData.delivery_type || undefined,
        ai_analysis: {
          ...existingAnalysis,
          tagline: formData.tagline || null,
          campaign_type: formData.campaign_type || null,
          per_creator_cap: formData.per_creator_cap ? parseFloat(formData.per_creator_cap) : null,
          usage_rights_days: formData.usage_rights_days ? parseInt(formData.usage_rights_days, 10) : null,
          exclusivity_days: formData.exclusivity_days ? parseInt(formData.exclusivity_days, 10) : null,
          geographic_scope: formData.geographic_scope || null,
          creator_count: formData.target_creator_count ? parseInt(formData.target_creator_count, 10) : null,
          target_creator_personas: formData.target_creator_personas,
          hashtags: formData.hashtags,
          hashtag_requirements: formData.hashtags.join(' '),
          key_messages: formData.key_messages,
          style_direction: formData.style_direction || null,
          tier_reasoning: formData.tier_reasoning || null,
        },
      };

      await updateCampaign.mutateAsync({ id: campaign.id, updates: updates as any });

      // Upsert structured deliverables if changed
      if (structuredDeliverables.length > 0) {
        // @ts-ignore — campaign_deliverables not in generated types yet
        await supabase
          .from('campaign_deliverables')
          .delete()
          .eq('campaign_id', campaign.id);

        // @ts-ignore
        await supabase
          .from('campaign_deliverables')
          .insert(
            structuredDeliverables.map((d, i) => ({
              campaign_id: campaign.id,
              content_type: d.content_type,
              platform: d.platform,
              aspect_ratio: d.aspect_ratio,
              max_duration_seconds: d.max_duration_seconds ?? null,
              description: d.description ?? null,
              sort_order: i,
            }))
          );

        queryClient.invalidateQueries({ queryKey: ['campaign_deliverables', campaign.id] });
      }

      if (saveStatus === 'published') {
        toast({
          title: 'Campaign published!',
          description: 'Your campaign is now live and visible to creators.',
        });
      } else {
        toast({
          title: 'Campaign saved!',
          description: 'Your changes have been saved as a draft.',
        });
      }

      return true;
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        title: 'Error saving campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    formData,
    isSaving,
    structuredDeliverables,
    handleInputChange,
    handleArrayChange,
    handleChipListChange,
    handleStructuredDeliverablesChange,
    handleSave,
  };
};
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Note: The edit page (`CampaignEditPage.tsx`) may show errors now since the form hook returns new properties. This is expected and will be fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignEditForm.ts
git commit -m "feat: expand edit form to handle all campaign fields with ai_analysis save logic"
```

---

### Task 11: Update Edit Page Layout

**Files:**
- Modify: `src/pages/CampaignEditPage.tsx`

- [ ] **Step 1: Rewrite CampaignEditPage with 4 EditorSection groups**

Replace the form sections in `CampaignEditPage.tsx`. Rewrite the full file to use `EditorSection` from the creation wizard + reusable components:

```tsx
import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useCampaign } from '@/hooks/useCampaigns';
import { useCampaignEditForm } from '@/hooks/useCampaignEditForm';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import { EditorSection } from '@/components/campaign-creator/EditorSection';
import { PlatformChips } from '@/components/campaign-creator/PlatformChips';
import { DeliverablesList } from '@/components/campaign-creator/DeliverablesList';
import { BudgetSlider } from '@/components/campaign-creator/BudgetSlider';
import { TimelinePicker } from '@/components/campaign-creator/TimelinePicker';
import { TierBadge } from '@/components/campaign-creator/TierBadge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import CostBreakdown from '@/components/campaigns/CostBreakdown';
import CampaignSponsorshipToggle from '@/components/campaigns/CampaignSponsorshipToggle';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { sanitizeNumericInput } from '@/lib/inputUtils';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import type { Platform, Deliverable } from '@/types/campaignMedia';

const PERSONA_OPTIONS = [
  'Foodie', 'Lifestyle', 'Fitness', 'Beauty', 'Tech',
  'Travel', 'Fashion', 'Parenting', 'Gaming', 'Comedy',
];

const CampaignEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);
  const { data: existingDeliverables } = useCampaignDeliverables(id);
  const {
    formData,
    isSaving,
    structuredDeliverables,
    handleInputChange,
    handleArrayChange,
    handleChipListChange,
    handleStructuredDeliverablesChange,
    handleSave,
  } = useCampaignEditForm(campaign);

  // Initialize structured deliverables from DB
  useEffect(() => {
    if (existingDeliverables && existingDeliverables.length > 0) {
      handleStructuredDeliverablesChange(
        existingDeliverables.map((d) => ({
          id: d.id,
          content_type: d.content_type,
          platform: d.platform,
          aspect_ratio: d.aspect_ratio,
          max_duration_seconds: d.max_duration_seconds ?? undefined,
          description: d.description ?? undefined,
        }))
      );
    }
  }, [existingDeliverables]);

  // Ownership check
  useEffect(() => {
    if (campaign && user && campaign.user_id !== user.id) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to edit this campaign.',
        variant: 'destructive',
      });
      navigate('/dashboard/business/campaigns');
    }
  }, [campaign, user, navigate]);

  const handleSaveWithNavigation = async (saveStatus: 'draft' | 'published') => {
    const success = await handleSave(saveStatus);
    if (success) {
      navigate(`/dashboard/business/campaigns/${campaign!.id}`);
    }
  };

  // Chip list add handler
  const handleAddChip = (field: 'key_messages' | 'hashtags', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = formData[field] as string[];
    if (!current.includes(trimmed)) {
      handleChipListChange(field, [...current, trimmed]);
    }
  };

  const handleRemoveChip = (field: 'key_messages' | 'hashtags', index: number) => {
    const current = formData[field] as string[];
    handleChipListChange(field, current.filter((_, i) => i !== index));
  };

  // Cost breakdown calc
  const deliverableCount = structuredDeliverables.length || formData.deliverables.length || 1;
  const perCreatorCap = formData.per_creator_cap ? parseFloat(formData.per_creator_cap) : 0;
  const tier = mapDeliveryType(formData.delivery_type as any);
  const premiumFee = tier ? TIER_LIMITS[tier].fee : 0;

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <span className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="px-4 py-6 space-y-4">
            <div className="h-8 bg-gray-200 rounded-full w-1/3 animate-pulse" />
            <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="text-center space-y-4 max-w-sm w-full">
            <h2 className="text-xl font-bold text-gray-900">Campaign Not Found</h2>
            <p className="text-gray-500 text-sm">The campaign you're trying to edit doesn't exist.</p>
            <button
              onClick={() => navigate('/dashboard/business/campaigns')}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            >
              Back to Campaigns
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (campaign && user && campaign.user_id !== user.id) {
    return null;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
            className="text-dc-pink-accent mr-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Edit Campaign
          </h1>
          <button
            onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
            className="text-dc-teal"
            aria-label="Preview"
          >
            <Eye className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form sections */}
        <div className="px-4 py-6 pb-28 space-y-4">
          {/* Section 1: Campaign Overview */}
          <EditorSection title="Campaign Overview" id="section-overview">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Title</label>
              <Input
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tagline</label>
              <Input
                value={formData.tagline}
                onChange={(e) => handleInputChange('tagline', e.target.value)}
                placeholder="Short catchy tagline"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
            {formData.campaign_type && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign Type</label>
                <div className="mt-1">
                  <Badge variant="outline" className="capitalize">
                    {formData.campaign_type.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            )}
          </EditorSection>

          {/* Section 2: Content Requirements */}
          <EditorSection title="Content Requirements" id="section-content">
            <PlatformChips
              selected={formData.platforms as Platform[]}
              onChange={(platforms) => handleInputChange('platforms', platforms as any)}
            />
            <DeliverablesList
              deliverables={structuredDeliverables}
              onChange={handleStructuredDeliverablesChange}
            />
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Style Direction</label>
              <Textarea
                value={formData.style_direction}
                onChange={(e) => handleInputChange('style_direction', e.target.value)}
                rows={2}
                placeholder="Describe the creative direction..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Key Messages</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {formData.key_messages.map((msg, i) => (
                  <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full border border-gray-200 flex items-center gap-1">
                    {msg}
                    <button type="button" onClick={() => handleRemoveChip('key_messages', i)} className="text-gray-400 hover:text-red-500 ml-0.5">&times;</button>
                  </span>
                ))}
              </div>
              <Input
                placeholder="Type a message and press Enter"
                className="mt-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddChip('key_messages', (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Hashtags</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {formData.hashtags.map((tag, i) => (
                  <span key={i} className="text-teal-600 text-sm font-medium flex items-center gap-1">
                    {tag.startsWith('#') ? tag : `#${tag}`}
                    <button type="button" onClick={() => handleRemoveChip('hashtags', i)} className="text-gray-400 hover:text-red-500 ml-0.5">&times;</button>
                  </span>
                ))}
              </div>
              <Input
                placeholder="Type a hashtag and press Enter"
                className="mt-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddChip('hashtags', (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
          </EditorSection>

          {/* Section 3: Compensation & Terms */}
          <EditorSection title="Compensation & Terms" id="section-compensation">
            <BudgetSlider
              min={formData.budget_min ? parseFloat(formData.budget_min) : 0}
              max={formData.budget_max ? parseFloat(formData.budget_max) : 0}
              onChangeMin={(val) => handleInputChange('budget_min', val.toString())}
              onChangeMax={(val) => handleInputChange('budget_max', val.toString())}
            />
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Per-Creator Cap</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-gray-500">$</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.per_creator_cap}
                  onChange={(e) => handleInputChange('per_creator_cap', sanitizeNumericInput(e.target.value))}
                  className="w-28 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Usage Rights (days)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.usage_rights_days}
                  onChange={(e) => handleInputChange('usage_rights_days', sanitizeNumericInput(e.target.value))}
                  className="w-20 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Exclusivity (days)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.exclusivity_days}
                  onChange={(e) => handleInputChange('exclusivity_days', sanitizeNumericInput(e.target.value))}
                  className="w-20 text-sm mt-1"
                />
              </div>
            </div>
            <CostBreakdown
              deliverableCount={deliverableCount}
              budgetTotal={perCreatorCap + premiumFee}
              baseCostPerDeliverable={deliverableCount > 0 ? perCreatorCap / deliverableCount : perCreatorCap}
              premiumAmount={premiumFee}
              deliveryType={tier ?? ''}
            />
          </EditorSection>

          {/* Section 4: Logistics & Targeting */}
          <EditorSection title="Logistics & Targeting" id="section-logistics">
            <TimelinePicker
              deadline={formData.deadline}
              onChange={(val) => handleInputChange('deadline', val)}
            />
            <TierBadge
              deliveryType={(formData.delivery_type || 'standard') as 'standard' | 'expedited' | 'dragonrush'}
              tierReasoning={formData.tier_reasoning}
              onChange={(val) => handleInputChange('delivery_type', val)}
            />
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Geographic Scope</label>
              <div className="flex gap-2 mt-1">
                {(['city', 'region', 'national'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => handleInputChange('geographic_scope', scope)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors capitalize ${
                      formData.geographic_scope === scope
                        ? 'bg-teal-400 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Target Creator Count</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.target_creator_count}
                onChange={(e) => handleInputChange('target_creator_count', sanitizeNumericInput(e.target.value))}
                className="w-20 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Target Creators</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PERSONA_OPTIONS.map((persona) => (
                  <button
                    key={persona}
                    type="button"
                    onClick={() => {
                      const isSelected = formData.target_creator_personas.includes(persona.toLowerCase());
                      handleArrayChange('target_creator_personas', persona.toLowerCase(), !isSelected);
                    }}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      formData.target_creator_personas.includes(persona.toLowerCase())
                        ? 'bg-teal-400 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {persona}
                  </button>
                ))}
              </div>
            </div>
          </EditorSection>

          {/* Sponsorship toggle */}
          <CampaignSponsorshipToggle
            openForSponsorship={formData.open_for_sponsorship}
            onToggle={(value) => handleInputChange('open_for_sponsorship', value)}
          />

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => handleSaveWithNavigation('published')}
              disabled={isSaving || !formData.title.trim()}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isSaving ? 'Publishing…' : 'Publish Campaign'}
            </button>
            <button
              onClick={() => handleSaveWithNavigation('draft')}
              disabled={isSaving || !formData.title.trim()}
              className="w-full rounded-full border-2 border-gray-300 text-gray-700 font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save as Draft
            </button>
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="w-full rounded-full border border-gray-200 text-gray-500 font-semibold py-3"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignEditPage;
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Fix any type errors — common issues may include `PlatformChips` onChange typing or `handleInputChange` accepting string arrays. Adjust the type signature if needed.

- [ ] **Step 3: Verify in browser**

Navigate to the campaign edit page for a launched campaign. Confirm:
- All 4 collapsible sections render
- Existing values populate correctly (title, description, budget, deadline from DB; tagline, campaign_type, key_messages, etc. from hydrated ai_analysis)
- Campaign type shows as read-only badge
- PlatformChips, DeliverablesList, BudgetSlider, TimelinePicker, TierBadge all work
- Chip lists (key_messages, hashtags) allow add/remove via Enter key
- Geographic scope pills toggle correctly
- Target creator persona pills toggle correctly
- Save as Draft and Publish both persist all fields
- After save, navigating back to the detail view shows updated values

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignEditPage.tsx
git commit -m "feat: edit page mirrors creation form — all campaign fields editable in 4 sections"
```

---

### Task 12: Cleanup — Remove Unused Components

**Files:**
- Potentially remove files that are no longer imported

- [ ] **Step 1: Check which old components are still imported**

Run these checks (do NOT delete anything that's still imported):

```bash
# Check each file for remaining imports
grep -rn "CampaignBriefSection" src/ --include="*.tsx" --include="*.ts"
grep -rn "CampaignTimeline" src/ --include="*.tsx" --include="*.ts"
grep -rn "CampaignBudgetDetail" src/ --include="*.tsx" --include="*.ts"
grep -rn "CampaignAnalysisDisplay" src/ --include="*.tsx" --include="*.ts"
grep -rn "CampaignBasicInfoForm" src/ --include="*.tsx" --include="*.ts"
grep -rn "CampaignBudgetTimelineForm" src/ --include="*.tsx" --include="*.ts"
grep -rn "CampaignStyleToneForm" src/ --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Delete files with zero remaining imports**

For each file where the grep returns no results (meaning it's unused), delete it. Files to check:
- `src/components/campaign-details/CampaignBriefSection.tsx`
- `src/components/campaign-details/CampaignTimeline.tsx`
- `src/components/campaign-details/CampaignBudgetDetail.tsx`
- `src/components/campaigns/CampaignAnalysisDisplay.tsx`
- `src/components/campaigns/CampaignBasicInfoForm.tsx`
- `src/components/campaigns/CampaignBudgetTimelineForm.tsx`
- `src/components/campaigns/CampaignStyleToneForm.tsx`

Do NOT delete `CampaignSponsorshipToggle.tsx` — it's still used in the edit page.

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No import errors — only deleted files that had zero references.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove campaign detail components replaced by shared sections"
```

---

### Task 13: Full Integration Verification

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test business/restaurant flow**

1. Log in as a business user
2. Create a new campaign via the campaign wizard — fill out ALL fields in all 4 sections
3. Click "Launch Campaign"
4. Navigate to the campaign detail page → confirm all 4 sections show every field
5. Click "Edit" → confirm all fields are populated and editable
6. Change a few fields (tagline, add a key message, change geographic scope)
7. Save → confirm the detail page reflects the changes

- [ ] **Step 3: Test Save as Draft flow**

1. Start a new campaign, fill out all fields
2. Click "Save as Draft"
3. Navigate to the draft campaign detail page → confirm all fields are visible (not just title/description/budget)

- [ ] **Step 4: Test creator flow**

1. Log in as a creator
2. Browse campaigns → tap a campaign card to open the modal
3. Confirm the modal shows the rich summary (campaign type, tagline, platforms, per-creator earnings, delivery tier, deadline, scope, personas, hashtags, key messages, style direction, usage/exclusivity)
4. Click "View Full Details" → confirm the full detail page shows all 4 sections with complete data

- [ ] **Step 5: Test with existing campaigns**

1. Navigate to an existing (pre-fix) campaign
2. Confirm the hydration function populates fields from `ai_analysis` correctly
3. Confirm the detail view shows those fields even though they were stored in the old format
