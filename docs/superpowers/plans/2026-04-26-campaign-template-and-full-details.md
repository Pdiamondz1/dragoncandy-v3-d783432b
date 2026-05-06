# Campaign Sample Prompt & Full Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a copy-paste sample prompt carousel to Screen 1, surface all campaign fields in the Screen 2 editor via collapsible sections, and redesign the creator-facing campaign detail page to show every field.

**Architecture:** Three independent UI changes sharing a common type/validation layer. The `EditableCampaign` interface gains 5 new fields (moved from brand-only `BrandFields`). The `CampaignEditor` is reorganized into 4 `EditorSection` wrappers. The `CampaignDetailsPage` is rewritten with a hero header, quick stats bar, and 3 read-only detail sections. No DB migration needed — columns already exist.

**Tech Stack:** React 18, TypeScript strict, Tailwind CSS, Zod validation, React Query, Supabase JS v2, react-router-dom v6

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/components/campaign-creator/SamplePromptCarousel.tsx` | Rotating copy-paste campaign templates for Screen 1 |
| `src/components/campaign-creator/EditorSection.tsx` | Collapsible section wrapper for the campaign editor |
| `src/components/campaign-details/CampaignQuickStats.tsx` | 3-column stats bar (budget, deadline, creator count) |
| `src/components/campaign-details/CampaignDetailSection.tsx` | Read-only section wrapper for creator detail view |
| `src/components/campaign-details/CampaignHero.tsx` | Teal gradient hero header with back button |
| `src/components/campaign-details/CreatorCampaignDetails.tsx` | Full creator-facing campaign detail layout |

### Modified files
| File | Changes |
|------|---------|
| `src/types/campaignCreator.ts` | Add `tagline`, `per_creator_cap`, `usage_rights_days`, `exclusivity_days`, `geographic_scope`, `target_creator_count` to `EditableCampaign` |
| `src/hooks/useCampaignQueries.ts` | Add new fields to `Campaign` interface |
| `src/lib/campaignCreatorValidation.ts` | Add new optional fields to `launchValidationSchema` |
| `src/hooks/useCampaignCreator.ts` | Map new fields in `ideaToEditableCampaign` and `launchMutation` |
| `src/components/campaign-creator/DropScreen.tsx` | Add `SamplePromptCarousel` below `SmartInput` |
| `src/components/campaign-creator/CampaignEditor.tsx` | Reorganize into 4 `EditorSection`s, add new field inputs |
| `src/pages/CampaignDetailsPage.tsx` | Rewrite creator view with `CreatorCampaignDetails` |

---

## Task 1: Extend EditableCampaign and Campaign types

**Files:**
- Modify: `src/types/campaignCreator.ts:47-64`
- Modify: `src/hooks/useCampaignQueries.ts:7-34`

- [ ] **Step 1: Add new fields to EditableCampaign**

In `src/types/campaignCreator.ts`, add the 6 new fields to the `EditableCampaign` interface. These were previously brand-only in `BrandFields` but are now part of every campaign:

```typescript
export interface EditableCampaign {
  title: string;
  description: string;
  tagline: string;
  campaign_type: CampaignType;
  platforms: Platform[];
  deliverables: Deliverable[];
  budget_min: number;
  budget_max: number;
  per_creator_cap: number;
  usage_rights_days: number;
  exclusivity_days: number;
  deadline: string;
  delivery_type: 'standard' | 'expedited' | 'dragonrush';
  geographic_scope: 'city' | 'region' | 'national';
  target_creator_count: number;
  style_direction: string;
  target_creator_persona: string[];
  key_messages: string[];
  hashtags: string[];
  tier_reasoning: string;
  emoji: string;
  original_idea_id: string;
}
```

- [ ] **Step 2: Add new fields to Campaign query interface**

In `src/hooks/useCampaignQueries.ts`, add the new fields to the `Campaign` interface after the existing `delivery_fee` field:

```typescript
export interface Campaign {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  style?: string;
  tone?: string;
  open_for_sponsorship?: boolean;
  // DragonDash fields
  delivery_type?: 'standard' | 'expedited' | 'dragonrush';
  delivery_fee?: number;
  pricing_type?: 'fixed' | 'bid_range';
  fixed_price?: number;
  escrow_status?: 'none' | 'pending' | 'held' | 'released' | 'refunded';
  escrow_payment_intent_id?: string;
  // Campaign detail fields
  tagline?: string;
  campaign_type?: string;
  per_creator_cap?: number;
  usage_rights_days?: number;
  exclusivity_days?: number;
  geographic_scope?: 'city' | 'region' | 'national';
  creator_count?: number;
  target_creator_personas?: string[];
  hashtag_requirements?: string;
  // AI-generated campaign analysis
  ai_analysis?: CampaignAnalysis | null;
  ai_preview_status?: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in `useCampaignCreator.ts` (missing new fields in `ideaToEditableCampaign`). That's expected — we fix it in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/types/campaignCreator.ts src/hooks/useCampaignQueries.ts
git commit -m "feat: add campaign detail fields to EditableCampaign and Campaign types"
```

---

## Task 2: Update validation schemas

**Files:**
- Modify: `src/lib/campaignCreatorValidation.ts:64-83`

- [ ] **Step 1: Add new optional fields to launchValidationSchema**

Append the new fields to `launchValidationSchema` in `src/lib/campaignCreatorValidation.ts`. All are optional since Donny pre-fills them with defaults:

```typescript
export const launchValidationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  platforms: z.array(platformSchema).min(1, 'Select at least one platform'),
  deliverables: z.array(z.object({
    id: z.string(),
    content_type: contentTypeSchema.catch('video_reel'),
    platform: platformSchema.catch('instagram'),
    aspect_ratio: aspectRatioSchema.catch('9:16'),
    max_duration_seconds: z.number().nullish(),
    description: z.string().nullish(),
  })).min(1, 'At least one deliverable required'),
  budget_min: z.number().positive('Budget must be positive'),
  budget_max: z.number().positive('Budget must be positive'),
  deadline: z.string().refine(
    (d) => new Date(d) > new Date(),
    'Deadline must be in the future'
  ),
  delivery_type: z.enum(['standard', 'expedited', 'dragonrush']),
  tagline: z.string().max(120).optional().default(''),
  per_creator_cap: z.number().min(0).optional().default(0),
  usage_rights_days: z.number().min(0).optional().default(30),
  exclusivity_days: z.number().min(0).optional().default(0),
  geographic_scope: z.enum(['city', 'region', 'national']).optional().default('city'),
  target_creator_count: z.number().min(1).optional().default(2),
});
```

- [ ] **Step 2: Add tagline to campaignIdeaSchema**

In the same file, add `tagline` to the `campaignIdeaSchema` so Donny's response can include it:

```typescript
export const campaignIdeaSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  description: z.string(),
  tagline: z.string().optional().default(''),
  campaign_type: campaignTypeSchema.catch('ugc_content'),
  recommended_platforms: z.array(platformSchema).min(1),
  deliverables: z.array(ideaDeliverableSchema).min(1),
  budget_range: z.object({ min: z.number(), max: z.number() }),
  timeline_days: z.number().positive(),
  tier: deliveryTierSchema.catch('standard'),
  tier_reasoning: z.string(),
  style_direction: z.string(),
  target_creator_persona: z.array(z.string()),
  key_messages: z.array(z.string()),
  hashtags: z.array(z.string()),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaignCreatorValidation.ts
git commit -m "feat: add campaign detail fields to validation schemas"
```

---

## Task 3: Update useCampaignCreator hook

**Files:**
- Modify: `src/hooks/useCampaignCreator.ts:23-54` (ideaToEditableCampaign)
- Modify: `src/hooks/useCampaignCreator.ts:278-299` (launch insert payload)
- Modify: `src/types/campaignCreator.ts:29-45` (CampaignIdea)

- [ ] **Step 1: Add tagline to CampaignIdea interface**

In `src/types/campaignCreator.ts`, add `tagline` after `description` in the `CampaignIdea` interface:

```typescript
export interface CampaignIdea {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tagline?: string;
  campaign_type: CampaignType;
  recommended_platforms: Platform[];
  deliverables: IdeaDeliverable[];
  budget_range: { min: number; max: number };
  timeline_days: number;
  tier: DeliveryTier;
  tier_reasoning: string;
  style_direction: string;
  target_creator_persona: string[];
  key_messages: string[];
  hashtags: string[];
}
```

- [ ] **Step 2: Map new fields in ideaToEditableCampaign**

In `src/hooks/useCampaignCreator.ts`, update the `ideaToEditableCampaign` function to include all new fields with sensible defaults:

```typescript
function ideaToEditableCampaign(idea: CampaignIdea): EditableCampaign {
  const deliverables: Deliverable[] = idea.deliverables.map((d) => ({
    id: crypto.randomUUID(),
    content_type: d.content_type,
    platform: d.platform,
    aspect_ratio: d.aspect_ratio,
    max_duration_seconds: d.estimated_duration ?? undefined,
    description: d.description,
  }));

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + idea.timeline_days);

  return {
    title: idea.title,
    description: idea.description,
    tagline: idea.tagline ?? '',
    campaign_type: idea.campaign_type,
    platforms: [...idea.recommended_platforms],
    deliverables,
    budget_min: idea.budget_range.min,
    budget_max: idea.budget_range.max,
    per_creator_cap: idea.budget_range.max,
    usage_rights_days: 30,
    exclusivity_days: 14,
    deadline: deadline.toISOString().split('T')[0],
    delivery_type: mapDeliveryTierToDb(idea.tier) as EditableCampaign['delivery_type'],
    geographic_scope: 'city',
    target_creator_count: 2,
    style_direction: idea.style_direction,
    target_creator_persona: [...idea.target_creator_persona],
    key_messages: [...idea.key_messages],
    hashtags: [...idea.hashtags],
    tier_reasoning: idea.tier_reasoning,
    emoji: idea.emoji,
    original_idea_id: idea.id,
  };
}
```

- [ ] **Step 3: Update launch insert payload**

In the same file, update the `launchMutation` `insertPayload` to write the new fields to the database. Replace the existing `insertPayload` block inside `mutationFn`:

```typescript
const insertPayload: Record<string, unknown> = {
  user_id: user.id,
  title: validated.title,
  description: validated.description,
  tagline: editedCampaign.tagline || null,
  campaign_type: editedCampaign.campaign_type,
  goals: editedCampaign.key_messages.join(', '),
  platforms: editedCampaign.platforms,
  budget_min: validated.budget_min,
  budget_max: validated.budget_max,
  per_creator_cap: editedCampaign.per_creator_cap || null,
  usage_rights_days: editedCampaign.usage_rights_days,
  exclusivity_days: editedCampaign.exclusivity_days,
  geographic_scope: editedCampaign.geographic_scope,
  creator_count: editedCampaign.target_creator_count,
  target_creator_personas: editedCampaign.target_creator_persona,
  hashtag_requirements: editedCampaign.hashtags.join(' '),
  deadline: validated.deadline,
  delivery_type: validated.delivery_type,
  delivery_fee: resolveTierFee(editedCampaign.delivery_type),
  style: editedCampaign.style_direction,
  status: 'published' as const,
  ai_analysis: {
    ...businessContext,
    brand_fields: userRole === 'brand' ? brandFields : undefined,
    target_creator_persona: editedCampaign.target_creator_persona,
    hashtags: editedCampaign.hashtags,
    tier_reasoning: editedCampaign.tier_reasoning,
  },
};
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Clean compile or only unrelated warnings.

- [ ] **Step 5: Commit**

```bash
git add src/types/campaignCreator.ts src/hooks/useCampaignCreator.ts
git commit -m "feat: map campaign detail fields through idea selection and launch flow"
```

---

## Task 4: Create SamplePromptCarousel

**Files:**
- Create: `src/components/campaign-creator/SamplePromptCarousel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/campaign-creator/SamplePromptCarousel.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface SamplePromptCarouselProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const TEMPLATES = [
  {
    label: 'Weekend Promo',
    template: `We're [Restaurant] in [City]. Looking for 2 Instagram reels showcasing our [signature dish] this weekend. Fun, vibrant energy — think foodie date night vibes.`,
  },
  {
    label: 'New Menu Launch',
    template: `[Restaurant] just launched a new summer menu. Need a TikTok and an IG carousel highlighting our top 3 new dishes. Clean, bright plating shots with a casual voiceover.`,
  },
  {
    label: 'Grand Opening',
    template: `We're opening [Restaurant] in [Neighborhood] next Friday! Need 3 creators to cover opening night — 1 reel each, plus stories. Energetic, packed-house vibes.`,
  },
  {
    label: 'Seasonal Special',
    template: `[Restaurant] is running a Valentine's Day prix fixe dinner. Looking for 1 romantic, cinematic reel — candlelit ambiance, plated courses, couple reactions.`,
  },
];

function personalize(template: string, businessName?: string, city?: string): string {
  let result = template;
  if (businessName) {
    result = result.replace(/\[Restaurant\]/g, businessName);
  }
  if (city) {
    result = result.replace(/\[City\]/g, city).replace(/\[Neighborhood\]/g, city);
  }
  return result;
}

export function SamplePromptCarousel({ onSelect, disabled }: SamplePromptCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showCopied, setShowCopied] = useState(false);
  const { profile } = useAuth();

  const businessName = profile?.business_name ?? undefined;
  const city = profile?.city ?? undefined;

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % TEMPLATES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTap = useCallback(() => {
    if (disabled) return;
    const text = personalize(TEMPLATES[activeIndex].template, businessName, city);
    onSelect(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, [activeIndex, businessName, city, disabled, onSelect]);

  const current = TEMPLATES[activeIndex];
  const displayText = personalize(current.template, businessName, city);

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={disabled}
      className="w-full bg-teal-50 border border-teal-200 rounded-2xl p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-50 mt-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-teal-500 font-semibold text-[11px] uppercase tracking-wide">
          Try this example
        </span>
        <span className="text-gray-400 text-[11px]">
          {showCopied ? 'Copied!' : 'Tap to copy'}
        </span>
      </div>
      <p className="text-gray-700 text-[13px] leading-relaxed">
        "{displayText}"
      </p>
      <div className="flex items-center gap-1.5 mt-3">
        {TEMPLATES.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === activeIndex ? 'bg-teal-400' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep SamplePromptCarousel`

Expected: No errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-creator/SamplePromptCarousel.tsx
git commit -m "feat: create SamplePromptCarousel component for Screen 1"
```

---

## Task 5: Wire SamplePromptCarousel into DropScreen

**Files:**
- Modify: `src/components/campaign-creator/DropScreen.tsx`
- Modify: `src/components/campaign-creator/SmartInput.tsx`

- [ ] **Step 1: Add setValue prop to SmartInput**

The `SmartInput` component needs an external way to set its value (for the carousel tap-to-copy). Add an optional `externalValue` prop to `SmartInput` in `src/components/campaign-creator/SmartInput.tsx`:

Add a new prop and useEffect after the existing state declarations:

```typescript
interface SmartInputProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  externalValue?: string;
}

export function SmartInput({ onSubmit, isExtracting, externalValue }: SmartInputProps) {
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (externalValue !== undefined) {
      setValue(externalValue);
    }
  }, [externalValue]);
```

The rest of the component stays the same.

- [ ] **Step 2: Add SamplePromptCarousel to DropScreen**

Update `src/components/campaign-creator/DropScreen.tsx` to wire the carousel to SmartInput:

```tsx
import { useState } from 'react';
import { SmartInput } from './SmartInput';
import { DonnyGreeting } from './DonnyGreeting';
import { ExtractionFeed } from './ExtractionFeed';
import { SamplePromptCarousel } from './SamplePromptCarousel';

interface DropScreenProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  extractionMessages: string[];
}

export function DropScreen({ onSubmit, isExtracting, extractionMessages }: DropScreenProps) {
  const [externalValue, setExternalValue] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <DonnyGreeting isExtracting={isExtracting} />
      <div className="w-full max-w-md">
        <SmartInput onSubmit={onSubmit} isExtracting={isExtracting} externalValue={externalValue} />
        <SamplePromptCarousel onSelect={setExternalValue} disabled={isExtracting} />
        <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `npx tsc --noEmit 2>&1 | head -10`

Then run `npm run dev` and verify Screen 1 shows the carousel below the input. Tap a template and confirm it populates the input field.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-creator/SmartInput.tsx src/components/campaign-creator/DropScreen.tsx
git commit -m "feat: wire SamplePromptCarousel into Screen 1 DropScreen"
```

---

## Task 6: Create EditorSection component

**Files:**
- Create: `src/components/campaign-creator/EditorSection.tsx`

- [ ] **Step 1: Create the collapsible section wrapper**

Create `src/components/campaign-creator/EditorSection.tsx`:

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EditorSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  id?: string;
}

export function EditorSection({ title, defaultOpen = true, children, id }: EditorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div id={id} className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-teal-50 px-4 py-3 flex items-center justify-between"
      >
        <span className="font-semibold text-sm text-gray-900">{title}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-teal-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-gray-200 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaign-creator/EditorSection.tsx
git commit -m "feat: create collapsible EditorSection component"
```

---

## Task 7: Refactor CampaignEditor into sections with new fields

**Files:**
- Modify: `src/components/campaign-creator/CampaignEditor.tsx`

- [ ] **Step 1: Rewrite CampaignEditor with 4 sections**

Replace the contents of `src/components/campaign-creator/CampaignEditor.tsx`:

```tsx
import type { EditableCampaign, BrandFields, CampaignIdea } from '@/types/campaignCreator';
import { EditableField } from './EditableField';
import { PlatformChips } from './PlatformChips';
import { DeliverablesList } from './DeliverablesList';
import { BudgetSlider } from './BudgetSlider';
import { TimelinePicker } from './TimelinePicker';
import { TierBadge } from './TierBadge';
import { EditorSection } from './EditorSection';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import CostBreakdown from '@/components/campaigns/CostBreakdown';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';

interface CampaignEditorProps {
  campaign: EditableCampaign;
  originalIdea: CampaignIdea;
  brandFields: BrandFields | null;
  userRole: 'business_client' | 'brand' | null;
  updateField: <K extends keyof EditableCampaign>(field: K, value: EditableCampaign[K]) => void;
  updateBrandField: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void;
}

const GEO_OPTIONS: { value: EditableCampaign['geographic_scope']; label: string }[] = [
  { value: 'city', label: 'City' },
  { value: 'region', label: 'Region' },
  { value: 'national', label: 'National' },
];

const PERSONA_OPTIONS = [
  'Foodie', 'Lifestyle', 'Fitness', 'Beauty', 'Tech',
  'Travel', 'Fashion', 'Parenting', 'Gaming', 'Comedy',
];

export function CampaignEditor({
  campaign, originalIdea, brandFields, userRole, updateField, updateBrandField,
}: CampaignEditorProps) {
  const currentTier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = currentTier ? TIER_LIMITS[currentTier] : TIER_LIMITS.standard;

  return (
    <div className="bg-white rounded-2xl border border-teal-300 p-5 space-y-3 animate-in slide-in-from-bottom-4 duration-300">
      {/* Campaign Overview */}
      <EditorSection title="Campaign Overview" id="section-overview">
        <EditableField label="Title" value={campaign.title} originalValue={originalIdea.title}
          onChange={(v) => updateField('title', v)} />
        <EditableField label="Tagline" value={campaign.tagline} originalValue={originalIdea.tagline ?? ''}
          onChange={(v) => updateField('tagline', v)} />
        <EditableField label="Description" value={campaign.description} originalValue={originalIdea.description}
          onChange={(v) => updateField('description', v)} multiline />
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign Type</label>
          <p className="mt-1 text-sm text-teal-600 capitalize">
            {campaign.campaign_type.replace(/_/g, ' ')}
          </p>
        </div>
      </EditorSection>

      {/* Content Requirements */}
      <EditorSection title="Content Requirements" id="section-content">
        <PlatformChips selected={campaign.platforms} onChange={(v) => updateField('platforms', v)} />
        <DeliverablesList deliverables={campaign.deliverables} onChange={(v) => updateField('deliverables', v)} />
        <EditableField label="Style Direction" value={campaign.style_direction} originalValue={originalIdea.style_direction}
          onChange={(v) => updateField('style_direction', v)} />
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Key Messages</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {campaign.key_messages.map((msg, i) => (
              <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{msg}</span>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Hashtags</label>
          <p className="mt-1 text-sm text-teal-500">{campaign.hashtags.join(' ')}</p>
        </div>
      </EditorSection>

      {/* Compensation & Terms */}
      <EditorSection title="Compensation & Terms" id="section-compensation">
        <BudgetSlider min={campaign.budget_min} max={campaign.budget_max}
          onChangeMin={(v) => updateField('budget_min', v)} onChangeMax={(v) => updateField('budget_max', v)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Per-Creator Cap</label>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-gray-500">$</span>
              <Input type="number" value={campaign.per_creator_cap}
                onChange={(e) => updateField('per_creator_cap', Number(e.target.value))} className="text-sm" />
            </div>
          </div>
          <div />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Usage Rights (days)</label>
            <Input type="number" value={campaign.usage_rights_days}
              onChange={(e) => updateField('usage_rights_days', Number(e.target.value))} className="mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Exclusivity (days)</label>
            <Input type="number" value={campaign.exclusivity_days}
              onChange={(e) => updateField('exclusivity_days', Number(e.target.value))} className="mt-1 text-sm" />
          </div>
        </div>
        <CostBreakdown
          deliverableCount={campaign.deliverables.length}
          budgetTotal={campaign.budget_max + tierConfig.fee}
          baseCostPerDeliverable={campaign.deliverables.length > 0 ? campaign.budget_max / campaign.deliverables.length : 0}
          premiumAmount={tierConfig.fee}
          deliveryType={tierConfig.label}
        />
      </EditorSection>

      {/* Logistics & Targeting */}
      <EditorSection title="Logistics & Targeting" id="section-logistics">
        <TimelinePicker deadline={campaign.deadline} onChange={(v) => updateField('deadline', v)} />
        <TierBadge deliveryType={campaign.delivery_type} tierReasoning={campaign.tier_reasoning}
          onChange={(v) => updateField('delivery_type', v)} />
        <div>
          <label className="text-xs font-medium text-gray-500">Geographic Scope</label>
          <div className="flex gap-2 mt-2">
            {GEO_OPTIONS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => updateField('geographic_scope', value)}
                className={cn('rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  campaign.geographic_scope === value ? 'bg-teal-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Target Creator Count</label>
          <Input type="number" min={1} value={campaign.target_creator_count}
            onChange={(e) => updateField('target_creator_count', Number(e.target.value))} className="mt-1 text-sm w-24" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Target Creators</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PERSONA_OPTIONS.map((persona) => {
              const key = persona.toLowerCase();
              const isSelected = campaign.target_creator_persona.includes(key);
              return (
                <button key={key} type="button"
                  onClick={() => {
                    const next = isSelected
                      ? campaign.target_creator_persona.filter((p) => p !== key)
                      : [...campaign.target_creator_persona, key];
                    updateField('target_creator_persona', next);
                  }}
                  className={cn('rounded-full px-3 py-1 text-sm font-medium transition-colors',
                    isSelected ? 'bg-pink-300 text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                  {persona}
                </button>
              );
            })}
          </div>
        </div>
      </EditorSection>

      {/* Brand-only panel (unchanged) */}
      {userRole === 'brand' && brandFields && (
        <EditorSection title="Brand Settings">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500">Budget Pool</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-gray-500">$</span>
                <Input type="number" value={brandFields.budget_pool}
                  onChange={(e) => updateBrandField('budget_pool', Number(e.target.value))} className="text-sm" />
              </div>
            </div>
            <div />
          </div>
        </EditorSection>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: Clean compile.

- [ ] **Step 3: Test in browser**

Run `npm run dev`. Navigate to campaign creation, submit a URL or text, select an idea. Verify:
- All 4 sections appear expanded
- Title, Tagline, Description editable in Section 1
- Platforms, Deliverables, Style, Key Messages, Hashtags in Section 2
- Budget slider, Per-Creator Cap, Usage Rights, Exclusivity in Section 3
- Deadline, Tier, Geographic Scope, Creator Count, Personas in Section 4
- Sections collapse/expand on header tap

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-creator/CampaignEditor.tsx
git commit -m "feat: reorganize CampaignEditor into 4 collapsible sections with all fields"
```

---

## Task 8: Create campaign detail sub-components

**Files:**
- Create: `src/components/campaign-details/CampaignHero.tsx`
- Create: `src/components/campaign-details/CampaignQuickStats.tsx`
- Create: `src/components/campaign-details/CampaignDetailSection.tsx`

- [ ] **Step 1: Create CampaignHero**

Create directory and file `src/components/campaign-details/CampaignHero.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignHeroProps {
  campaign: Campaign;
}

const TIER_LABELS: Record<string, string> = {
  dragonrush: 'DragonDash',
  expedited: 'Express',
  standard: 'Standard',
};

export function CampaignHero({ campaign }: CampaignHeroProps) {
  const navigate = useNavigate();
  const tierLabel = campaign.delivery_type ? TIER_LABELS[campaign.delivery_type] ?? 'Standard' : 'Standard';
  const tierEmoji = campaign.delivery_type === 'dragonrush' ? '🐉' : campaign.delivery_type === 'expedited' ? '⚡' : '📦';
  const emoji = (campaign.ai_analysis as Record<string, unknown>)?.emoji as string ?? '📣';
  const businessName = (campaign.ai_analysis as Record<string, unknown>)?.business_name as string | undefined;
  const tagline = campaign.tagline;
  const campaignType = campaign.campaign_type?.replace(/_/g, ' ') ?? 'Campaign';

  return (
    <div className="relative bg-gradient-to-br from-dc-teal to-dc-teal-dark px-5 pt-5 pb-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 mb-4"
        aria-label="Back"
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white" />
        </div>
        <span className="text-white/85 text-sm font-medium">Back</span>
      </button>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">{emoji}</span>
        <div>
          <h1 className="text-xl font-bold text-white">{campaign.title}</h1>
          <span className="text-xs text-white/80 capitalize">
            {campaignType}{businessName ? ` · ${businessName}` : ''}
          </span>
        </div>
      </div>

      {tagline && (
        <p className="text-white/90 text-sm italic">"{tagline}"</p>
      )}

      <div className="absolute top-5 right-5 bg-black/25 px-3 py-1 rounded-full">
        <span className="text-white text-xs font-semibold">{tierEmoji} {tierLabel}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CampaignQuickStats**

Create `src/components/campaign-details/CampaignQuickStats.tsx`:

```tsx
interface CampaignQuickStatsProps {
  budgetMin?: number;
  budgetMax?: number;
  deadline?: string;
  creatorCount?: number;
}

export function CampaignQuickStats({ budgetMin, budgetMax, deadline, creatorCount }: CampaignQuickStatsProps) {
  const formatBudget = () => {
    if (!budgetMin && !budgetMax) return 'TBD';
    return `$${budgetMin ?? 0}–${budgetMax ?? 0}`;
  };

  const formatDeadline = () => {
    if (!deadline) return 'TBD';
    return new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex justify-between bg-teal-50 border border-teal-100 rounded-xl p-3 mb-4">
      <div className="text-center flex-1">
        <p className="text-base font-bold text-gray-900">{formatBudget()}</p>
        <span className="text-[10px] text-gray-500 uppercase">Budget</span>
      </div>
      <div className="w-px bg-pink-300" />
      <div className="text-center flex-1">
        <p className="text-base font-bold text-gray-900">{formatDeadline()}</p>
        <span className="text-[10px] text-gray-500 uppercase">Deadline</span>
      </div>
      <div className="w-px bg-pink-300" />
      <div className="text-center flex-1">
        <p className="text-base font-bold text-gray-900">{creatorCount ?? '—'}</p>
        <span className="text-[10px] text-gray-500 uppercase">Creators</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CampaignDetailSection**

Create `src/components/campaign-details/CampaignDetailSection.tsx`:

```tsx
interface CampaignDetailSectionProps {
  title: string;
  children: React.ReactNode;
}

export function CampaignDetailSection({ title, children }: CampaignDetailSectionProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      <div className="bg-teal-50 px-4 py-2.5">
        <span className="font-semibold text-sm text-gray-900">{title}</span>
      </div>
      <div className="px-4 py-3 border-t border-gray-200 space-y-3">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/
git commit -m "feat: create CampaignHero, CampaignQuickStats, and CampaignDetailSection components"
```

---

## Task 9: Create CreatorCampaignDetails layout

**Files:**
- Create: `src/components/campaign-details/CreatorCampaignDetails.tsx`

- [ ] **Step 1: Create the full creator-facing detail layout**

Create `src/components/campaign-details/CreatorCampaignDetails.tsx`:

```tsx
import type { Campaign } from '@/hooks/useCampaignQueries';
import { CampaignHero } from './CampaignHero';
import { CampaignQuickStats } from './CampaignQuickStats';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CreatorCampaignDetailsProps {
  campaign: Campaign;
}

const TIER_TIMEFRAMES: Record<string, string> = {
  dragonrush: '1–3 hours',
  expedited: '24–48 hours',
  standard: '5–7 days',
};

const TIER_LABELS: Record<string, string> = {
  dragonrush: 'DragonDash',
  expedited: 'Express',
  standard: 'Standard',
};

export function CreatorCampaignDetails({ campaign }: CreatorCampaignDetailsProps) {
  const tierLabel = campaign.delivery_type ? TIER_LABELS[campaign.delivery_type] ?? 'Standard' : 'Standard';
  const tierTimeframe = campaign.delivery_type ? TIER_TIMEFRAMES[campaign.delivery_type] ?? '' : '';
  const tierEmoji = campaign.delivery_type === 'dragonrush' ? '🐉' : campaign.delivery_type === 'expedited' ? '⚡' : '📦';

  const hashtags = campaign.hashtag_requirements
    ?? (campaign.ai_analysis as Record<string, unknown>)?.hashtags as string[] | undefined;
  const keyMessages = campaign.goals?.split(', ').filter(Boolean) ?? [];
  const personas = campaign.target_creator_personas
    ?? (campaign.ai_analysis as Record<string, unknown>)?.target_creator_persona as string[] | undefined;
  const styleDirection = campaign.style
    ?? (campaign.ai_analysis as Record<string, unknown>)?.style_direction as string | undefined;

  const formatCurrency = (amount?: number) => {
    if (!amount) return '—';
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <CampaignHero campaign={campaign} />

      <div className="px-5 pt-4 pb-6">
        <CampaignQuickStats
          budgetMin={campaign.budget_min}
          budgetMax={campaign.budget_max}
          deadline={campaign.deadline}
          creatorCount={campaign.creator_count}
        />

        {campaign.description && (
          <p className="text-sm text-gray-700 leading-relaxed mb-4">{campaign.description}</p>
        )}

        {/* Content Requirements */}
        <CampaignDetailSection title="Content Requirements">
          {campaign.platforms && campaign.platforms.length > 0 && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Platforms</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {campaign.platforms.map((p) => (
                  <span key={p} className="bg-teal-400 text-white text-xs px-2.5 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}

          {campaign.deliverables && campaign.deliverables.length > 0 && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Deliverables</span>
              <div className="mt-1 space-y-1">
                {campaign.deliverables.map((d, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">{d}</div>
                ))}
              </div>
            </div>
          )}

          {styleDirection && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Style Direction</span>
              <p className="mt-0.5 text-sm text-gray-700">{styleDirection}</p>
            </div>
          )}

          {keyMessages.length > 0 && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Key Messages</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {keyMessages.map((m, i) => (
                  <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{m}</span>
                ))}
              </div>
            </div>
          )}

          {hashtags && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Hashtags</span>
              <p className="mt-0.5 text-sm text-teal-500">
                {Array.isArray(hashtags) ? hashtags.join(' ') : hashtags}
              </p>
            </div>
          )}
        </CampaignDetailSection>

        {/* Compensation & Terms */}
        <CampaignDetailSection title="Compensation & Terms">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Budget Range</span>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(campaign.budget_min)} – {formatCurrency(campaign.budget_max)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Per-Creator Cap</span>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(campaign.per_creator_cap)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Usage Rights</span>
              <p className="text-sm text-gray-900">
                {campaign.usage_rights_days === 0 ? 'Perpetual' : `${campaign.usage_rights_days ?? 30} days`}
              </p>
              <span className="text-[10px] text-gray-500">Brand can reuse your content</span>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Exclusivity</span>
              <p className="text-sm text-gray-900">
                {campaign.exclusivity_days === 0 ? 'None' : `${campaign.exclusivity_days ?? 0} days`}
              </p>
              <span className="text-[10px] text-gray-500">No competing campaigns</span>
            </div>
          </div>
        </CampaignDetailSection>

        {/* Logistics & Targeting */}
        <CampaignDetailSection title="Logistics & Targeting">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Deadline</span>
              <p className="text-sm text-gray-900">
                {campaign.deadline ? new Date(campaign.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Delivery Tier</span>
              <p className="text-sm text-gray-900">{tierEmoji} {tierLabel} ({tierTimeframe})</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Geographic Scope</span>
              <p className="text-sm text-gray-900 capitalize">{campaign.geographic_scope ?? '—'}</p>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Looking For</span>
              {personas && personas.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {personas.map((p) => (
                    <span key={p} className="bg-pink-300 text-gray-900 text-xs px-2 py-0.5 rounded-full capitalize">{p}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">—</p>
              )}
            </div>
          </div>
        </CampaignDetailSection>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaign-details/CreatorCampaignDetails.tsx
git commit -m "feat: create CreatorCampaignDetails full layout component"
```

---

## Task 10: Rewrite CampaignDetailsPage for creator view

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx`

- [ ] **Step 1: Update CampaignDetailsPage to use CreatorCampaignDetails**

Replace the contents of `src/pages/CampaignDetailsPage.tsx`. The creator view uses the new `CreatorCampaignDetails` component with the hero + sections layout. The business/brand owner view keeps the existing tab-based layout:

```tsx
import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Users, Target, AlertCircle, Send, CheckCircle, FolderOpen } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import CampaignDetailsOverview from '@/components/campaigns/CampaignDetailsOverview';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';
import CreatorMatchingSection from '@/components/campaigns/CreatorMatchingSection';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplicationStatus } from '@/hooks/useCreatorApplicationStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ApplicationForm from '@/components/campaigns/ApplicationForm';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);

  const isCreatorView = location.pathname.includes('/creator/');
  const userRole = isCreatorView ? 'content_creator' : 'business_client';
  const isOwnCampaign = campaign?.user_id === user?.id;

  const { hasApplied, applicationStatus, isLoading: isCheckingStatus } = useCreatorApplicationStatus(id);

  const canApply = isCreatorView && !isOwnCampaign && campaign?.status === 'published' && !hasApplied;
  const showAppliedBadge = isCreatorView && hasApplied && applicationStatus === 'pending';
  const showAcceptedButton = isCreatorView && hasApplied && applicationStatus === 'accepted';
  const canReapply = isCreatorView && hasApplied && applicationStatus === 'rejected';

  const backHref = isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns';

  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden">
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 text-center space-y-4 w-full max-w-sm">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Campaign not found</h2>
            <p className="text-gray-500 text-sm">
              This campaign doesn't exist or you don't have access to it.
            </p>
            <button
              onClick={() => navigate(backHref)}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            >
              Back to Campaigns
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Creator view — new sectioned layout
  if (isCreatorView) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-28">
          <div className="md:max-w-2xl md:mx-auto md:mt-6">
            <CreatorCampaignDetails campaign={campaign} />

            {/* Creator action buttons */}
            <div className="px-5 mt-4">
              {canApply && (
                <button
                  onClick={() => setShowApplicationDialog(true)}
                  className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Apply Now
                </button>
              )}
              {showAppliedBadge && (
                <div className="w-full rounded-full bg-gray-100 text-gray-500 font-bold py-3.5 flex items-center justify-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Applied (Pending)
                </div>
              )}
              {showAcceptedButton && (
                <button
                  onClick={() => navigate('/dashboard/creator/projects')}
                  className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 flex items-center justify-center gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  View Project
                </button>
              )}
              {canReapply && (
                <button
                  onClick={() => setShowApplicationDialog(true)}
                  className="w-full rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3.5 flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Apply Again
                </button>
              )}
              {campaign.creator_count && (
                <p className="text-center text-xs text-gray-500 mt-2">
                  {campaign.creator_count} spots total
                </p>
              )}
            </div>
          </div>

          <Dialog open={showApplicationDialog} onOpenChange={setShowApplicationDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Apply to Campaign</DialogTitle>
              </DialogHeader>
              <ApplicationForm
                campaign={campaign}
                onSuccess={() => setShowApplicationDialog(false)}
                onCancel={() => setShowApplicationDialog(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  // Business/brand owner view — existing tab layout
  return (
    <DashboardLayout userRole={userRole}>
      <div className="min-h-screen bg-gray-50 overflow-x-hidden">
        <div className="relative h-40 bg-gradient-to-br from-dc-teal to-dc-teal-dark">
          <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center">
            <button onClick={() => navigate(backHref)} className="text-white mr-2" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-white uppercase tracking-wide truncate px-2">
              {campaign.title}
            </h1>
            {isOwnCampaign && (
              <button onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)} className="text-white" aria-label="Edit campaign">
                <Edit className="h-5 w-5" />
              </button>
            )}
            {!isOwnCampaign && <span className="w-5" />}
          </div>
        </div>

        <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28 overflow-hidden md:max-w-5xl md:mx-auto md:rounded-3xl md:mt-6 md:shadow-lg">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 break-words">{campaign.title}</h2>
            <p className="text-gray-500 text-sm mt-0.5">Campaign Details & Management</p>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-gray-100">
              <TabsTrigger value="overview" className="rounded-full flex items-center gap-1.5 text-xs">
                <Target className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="applications" className="rounded-full flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" /> Applications
              </TabsTrigger>
              <TabsTrigger value="matching" className="rounded-full flex items-center gap-1.5 text-xs">
                <Target className="h-3.5 w-3.5" /> AI Match
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <CampaignDetailsOverview campaign={campaign} />
            </TabsContent>
            <TabsContent value="applications">
              <ApplicationsListFixed campaignId={campaign.id} />
            </TabsContent>
            <TabsContent value="matching">
              <CreatorMatchingSection campaignId={campaign.id} />
            </TabsContent>
          </Tabs>

          {isOwnCampaign && (
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3 mt-6 flex items-center justify-center gap-2"
            >
              <Edit className="h-4 w-4" /> Edit Campaign
            </button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: Clean compile.

- [ ] **Step 3: Test both views in browser**

Run `npm run dev`. Test:
1. **Creator view** — navigate to a campaign as a creator. Verify: teal hero with back button, quick stats bar, 3 detail sections all expanded, Apply Now button at bottom.
2. **Business view** — navigate to a campaign as the owner. Verify: existing tab layout unchanged (Overview, Applications, AI Match).
3. **Back button** — tap back from creator view, confirm it returns to previous page.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: redesign creator-facing campaign detail page with hero and sectioned layout"
```

---

## Task 11: Final integration test

**Files:** None (verification only)

- [ ] **Step 1: Full flow test**

Run `npm run dev` and test the complete flow:

1. Go to campaign creation (Screen 1)
2. Verify sample prompt carousel appears below input with 4 rotating examples
3. Tap a sample prompt — verify it populates the input
4. Submit the text — Donny generates ideas (Screen 2)
5. Select an idea — verify all 4 editor sections expand with all fields populated
6. Edit a field in each section (title, style direction, per-creator cap, geographic scope)
7. Launch the campaign
8. Navigate to the campaign as a creator — verify all fields appear in the detail page
9. Verify back button works from the detail page

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`

Expected: Clean compile with no errors.

- [ ] **Step 3: Build check**

Run: `npm run build`

Expected: Successful build with no errors.

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: final integration cleanup for campaign template and full details"
```
