# Campaign Creation Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3 fragmented campaign creation wizards with a unified 2-screen "Donny-First" flow — paste a URL, get 3 AI-generated campaign ideas, tap to expand, edit inline, launch.

**Architecture:** A single `CampaignCreator` page with a `useCampaignCreator` hook manages all state. Screen 1 ("The Drop") collects input via `SmartInput`. Screen 2 ("The Launchpad") shows `IdeaCarousel` + `CampaignEditor`. Desktop gets a split view (Donny left, live preview right). The enhanced `donny-campaign-generate` edge function handles URL extraction + idea generation in one call.

**Tech Stack:** React 18 + TypeScript strict, Supabase (Postgres + Edge Functions + Storage), Tailwind CSS, React Query (TanStack Query), Zod validation, shadcn/ui primitives.

**Spec:** `docs/superpowers/specs/2026-04-25-campaign-creation-redesign.md`

---

## File Structure

### New Files

```
src/types/campaignCreator.ts              — BusinessContext, IdeaDeliverable, CampaignIdea, EditableCampaign, BrandFields
src/lib/campaignCreatorValidation.ts      — Zod schemas for edge function response + launch validation
src/lib/campaignCreatorDraft.ts           — localStorage draft persistence helpers
src/hooks/useCampaignCreator.ts           — Unified wizard hook (replaces 3 old hooks)
src/pages/CampaignCreator.tsx             — Page-level component, responsive layout, route entry
src/components/campaign-creator/
  SmartInput.tsx                           — URL/photo/text input with auto-detection
  DonnyGreeting.tsx                        — Donny avatar + greeting on Screen 1
  ExtractionFeed.tsx                       — Donny commentary messages during extraction
  DropScreen.tsx                           — Screen 1 layout (input + feed)
  IdeaCard.tsx                             — Single campaign idea card
  IdeaCarousel.tsx                         — Mobile swipe container + desktop stack
  RegenerateButton.tsx                     — Regenerate ideas action
  EditableField.tsx                        — Reusable tap-to-edit field primitive
  PlatformChips.tsx                        — Platform toggle chip row
  DeliverablesList.tsx                     — Pre-filled deliverable list with add/remove
  BudgetSlider.tsx                         — Min/max budget range inputs
  TimelinePicker.tsx                       — Deadline date picker
  TierBadge.tsx                            — Auto-selected tier display + change dropdown
  BrandFieldsPanel.tsx                     — Brand-only expanded fields
  CampaignEditor.tsx                       — Assembles all editor field components
  LaunchButton.tsx                         — Launch campaign + anonymous auth gate
  CampaignPreviewCard.tsx                  — Desktop right panel live preview
  LaunchpadScreen.tsx                      — Screen 2 layout (cards + editor + launch)
supabase/migrations/20260425000000_create_business_contexts.sql — New table + RLS
```

### Modified Files

```
supabase/functions/donny-campaign-generate/index.ts  — Enhanced input/output, backward-compatible
src/App.tsx                                           — Swap 3 old wizard imports for CampaignCreator
```

### Deleted in Phase 3 (not part of this plan)

Old wizards and hooks are left in-place but un-routed. Deletion is a separate cleanup task after validation.

---

## Task 1: Types and Validation Schemas

**Files:**
- Create: `src/types/campaignCreator.ts`
- Create: `src/lib/campaignCreatorValidation.ts`
- Reference: `src/types/campaignMedia.ts` (existing types to import)

- [ ] **Step 1: Create the campaign creator types file**

```typescript
// src/types/campaignCreator.ts
import type { ContentType, Platform, AspectRatio, DeliveryTier, Deliverable } from './campaignMedia';

export interface BusinessContext {
  source_url: string;
  source_type: 'google_business' | 'instagram' | 'website' | 'yelp' | 'photo' | 'manual';
  business_name: string;
  cuisine_type?: string;
  location: { city: string; state?: string; country: string };
  rating?: number;
  review_count?: number;
  price_range?: '$' | '$$' | '$$$' | '$$$$';
  photos: string[];
  vibe_tags: string[];
  hours?: Record<string, string>;
  social_links?: { instagram?: string; tiktok?: string; website?: string };
  review_highlights?: string[];
}

export interface IdeaDeliverable {
  description: string;
  content_type: ContentType;
  platform: Platform;
  aspect_ratio: AspectRatio;
  estimated_duration?: number;
}

export type CampaignType = 'ugc_content' | 'launch_hype' | 'ongoing_presence' | 'event_promo' | 'seasonal';

export interface CampaignIdea {
  id: string;
  emoji: string;
  title: string;
  description: string;
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

export interface EditableCampaign {
  title: string;
  description: string;
  campaign_type: CampaignType;
  platforms: Platform[];
  deliverables: Deliverable[];
  budget_min: number;
  budget_max: number;
  deadline: string;
  delivery_type: 'standard' | 'expedited' | 'dragonrush';
  style_direction: string;
  target_creator_persona: string[];
  key_messages: string[];
  hashtags: string[];
  tier_reasoning: string;
  emoji: string;
  original_idea_id: string;
}

export interface BrandFields {
  budget_pool: number;
  per_creator_cap: number;
  usage_rights_days: number;
  exclusivity_days: number;
  geographic_scope: 'city' | 'region' | 'national';
  target_creator_count: number;
  tagline?: string;
}

export interface DonnyGenerateRequest {
  source_url?: string;
  source_type: BusinessContext['source_type'];
  photo_url?: string;
  manual_text?: string;
  role: 'business_client' | 'brand' | null;
}

export interface DonnyGenerateResponse {
  business_context: BusinessContext;
  campaign_ideas: CampaignIdea[];
}
```

- [ ] **Step 2: Create the Zod validation schemas**

```typescript
// src/lib/campaignCreatorValidation.ts
import { z } from 'zod';

const contentTypeSchema = z.enum(['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short']);
const platformSchema = z.enum(['instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform']);
const aspectRatioSchema = z.enum(['9:16', '16:9', '1:1', '4:5']);
const deliveryTierSchema = z.enum(['dragondash', 'express', 'standard']);
const campaignTypeSchema = z.enum(['ugc_content', 'launch_hype', 'ongoing_presence', 'event_promo', 'seasonal']);

export const ideaDeliverableSchema = z.object({
  description: z.string(),
  content_type: contentTypeSchema.catch('video_reel'),
  platform: platformSchema.catch('instagram'),
  aspect_ratio: aspectRatioSchema.catch('9:16'),
  estimated_duration: z.number().optional(),
});

export const businessContextSchema = z.object({
  source_url: z.string(),
  source_type: z.enum(['google_business', 'instagram', 'website', 'yelp', 'photo', 'manual']),
  business_name: z.string(),
  cuisine_type: z.string().optional(),
  location: z.object({
    city: z.string(),
    state: z.string().optional(),
    country: z.string(),
  }),
  rating: z.number().optional(),
  review_count: z.number().optional(),
  price_range: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
  photos: z.array(z.string()).default([]),
  vibe_tags: z.array(z.string()).default([]),
  hours: z.record(z.string()).optional(),
  social_links: z.object({
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
  review_highlights: z.array(z.string()).optional(),
});

export const campaignIdeaSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  description: z.string(),
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

export const donnyGenerateResponseSchema = z.object({
  business_context: businessContextSchema,
  campaign_ideas: z.array(campaignIdeaSchema).min(1).max(5),
});

export const launchValidationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  platforms: z.array(platformSchema).min(1, 'Select at least one platform'),
  deliverables: z.array(z.object({
    id: z.string(),
    content_type: contentTypeSchema,
    platform: platformSchema,
    aspect_ratio: aspectRatioSchema,
    max_duration_seconds: z.number().optional(),
    description: z.string().optional(),
  })).min(1, 'At least one deliverable required'),
  budget_min: z.number().positive('Budget must be positive'),
  budget_max: z.number().positive('Budget must be positive'),
  deadline: z.string().refine(
    (d) => new Date(d) > new Date(),
    'Deadline must be in the future'
  ),
  delivery_type: z.enum(['standard', 'expedited', 'dragonrush']),
});
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit src/types/campaignCreator.ts src/lib/campaignCreatorValidation.ts`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/campaignCreator.ts src/lib/campaignCreatorValidation.ts
git commit -m "feat: add campaign creator types and Zod validation schemas"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260425000000_create_business_contexts.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260425000000_create_business_contexts.sql
create table if not exists business_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  source_url text not null,
  source_type text not null check (source_type in ('google_business', 'instagram', 'website', 'yelp', 'photo', 'manual')),
  extracted_data jsonb not null,
  extracted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index idx_business_contexts_profile on business_contexts(profile_id);
create index idx_business_contexts_expires on business_contexts(expires_at);

alter table business_contexts enable row level security;

create policy "Users can read own business contexts"
  on business_contexts for select
  using (auth.uid() = profile_id);

create policy "Users can insert own business contexts"
  on business_contexts for insert
  with check (auth.uid() = profile_id);

create policy "Users can delete own business contexts"
  on business_contexts for delete
  using (auth.uid() = profile_id);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the Supabase MCP tool `apply_migration` with the SQL above. Verify the table is created in the linked project.

- [ ] **Step 3: Regenerate Supabase types**

Run: `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`

This picks up `business_contexts` and any brand-specific columns missing from the current types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260425000000_create_business_contexts.sql src/integrations/supabase/types.ts
git commit -m "feat: add business_contexts table with RLS + regenerate types"
```

---

## Task 3: Enhance donny-campaign-generate Edge Function

**Files:**
- Modify: `supabase/functions/donny-campaign-generate/index.ts`

The existing function accepts `{ source_url, page_content, text_brief, brief }` and returns a flat campaign object. We enhance it to also accept the new signature `{ source_url, source_type, photo_url, manual_text, role }` and return `{ business_context, campaign_ideas }`. Old callers still work.

- [ ] **Step 1: Read the existing edge function**

Read the full content of `supabase/functions/donny-campaign-generate/index.ts` to understand the current implementation.

- [ ] **Step 2: Add new input detection and routing**

At the top of the `serve()` handler, after parsing the request body, add detection for the new input format:

```typescript
const isNewFormat = 'source_type' in body;

if (isNewFormat) {
  // New "Donny-First" campaign creator flow
  const { source_url, source_type, photo_url, manual_text, role } = body;
  
  let pageContent = '';
  
  if (source_type === 'manual' && manual_text) {
    pageContent = manual_text;
  } else if (source_type === 'photo' && photo_url) {
    pageContent = `[Photo uploaded: ${photo_url}]`;
  } else if (source_url) {
    const extracted = await fetchAndExtract(source_url);
    pageContent = `Title: ${extracted.title}\nDescription: ${extracted.description}\nContent: ${extracted.body}`;
  }
  
  // Call OpenAI with enhanced prompt for 3 campaign ideas
  const ideasResponse = await generateCampaignIdeas(pageContent, source_type, role);
  
  return new Response(JSON.stringify(ideasResponse), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ... existing logic for old callers continues below unchanged
```

- [ ] **Step 3: Implement the `generateCampaignIdeas` function**

Add this function above the `serve()` handler:

```typescript
async function generateCampaignIdeas(
  pageContent: string,
  sourceType: string,
  role: string | null
): Promise<{ business_context: Record<string, unknown>; campaign_ideas: unknown[] }> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY not configured');

  const systemPrompt = `You are Donny, a creative AI assistant for DragonCandy — a marketplace connecting restaurants with content creators.

Given information about a business, you will:
1. Extract structured business context (name, location, cuisine, vibe, etc.)
2. Generate exactly 3 DIVERSE campaign ideas. Each idea must be a DIFFERENT campaign type.

Campaign types to choose from: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal.
Platforms: instagram, tiktok, facebook, youtube, google_business, multi_platform.
Content types: photo, video_reel, story, carousel, tiktok, youtube_short.
Aspect ratios: 9:16, 16:9, 1:1, 4:5.
Delivery tiers: dragondash (rush, 1-3 hours), express (24-48 hours), standard (5-7 days).

Respond ONLY with valid JSON matching this exact schema:
{
  "business_context": {
    "source_url": "<url or empty string>",
    "source_type": "<google_business|instagram|website|yelp|photo|manual>",
    "business_name": "<name>",
    "cuisine_type": "<type or null>",
    "location": { "city": "<city>", "state": "<state or null>", "country": "<country>" },
    "rating": <number or null>,
    "review_count": <number or null>,
    "price_range": "<$ or $$ or $$$ or $$$$ or null>",
    "photos": [],
    "vibe_tags": ["<tag1>", "<tag2>"],
    "review_highlights": ["<highlight1>"],
    "social_links": { "instagram": "<url or null>", "tiktok": "<url or null>", "website": "<url or null>" }
  },
  "campaign_ideas": [
    {
      "id": "<uuid>",
      "emoji": "<single emoji>",
      "title": "<short catchy title>",
      "description": "<one sentence>",
      "campaign_type": "<type>",
      "recommended_platforms": ["<platform>"],
      "deliverables": [
        {
          "description": "<what the creator makes>",
          "content_type": "<type>",
          "platform": "<platform>",
          "aspect_ratio": "<ratio>",
          "estimated_duration": <seconds or null>
        }
      ],
      "budget_range": { "min": <number>, "max": <number> },
      "timeline_days": <number>,
      "tier": "<dragondash|express|standard>",
      "tier_reasoning": "<one sentence why this tier>",
      "style_direction": "<visual style guidance>",
      "target_creator_persona": ["<persona>"],
      "key_messages": ["<message>"],
      "hashtags": ["<hashtag>"]
    }
  ]
}`;

  const userPrompt = `Source type: ${sourceType}
Role: ${role || 'anonymous'}

Business information:
${pageContent}

Generate 3 diverse campaign ideas based on this business.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}
```

- [ ] **Step 4: Verify backward compatibility**

The old code path (when `isNewFormat` is false) remains completely untouched. Existing callers that send `{ source_url, page_content, text_brief, brief }` hit the old logic. New callers that send `{ source_type, ... }` hit the new logic.

- [ ] **Step 5: Deploy the edge function**

Use the Supabase MCP tool `deploy_edge_function` with function name `donny-campaign-generate`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-campaign-generate/index.ts
git commit -m "feat: enhance donny-campaign-generate with multi-idea generation"
```

---

## Task 4: Draft Persistence Helpers

**Files:**
- Create: `src/lib/campaignCreatorDraft.ts`

- [ ] **Step 1: Create the localStorage draft module**

```typescript
// src/lib/campaignCreatorDraft.ts
import type { BusinessContext, CampaignIdea, EditableCampaign, BrandFields } from '@/types/campaignCreator';

const DRAFT_KEY = 'dragoncandy_campaign_draft';

export interface CampaignDraft {
  id: string;
  businessContext: BusinessContext | null;
  selectedIdeaId: string | null;
  campaignIdeas: CampaignIdea[] | null;
  editedCampaign: EditableCampaign | null;
  brandFields: BrandFields | null;
  updatedAt: string;
}

export function saveDraftToStorage(draft: CampaignDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraftFromStorage(): CampaignDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CampaignDraft;
  } catch {
    return null;
  }
}

export function clearDraftFromStorage(): void {
  localStorage.removeItem(DRAFT_KEY);
}

export function generateDraftId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/campaignCreatorDraft.ts
git commit -m "feat: add localStorage draft persistence for campaign creator"
```

---

## Task 5: useCampaignCreator Hook

**Files:**
- Create: `src/hooks/useCampaignCreator.ts`
- Reference: `src/integrations/supabase/client.ts`, `src/hooks/useAuth.ts`, `src/lib/campaignUtils.ts`

This is the core hook that replaces `useCampaignWizard`, `useBrandCampaignWizard`, and `useAnonymousCampaignWizard`.

- [ ] **Step 1: Create the hook with state and Screen 1 logic**

```typescript
// src/hooks/useCampaignCreator.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { mapDeliveryTierToDb } from '@/lib/campaignUtils';
import { donnyGenerateResponseSchema, launchValidationSchema } from '@/lib/campaignCreatorValidation';
import { saveDraftToStorage, loadDraftFromStorage, clearDraftFromStorage, generateDraftId } from '@/lib/campaignCreatorDraft';
import type {
  BusinessContext,
  CampaignIdea,
  EditableCampaign,
  BrandFields,
  DonnyGenerateRequest,
} from '@/types/campaignCreator';
import type { Deliverable } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';

type Screen = 'drop' | 'launchpad';

function ideaToEditableCampaign(idea: CampaignIdea): EditableCampaign {
  const deliverables: Deliverable[] = idea.deliverables.map((d, i) => ({
    id: crypto.randomUUID(),
    content_type: d.content_type,
    platform: d.platform,
    aspect_ratio: d.aspect_ratio,
    max_duration_seconds: d.estimated_duration,
    description: d.description,
  }));

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + idea.timeline_days);

  return {
    title: idea.title,
    description: idea.description,
    campaign_type: idea.campaign_type,
    platforms: [...idea.recommended_platforms],
    deliverables,
    budget_min: idea.budget_range.min,
    budget_max: idea.budget_range.max,
    deadline: deadline.toISOString().split('T')[0],
    delivery_type: mapDeliveryTierToDb(idea.tier) as EditableCampaign['delivery_type'],
    style_direction: idea.style_direction,
    target_creator_persona: [...idea.target_creator_persona],
    key_messages: [...idea.key_messages],
    hashtags: [...idea.hashtags],
    tier_reasoning: idea.tier_reasoning,
    emoji: idea.emoji,
    original_idea_id: idea.id,
  };
}

export function useCampaignCreator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Role
  const [userRole, setUserRole] = useState<'business_client' | 'brand' | null>(null);

  // Screen 1 state
  const [screen, setScreen] = useState<Screen>('drop');
  const [inputMode, setInputMode] = useState<'url' | 'photo' | 'text'>('url');
  const [inputValue, setInputValue] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [extractionMessages, setExtractionMessages] = useState<string[]>([]);

  // Screen 2 state
  const [campaignIdeas, setCampaignIdeas] = useState<CampaignIdea[] | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [editedCampaign, setEditedCampaign] = useState<EditableCampaign | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [brandFields, setBrandFields] = useState<BrandFields | null>(null);

  // Persistence
  const [draftId, setDraftId] = useState<string | null>(null);
  const isAuthenticated = !!user;

  // Detect role from auth
  useEffect(() => {
    if (!user) {
      setUserRole(null);
      return;
    }
    const fetchRole = async () => {
      const { data } = await supabase
        .from('business_profiles')
        .select('account_type')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.account_type === 'brand') {
        setUserRole('brand');
        setBrandFields({
          budget_pool: 0,
          per_creator_cap: 0,
          usage_rights_days: 180,
          exclusivity_days: 0,
          geographic_scope: 'city',
          target_creator_count: 3,
        });
      } else {
        setUserRole('business_client');
      }
    };
    fetchRole();
  }, [user]);

  // Restore draft on mount
  useEffect(() => {
    if (!isAuthenticated) {
      const draft = loadDraftFromStorage();
      if (draft) {
        setBusinessContext(draft.businessContext);
        setCampaignIdeas(draft.campaignIdeas);
        setSelectedIdeaId(draft.selectedIdeaId);
        setEditedCampaign(draft.editedCampaign);
        setBrandFields(draft.brandFields);
        setDraftId(draft.id);
        if (draft.campaignIdeas) setScreen('launchpad');
      }
    }
  }, [isAuthenticated]);

  // Auto-save debounce
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
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
    }, 30_000);
  }, [draftId, businessContext, selectedIdeaId, campaignIdeas, editedCampaign, brandFields]);

  // Screen 1: Submit input
  const submitInput = useCallback(async (value: string, mode: 'url' | 'photo' | 'text') => {
    setInputMode(mode);
    setInputValue(value);
    setIsExtracting(true);
    setExtractionMessages([]);

    const addMessage = (msg: string) => setExtractionMessages((prev) => [...prev, msg]);

    try {
      if (mode === 'url') addMessage("Checking out your business...");
      else if (mode === 'photo') addMessage("Analyzing your photo...");
      else addMessage("Got it, let me work with that...");

      const request: DonnyGenerateRequest = {
        source_type: mode === 'url' ? detectUrlType(value) : mode === 'photo' ? 'photo' : 'manual',
        role: userRole,
      };

      if (mode === 'url') request.source_url = value;
      else if (mode === 'photo') request.photo_url = value;
      else request.manual_text = value;

      const { data, error } = await supabase.functions.invoke('donny-campaign-generate', {
        body: request,
      });

      if (error) throw error;

      const parsed = donnyGenerateResponseSchema.parse(data);
      setBusinessContext(parsed.business_context);
      setCampaignIdeas(parsed.campaign_ideas);

      addMessage(`Found ${parsed.business_context.business_name} — looking good!`);

      // Cache business context for authenticated users
      if (user) {
        await supabase.from('business_contexts').insert({
          profile_id: user.id,
          source_url: parsed.business_context.source_url,
          source_type: parsed.business_context.source_type,
          extracted_data: parsed.business_context as unknown as Record<string, unknown>,
        });
      }

      setScreen('launchpad');
    } catch (err) {
      addMessage("I couldn't read that — want to try a different link, or just tell me about your business?");
      toast({ title: 'Extraction failed', description: String(err), variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  }, [userRole, user]);

  // Screen 2: Select idea
  const selectIdea = useCallback((ideaId: string) => {
    const idea = campaignIdeas?.find((i) => i.id === ideaId);
    if (!idea) return;
    setSelectedIdeaId(ideaId);
    setEditedCampaign(ideaToEditableCampaign(idea));
    setIsExpanded(true);
    triggerAutoSave();
  }, [campaignIdeas, triggerAutoSave]);

  // Screen 2: Regenerate
  const regenerateIdeas = useCallback(async () => {
    if (!businessContext) return;
    setIsExtracting(true);
    setSelectedIdeaId(null);
    setEditedCampaign(null);
    setIsExpanded(false);
    setExtractionMessages(["Let me think of something different..."]);

    try {
      const { data, error } = await supabase.functions.invoke('donny-campaign-generate', {
        body: {
          source_type: businessContext.source_type,
          source_url: businessContext.source_url || undefined,
          manual_text: businessContext.source_type === 'manual' ? inputValue : undefined,
          role: userRole,
        } satisfies DonnyGenerateRequest,
      });

      if (error) throw error;
      const parsed = donnyGenerateResponseSchema.parse(data);
      setCampaignIdeas(parsed.campaign_ideas);
      setExtractionMessages(["Here are 3 new ideas!"]);
    } catch (err) {
      toast({ title: 'Failed to regenerate', description: String(err), variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  }, [businessContext, inputValue, userRole]);

  // Screen 2: Update campaign field
  const updateField = useCallback(<K extends keyof EditableCampaign>(
    field: K,
    value: EditableCampaign[K]
  ) => {
    setEditedCampaign((prev) => prev ? { ...prev, [field]: value } : prev);
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Screen 2: Update brand field
  const updateBrandField = useCallback(<K extends keyof BrandFields>(
    field: K,
    value: BrandFields[K]
  ) => {
    setBrandFields((prev) => prev ? { ...prev, [field]: value } : prev);
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Launch campaign
  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!editedCampaign) throw new Error('No campaign to launch');
      if (!user) throw new Error('Must be authenticated to launch');

      const validated = launchValidationSchema.parse(editedCampaign);

      const insertData: Record<string, unknown> = {
        user_id: user.id,
        title: validated.title,
        description: validated.description,
        goals: editedCampaign.key_messages.join(', '),
        platforms: editedCampaign.platforms,
        budget_min: validated.budget_min,
        budget_max: validated.budget_max,
        deadline: validated.deadline,
        delivery_type: validated.delivery_type,
        delivery_fee: TIER_LIMITS[editedCampaign.delivery_type === 'dragonrush' ? 'dragondash' : editedCampaign.delivery_type === 'expedited' ? 'express' : 'standard']?.fee ?? 0,
        style: editedCampaign.style_direction,
        status: 'published',
        ai_analysis: businessContext,
      };

      if (userRole === 'brand' && brandFields) {
        Object.assign(insertData, {
          per_creator_cap: brandFields.per_creator_cap,
          usage_rights_days: brandFields.usage_rights_days,
          exclusivity_days: brandFields.exclusivity_days,
          geographic_scope: brandFields.geographic_scope,
          target_creator_personas: editedCampaign.target_creator_persona,
          tagline: brandFields.tagline,
        });
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      clearDraftFromStorage();
      toast({ title: 'Campaign launched!' });
      if (userRole === 'brand') {
        navigate(`/dashboard/brand/campaigns/${data.id}`);
      } else {
        navigate(`/dashboard/business/campaigns/${data.id}`);
      }
    },
    onError: (err) => {
      toast({ title: 'Launch failed', description: String(err), variant: 'destructive' });
    },
  });

  const launchCampaign = useCallback(async () => {
    await launchMutation.mutateAsync();
  }, [launchMutation]);

  const saveDraft = useCallback(async () => {
    if (!editedCampaign) return;
    if (user) {
      const { error } = await supabase.from('campaigns').insert({
        user_id: user.id,
        title: editedCampaign.title,
        description: editedCampaign.description,
        budget_min: editedCampaign.budget_min,
        budget_max: editedCampaign.budget_max,
        deadline: editedCampaign.deadline,
        delivery_type: editedCampaign.delivery_type,
        status: 'draft',
        ai_analysis: businessContext as unknown as Record<string, unknown>,
      } as any);
      if (error) throw error;
      toast({ title: 'Draft saved' });
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
      toast({ title: 'Draft saved locally' });
    }
  }, [editedCampaign, user, businessContext, draftId, selectedIdeaId, campaignIdeas, brandFields]);

  return {
    screen,
    inputMode,
    inputValue,
    isExtracting,
    businessContext,
    extractionMessages,
    campaignIdeas,
    selectedIdeaId,
    editedCampaign,
    isExpanded,
    userRole,
    brandFields,
    draftId,
    isAuthenticated,
    isLaunching: launchMutation.isPending,
    submitInput,
    selectIdea,
    regenerateIdeas,
    updateField,
    updateBrandField,
    launchCampaign,
    saveDraft,
  };
}

function detectUrlType(url: string): BusinessContext['source_type'] {
  if (url.includes('google.com/maps') || url.includes('goo.gl') || url.includes('business.google')) return 'google_business';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('yelp.com')) return 'yelp';
  return 'website';
}
```

- [ ] **Step 2: Verify the hook compiles**

Run: `npx tsc --noEmit src/hooks/useCampaignCreator.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignCreator.ts
git commit -m "feat: add useCampaignCreator unified hook"
```

---

## Task 6: Screen 1 Components — SmartInput, DonnyGreeting, ExtractionFeed, DropScreen

**Files:**
- Create: `src/components/campaign-creator/SmartInput.tsx`
- Create: `src/components/campaign-creator/DonnyGreeting.tsx`
- Create: `src/components/campaign-creator/ExtractionFeed.tsx`
- Create: `src/components/campaign-creator/DropScreen.tsx`

- [ ] **Step 1: Create SmartInput**

```typescript
// src/components/campaign-creator/SmartInput.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link, Image, PenLine } from 'lucide-react';

interface SmartInputProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
}

const PLACEHOLDERS = [
  'Paste your Google Business link...',
  'Paste your Instagram profile...',
  'Or just describe your business...',
];

export function SmartInput({ onSubmit, isExtracting }: SmartInputProps) {
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
      e.preventDefault();
      setValue(pasted);
      onSubmit(pasted, 'url');
    }
  }, [onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      const isUrl = value.startsWith('http://') || value.startsWith('https://');
      onSubmit(value.trim(), isUrl ? 'url' : 'text');
    }
  }, [value, onSubmit]);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For now, create a local object URL. In production, upload to Supabase storage first.
    const objectUrl = URL.createObjectURL(file);
    onSubmit(objectUrl, 'photo');
  }, [onSubmit]);

  return (
    <div className="w-full space-y-4">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDERS[placeholderIndex]}
        disabled={isExtracting}
        className="h-14 text-lg rounded-full px-6 bg-white border-teal-300 focus:border-teal-400 focus:ring-teal-400/20"
      />
      <div className="flex justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          disabled={isExtracting}
          onClick={() => {
            if (value.trim()) {
              const isUrl = value.startsWith('http://') || value.startsWith('https://');
              onSubmit(value.trim(), isUrl ? 'url' : 'text');
            }
          }}
        >
          <Link className="w-3 h-3 mr-1" /> Paste URL
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          disabled={isExtracting}
          onClick={() => fileInputRef.current?.click()}
        >
          <Image className="w-3 h-3 mr-1" /> Upload Photo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          disabled={isExtracting}
          onClick={() => {
            if (value.trim()) onSubmit(value.trim(), 'text');
          }}
        >
          <PenLine className="w-3 h-3 mr-1" /> Type it
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create DonnyGreeting**

```typescript
// src/components/campaign-creator/DonnyGreeting.tsx
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';

interface DonnyGreetingProps {
  isExtracting: boolean;
}

export function DonnyGreeting({ isExtracting }: DonnyGreetingProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <DonnyAvatar size="lg" state={isExtracting ? 'thinking' : 'idle'} glow={isExtracting} />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
          Create a Campaign
        </h1>
        <p className="text-sm text-gray-200 mt-2">
          Paste a link, drop a photo, or tell me about your business
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ExtractionFeed**

```typescript
// src/components/campaign-creator/ExtractionFeed.tsx
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';

interface ExtractionFeedProps {
  messages: string[];
  isExtracting: boolean;
}

export function ExtractionFeed({ messages, isExtracting }: ExtractionFeedProps) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3 mt-6">
      {messages.map((msg, i) => (
        <div key={i} className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <DonnyAvatar
            size="sm"
            state={i === messages.length - 1 && isExtracting ? 'thinking' : 'idle'}
          />
          <div className="bg-[#F9A8D4] rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%]">
            <p className="text-sm text-gray-900">{msg}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create DropScreen (Screen 1 layout)**

```typescript
// src/components/campaign-creator/DropScreen.tsx
import { SmartInput } from './SmartInput';
import { DonnyGreeting } from './DonnyGreeting';
import { ExtractionFeed } from './ExtractionFeed';

interface DropScreenProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  extractionMessages: string[];
}

export function DropScreen({ onSubmit, isExtracting, extractionMessages }: DropScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <DonnyGreeting isExtracting={isExtracting} />
      <div className="w-full max-w-md">
        <SmartInput onSubmit={onSubmit} isExtracting={isExtracting} />
        <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/campaign-creator/SmartInput.tsx src/components/campaign-creator/DonnyGreeting.tsx src/components/campaign-creator/ExtractionFeed.tsx src/components/campaign-creator/DropScreen.tsx
git commit -m "feat: add Screen 1 components — SmartInput, DonnyGreeting, ExtractionFeed, DropScreen"
```

---

## Task 7: EditableField Primitive

**Files:**
- Create: `src/components/campaign-creator/EditableField.tsx`

- [ ] **Step 1: Create EditableField**

```typescript
// src/components/campaign-creator/EditableField.tsx
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface EditableFieldProps {
  label: string;
  value: string;
  originalValue: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

export function EditableField({ label, value, originalValue, onChange, multiline = false }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isModified = value !== originalValue;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (!isEditing) {
    return (
      <div className="group cursor-pointer" onClick={() => setIsEditing(true)}>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
        <p className={`mt-1 text-sm ${isModified ? 'text-gray-900' : 'text-teal-600'}`}>
          {value || <span className="text-gray-400 italic">Click to edit</span>}
        </p>
      </div>
    );
  }

  const handleBlur = () => setIsEditing(false);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setIsEditing(false);
    if (e.key === 'Enter' && !multiline) setIsEditing(false);
  };

  const commonProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    className: 'text-sm',
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
        {isModified && (
          <button
            type="button"
            className="text-xs text-teal-500 hover:text-teal-700"
            onClick={() => { onChange(originalValue); setIsEditing(false); }}
          >
            Reset
          </button>
        )}
      </div>
      {multiline ? (
        <Textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={3} {...commonProps} />
      ) : (
        <Input ref={inputRef as React.RefObject<HTMLInputElement>} {...commonProps} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaign-creator/EditableField.tsx
git commit -m "feat: add EditableField tap-to-edit primitive"
```

---

## Task 8: Screen 2 Editor Field Components

**Files:**
- Create: `src/components/campaign-creator/PlatformChips.tsx`
- Create: `src/components/campaign-creator/DeliverablesList.tsx`
- Create: `src/components/campaign-creator/BudgetSlider.tsx`
- Create: `src/components/campaign-creator/TimelinePicker.tsx`
- Create: `src/components/campaign-creator/TierBadge.tsx`
- Create: `src/components/campaign-creator/BrandFieldsPanel.tsx`

- [ ] **Step 1: Create PlatformChips**

```typescript
// src/components/campaign-creator/PlatformChips.tsx
import type { Platform } from '@/types/campaignMedia';
import { cn } from '@/lib/utils';

interface PlatformChipsProps {
  selected: Platform[];
  onChange: (platforms: Platform[]) => void;
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google_business', label: 'Google' },
];

export function PlatformChips({ selected, onChange }: PlatformChipsProps) {
  const toggle = (platform: Platform) => {
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {PLATFORMS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              selected.includes(value)
                ? 'bg-teal-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DeliverablesList**

```typescript
// src/components/campaign-creator/DeliverablesList.tsx
import type { Deliverable } from '@/types/campaignMedia';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface DeliverablesListProps {
  deliverables: Deliverable[];
  onChange: (deliverables: Deliverable[]) => void;
}

function formatDeliverable(d: Deliverable): string {
  const typeLabels: Record<string, string> = {
    photo: 'Photo', video_reel: 'Reel', story: 'Story',
    carousel: 'Carousel', tiktok: 'TikTok', youtube_short: 'YT Short',
  };
  const platformLabels: Record<string, string> = {
    instagram: 'IG', tiktok: 'TT', facebook: 'FB',
    youtube: 'YT', google_business: 'Google', multi_platform: 'Multi',
  };
  return `${typeLabels[d.content_type] || d.content_type} · ${platformLabels[d.platform] || d.platform} · ${d.aspect_ratio}`;
}

export function DeliverablesList({ deliverables, onChange }: DeliverablesListProps) {
  const remove = (id: string) => onChange(deliverables.filter((d) => d.id !== id));

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deliverables</label>
      <div className="mt-2 space-y-2">
        {deliverables.map((d) => (
          <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">{formatDeliverable(d)}</p>
              {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
            </div>
            <button type="button" onClick={() => remove(d.id)} className="text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create BudgetSlider**

```typescript
// src/components/campaign-creator/BudgetSlider.tsx
import { Input } from '@/components/ui/input';

interface BudgetSliderProps {
  min: number;
  max: number;
  onChangeMin: (val: number) => void;
  onChangeMax: (val: number) => void;
}

export function BudgetSlider({ min, max, onChangeMin, onChangeMax }: BudgetSliderProps) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Budget Range</label>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">$</span>
          <Input
            type="number"
            value={min}
            onChange={(e) => onChangeMin(Number(e.target.value))}
            className="w-24 text-sm"
          />
        </div>
        <span className="text-gray-400">—</span>
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">$</span>
          <Input
            type="number"
            value={max}
            onChange={(e) => onChangeMax(Number(e.target.value))}
            className="w-24 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create TimelinePicker**

```typescript
// src/components/campaign-creator/TimelinePicker.tsx
import { Input } from '@/components/ui/input';

interface TimelinePickerProps {
  deadline: string;
  onChange: (deadline: string) => void;
}

export function TimelinePicker({ deadline, onChange }: TimelinePickerProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deadline</label>
      <Input
        type="date"
        value={deadline}
        min={today}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 text-sm w-48"
      />
    </div>
  );
}
```

- [ ] **Step 5: Create TierBadge**

```typescript
// src/components/campaign-creator/TierBadge.tsx
import { useState } from 'react';
import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryTierToDb, mapDeliveryType } from '@/lib/campaignUtils';
import { cn } from '@/lib/utils';

interface TierBadgeProps {
  deliveryType: 'standard' | 'expedited' | 'dragonrush';
  tierReasoning: string;
  onChange: (deliveryType: 'standard' | 'expedited' | 'dragonrush') => void;
}

const TIER_OPTIONS: { dbValue: 'standard' | 'expedited' | 'dragonrush'; tier: DeliveryTier }[] = [
  { dbValue: 'dragonrush', tier: 'dragondash' },
  { dbValue: 'expedited', tier: 'express' },
  { dbValue: 'standard', tier: 'standard' },
];

export function TierBadge({ deliveryType, tierReasoning, onChange }: TierBadgeProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const currentTier = mapDeliveryType(deliveryType);
  const config = currentTier ? TIER_LIMITS[currentTier] : null;

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Tier</label>
      <div className="mt-2 flex items-center gap-3">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
          deliveryType === 'dragonrush' ? 'bg-teal-100 text-teal-800' :
          deliveryType === 'expedited' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        )}>
          {deliveryType === 'dragonrush' && '⚡'}
          {config?.label || 'Standard'} · {config?.timeframe}
          {config?.fee ? ` · +$${config.fee}` : ''}
        </span>
        <button
          type="button"
          className="text-xs text-teal-500 hover:text-teal-700"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          Change
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1 italic">{tierReasoning}</p>
      {showDropdown && (
        <div className="mt-2 space-y-1">
          {TIER_OPTIONS.map(({ dbValue, tier }) => (
            <button
              key={dbValue}
              type="button"
              onClick={() => { onChange(dbValue); setShowDropdown(false); }}
              className={cn(
                'w-full text-left rounded-lg px-3 py-2 text-sm',
                deliveryType === dbValue ? 'bg-teal-50 text-teal-800' : 'hover:bg-gray-50'
              )}
            >
              {TIER_LIMITS[tier].label} — {TIER_LIMITS[tier].timeframe}
              {TIER_LIMITS[tier].fee > 0 && ` (+$${TIER_LIMITS[tier].fee})`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create BrandFieldsPanel**

```typescript
// src/components/campaign-creator/BrandFieldsPanel.tsx
import type { BrandFields } from '@/types/campaignCreator';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface BrandFieldsPanelProps {
  fields: BrandFields;
  onChange: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void;
}

const GEO_OPTIONS: { value: BrandFields['geographic_scope']; label: string }[] = [
  { value: 'city', label: 'City' },
  { value: 'region', label: 'Region' },
  { value: 'national', label: 'National' },
];

export function BrandFieldsPanel({ fields, onChange }: BrandFieldsPanelProps) {
  return (
    <div className="border-t border-gray-200 pt-4 mt-4 space-y-4">
      <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider">Brand Settings</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500">Budget Pool</label>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-gray-500">$</span>
            <Input type="number" value={fields.budget_pool} onChange={(e) => onChange('budget_pool', Number(e.target.value))} className="text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Per-Creator Cap</label>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-gray-500">$</span>
            <Input type="number" value={fields.per_creator_cap} onChange={(e) => onChange('per_creator_cap', Number(e.target.value))} className="text-sm" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500">Geographic Scope</label>
        <div className="flex gap-2 mt-2">
          {GEO_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange('geographic_scope', value)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                fields.geographic_scope === value ? 'bg-teal-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500">Usage Rights (days)</label>
          <Input type="number" value={fields.usage_rights_days} onChange={(e) => onChange('usage_rights_days', Number(e.target.value))} className="mt-1 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Exclusivity (days)</label>
          <Input type="number" value={fields.exclusivity_days} onChange={(e) => onChange('exclusivity_days', Number(e.target.value))} className="mt-1 text-sm" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/campaign-creator/PlatformChips.tsx src/components/campaign-creator/DeliverablesList.tsx src/components/campaign-creator/BudgetSlider.tsx src/components/campaign-creator/TimelinePicker.tsx src/components/campaign-creator/TierBadge.tsx src/components/campaign-creator/BrandFieldsPanel.tsx
git commit -m "feat: add editor field components — PlatformChips, DeliverablesList, BudgetSlider, TimelinePicker, TierBadge, BrandFieldsPanel"
```

---

## Task 9: IdeaCard, IdeaCarousel, RegenerateButton

**Files:**
- Create: `src/components/campaign-creator/IdeaCard.tsx`
- Create: `src/components/campaign-creator/IdeaCarousel.tsx`
- Create: `src/components/campaign-creator/RegenerateButton.tsx`

- [ ] **Step 1: Create IdeaCard**

```typescript
// src/components/campaign-creator/IdeaCard.tsx
import type { CampaignIdea } from '@/types/campaignCreator';
import { cn } from '@/lib/utils';

interface IdeaCardProps {
  idea: CampaignIdea;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG', tiktok: 'TT', facebook: 'FB', youtube: 'YT', google_business: 'Google', multi_platform: 'Multi',
};

export function IdeaCard({ idea, isSelected, onSelect }: IdeaCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(idea.id)}
      className={cn(
        'w-full text-left bg-white rounded-2xl p-4 shadow-sm transition-all',
        isSelected
          ? 'border-2 border-teal-400 ring-2 ring-teal-400/20'
          : 'border border-teal-300 hover:border-teal-400'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-2xl">{idea.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{idea.title}</h3>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{idea.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
          ${idea.budget_range.min}–${idea.budget_range.max}
        </span>
        <span className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
          {idea.timeline_days} days
        </span>
        {idea.recommended_platforms.map((p) => (
          <span key={p} className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
            {PLATFORM_LABELS[p] || p}
          </span>
        ))}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create IdeaCarousel**

```typescript
// src/components/campaign-creator/IdeaCarousel.tsx
import type { CampaignIdea } from '@/types/campaignCreator';
import { IdeaCard } from './IdeaCard';
import { useIsMobile } from '@/hooks/use-mobile';

interface IdeaCarouselProps {
  ideas: CampaignIdea[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function IdeaCarousel({ ideas, selectedId, onSelect }: IdeaCarouselProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4">
        {ideas.map((idea) => (
          <div key={idea.id} className="snap-center flex-shrink-0 w-[85vw]">
            <IdeaCard idea={idea} isSelected={selectedId === idea.id} onSelect={onSelect} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ideas.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} isSelected={selectedId === idea.id} onSelect={onSelect} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create RegenerateButton**

```typescript
// src/components/campaign-creator/RegenerateButton.tsx
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RegenerateButtonProps {
  onRegenerate: () => void;
  isLoading: boolean;
}

export function RegenerateButton({ onRegenerate, isLoading }: RegenerateButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onRegenerate}
      disabled={isLoading}
      className="text-teal-600 hover:text-teal-700 hover:bg-teal-50"
    >
      <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Regenerating...' : 'Show different ideas'}
    </Button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-creator/IdeaCard.tsx src/components/campaign-creator/IdeaCarousel.tsx src/components/campaign-creator/RegenerateButton.tsx
git commit -m "feat: add IdeaCard, IdeaCarousel, and RegenerateButton"
```

---

## Task 10: CampaignEditor, LaunchButton, CampaignPreviewCard

**Files:**
- Create: `src/components/campaign-creator/CampaignEditor.tsx`
- Create: `src/components/campaign-creator/LaunchButton.tsx`
- Create: `src/components/campaign-creator/CampaignPreviewCard.tsx`

- [ ] **Step 1: Create CampaignEditor**

```typescript
// src/components/campaign-creator/CampaignEditor.tsx
import type { EditableCampaign, BrandFields, CampaignIdea } from '@/types/campaignCreator';
import { EditableField } from './EditableField';
import { PlatformChips } from './PlatformChips';
import { DeliverablesList } from './DeliverablesList';
import { BudgetSlider } from './BudgetSlider';
import { TimelinePicker } from './TimelinePicker';
import { TierBadge } from './TierBadge';
import { BrandFieldsPanel } from './BrandFieldsPanel';
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

export function CampaignEditor({
  campaign,
  originalIdea,
  brandFields,
  userRole,
  updateField,
  updateBrandField,
}: CampaignEditorProps) {
  const currentTier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = currentTier ? TIER_LIMITS[currentTier] : TIER_LIMITS.standard;

  return (
    <div className="bg-white rounded-2xl border border-teal-300 p-5 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
      <EditableField
        label="Title"
        value={campaign.title}
        originalValue={originalIdea.title}
        onChange={(v) => updateField('title', v)}
      />
      <EditableField
        label="Description"
        value={campaign.description}
        originalValue={originalIdea.description}
        onChange={(v) => updateField('description', v)}
        multiline
      />
      <PlatformChips
        selected={campaign.platforms}
        onChange={(v) => updateField('platforms', v)}
      />
      <DeliverablesList
        deliverables={campaign.deliverables}
        onChange={(v) => updateField('deliverables', v)}
      />
      <BudgetSlider
        min={campaign.budget_min}
        max={campaign.budget_max}
        onChangeMin={(v) => updateField('budget_min', v)}
        onChangeMax={(v) => updateField('budget_max', v)}
      />
      <TimelinePicker
        deadline={campaign.deadline}
        onChange={(v) => updateField('deadline', v)}
      />
      <TierBadge
        deliveryType={campaign.delivery_type}
        tierReasoning={campaign.tier_reasoning}
        onChange={(v) => updateField('delivery_type', v)}
      />
      <CostBreakdown
        deliverableCount={campaign.deliverables.length}
        budgetTotal={campaign.budget_max + tierConfig.fee}
        baseCostPerDeliverable={campaign.deliverables.length > 0 ? campaign.budget_max / campaign.deliverables.length : 0}
        premiumAmount={tierConfig.fee}
        deliveryType={tierConfig.label}
      />
      {userRole === 'brand' && brandFields && (
        <BrandFieldsPanel fields={brandFields} onChange={updateBrandField} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create LaunchButton**

```typescript
// src/components/campaign-creator/LaunchButton.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Rocket } from 'lucide-react';

interface LaunchButtonProps {
  onLaunch: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  isAuthenticated: boolean;
  isLaunching: boolean;
  onAuthRequired: () => void;
}

export function LaunchButton({ onLaunch, onSaveDraft, isAuthenticated, isLaunching, onAuthRequired }: LaunchButtonProps) {
  const handleLaunch = async () => {
    if (!isAuthenticated) {
      onAuthRequired();
      return;
    }
    await onLaunch();
  };

  return (
    <div className="space-y-3 pt-4">
      <Button
        onClick={handleLaunch}
        disabled={isLaunching}
        className="w-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full py-6 text-white font-bold text-lg hover:from-teal-500 hover:to-emerald-500"
      >
        <Rocket className="w-5 h-5 mr-2" />
        {isLaunching ? 'Launching...' : 'Launch Campaign'}
      </Button>
      <Button
        variant="outline"
        onClick={onSaveDraft}
        className="w-full rounded-full"
      >
        Save as Draft
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create CampaignPreviewCard**

```typescript
// src/components/campaign-creator/CampaignPreviewCard.tsx
import type { EditableCampaign } from '@/types/campaignCreator';
import { mapDeliveryType } from '@/lib/campaignUtils';
import { TIER_LIMITS } from '@/types/campaignMedia';

interface CampaignPreviewCardProps {
  campaign: EditableCampaign;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube',
  google_business: 'Google Business', multi_platform: 'Multi-Platform',
};

export function CampaignPreviewCard({ campaign }: CampaignPreviewCardProps) {
  const tier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = tier ? TIER_LIMITS[tier] : null;

  return (
    <div className="sticky top-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
        What creators will see
      </p>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="h-32 bg-gradient-to-br from-teal-400 to-emerald-400 flex items-center justify-center">
          <span className="text-5xl">{campaign.emoji}</span>
        </div>
        <div className="p-4 space-y-3">
          <h3 className="font-bold text-lg text-gray-900">{campaign.title || 'Untitled Campaign'}</h3>
          <p className="text-sm text-gray-600 line-clamp-3">{campaign.description || 'No description yet'}</p>
          <div className="flex flex-wrap gap-2">
            <span className="bg-teal-50 text-teal-700 rounded-full px-2 py-1 text-xs font-medium">
              ${campaign.budget_min}–${campaign.budget_max}
            </span>
            {tierConfig && (
              <span className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
                {tierConfig.label} · {tierConfig.timeframe}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {campaign.platforms.map((p) => (
              <span key={p} className="text-xs text-gray-500">{PLATFORM_LABELS[p] || p}</span>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {campaign.deliverables.length} deliverable{campaign.deliverables.length !== 1 ? 's' : ''} · Due {campaign.deadline || 'TBD'}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-creator/CampaignEditor.tsx src/components/campaign-creator/LaunchButton.tsx src/components/campaign-creator/CampaignPreviewCard.tsx
git commit -m "feat: add CampaignEditor, LaunchButton, and CampaignPreviewCard"
```

---

## Task 11: Screen Layouts and CampaignCreator Page

**Files:**
- Create: `src/components/campaign-creator/LaunchpadScreen.tsx`
- Create: `src/pages/CampaignCreator.tsx`

- [ ] **Step 1: Create LaunchpadScreen**

```typescript
// src/components/campaign-creator/LaunchpadScreen.tsx
import type { CampaignIdea, EditableCampaign, BrandFields } from '@/types/campaignCreator';
import { IdeaCarousel } from './IdeaCarousel';
import { RegenerateButton } from './RegenerateButton';
import { CampaignEditor } from './CampaignEditor';
import { LaunchButton } from './LaunchButton';
import { ExtractionFeed } from './ExtractionFeed';

interface LaunchpadScreenProps {
  ideas: CampaignIdea[];
  selectedIdeaId: string | null;
  editedCampaign: EditableCampaign | null;
  brandFields: BrandFields | null;
  userRole: 'business_client' | 'brand' | null;
  isExtracting: boolean;
  extractionMessages: string[];
  isAuthenticated: boolean;
  isLaunching: boolean;
  onSelectIdea: (id: string) => void;
  onRegenerate: () => void;
  updateField: <K extends keyof EditableCampaign>(field: K, value: EditableCampaign[K]) => void;
  updateBrandField: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void;
  onLaunch: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onAuthRequired: () => void;
}

export function LaunchpadScreen({
  ideas,
  selectedIdeaId,
  editedCampaign,
  brandFields,
  userRole,
  isExtracting,
  extractionMessages,
  isAuthenticated,
  isLaunching,
  onSelectIdea,
  onRegenerate,
  updateField,
  updateBrandField,
  onLaunch,
  onSaveDraft,
  onAuthRequired,
}: LaunchpadScreenProps) {
  const selectedIdea = ideas.find((i) => i.id === selectedIdeaId);

  return (
    <div className="space-y-4 px-4 pb-8">
      <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      <IdeaCarousel ideas={ideas} selectedId={selectedIdeaId} onSelect={onSelectIdea} />
      <div className="flex justify-center">
        <RegenerateButton onRegenerate={onRegenerate} isLoading={isExtracting} />
      </div>
      {editedCampaign && selectedIdea && (
        <>
          <CampaignEditor
            campaign={editedCampaign}
            originalIdea={selectedIdea}
            brandFields={brandFields}
            userRole={userRole}
            updateField={updateField}
            updateBrandField={updateBrandField}
          />
          <LaunchButton
            onLaunch={onLaunch}
            onSaveDraft={onSaveDraft}
            isAuthenticated={isAuthenticated}
            isLaunching={isLaunching}
            onAuthRequired={onAuthRequired}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create CampaignCreator page**

```typescript
// src/pages/CampaignCreator.tsx
import { useState } from 'react';
import { useCampaignCreator } from '@/hooks/useCampaignCreator';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropScreen } from '@/components/campaign-creator/DropScreen';
import { LaunchpadScreen } from '@/components/campaign-creator/LaunchpadScreen';
import { CampaignPreviewCard } from '@/components/campaign-creator/CampaignPreviewCard';
import { AuthenticationModal } from '@/components/AuthenticationModal';

export default function CampaignCreator() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isMobile = useIsMobile();
  const {
    screen,
    isExtracting,
    extractionMessages,
    campaignIdeas,
    selectedIdeaId,
    editedCampaign,
    brandFields,
    userRole,
    isAuthenticated,
    isLaunching,
    submitInput,
    selectIdea,
    regenerateIdeas,
    updateField,
    updateBrandField,
    launchCampaign,
    saveDraft,
  } = useCampaignCreator();

  if (screen === 'drop') {
    return (
      <div className="min-h-screen bg-[#A8A8A0]">
        <DropScreen
          onSubmit={submitInput}
          isExtracting={isExtracting}
          extractionMessages={extractionMessages}
        />
      </div>
    );
  }

  // Screen 2: Launchpad
  if (isMobile || !editedCampaign) {
    return (
      <div className="min-h-screen bg-[#A8A8A0] pt-4">
        <LaunchpadScreen
          ideas={campaignIdeas || []}
          selectedIdeaId={selectedIdeaId}
          editedCampaign={editedCampaign}
          brandFields={brandFields}
          userRole={userRole}
          isExtracting={isExtracting}
          extractionMessages={extractionMessages}
          isAuthenticated={isAuthenticated}
          isLaunching={isLaunching}
          onSelectIdea={selectIdea}
          onRegenerate={regenerateIdeas}
          updateField={updateField}
          updateBrandField={updateBrandField}
          onLaunch={launchCampaign}
          onSaveDraft={saveDraft}
          onAuthRequired={() => setShowAuthModal(true)}
        />
        {showAuthModal && (
          <AuthenticationModal onClose={() => setShowAuthModal(false)} />
        )}
      </div>
    );
  }

  // Desktop split view
  return (
    <div className="min-h-screen bg-[#A8A8A0]">
      <div className="flex gap-6 max-w-6xl mx-auto pt-6 px-6">
        <div className="flex-1 min-w-0">
          <LaunchpadScreen
            ideas={campaignIdeas || []}
            selectedIdeaId={selectedIdeaId}
            editedCampaign={editedCampaign}
            brandFields={brandFields}
            userRole={userRole}
            isExtracting={isExtracting}
            extractionMessages={extractionMessages}
            isAuthenticated={isAuthenticated}
            isLaunching={isLaunching}
            onSelectIdea={selectIdea}
            onRegenerate={regenerateIdeas}
            updateField={updateField}
            updateBrandField={updateBrandField}
            onLaunch={launchCampaign}
            onSaveDraft={saveDraft}
            onAuthRequired={() => setShowAuthModal(true)}
          />
        </div>
        <div className="w-80 flex-shrink-0 hidden md:block">
          <CampaignPreviewCard campaign={editedCampaign} />
        </div>
      </div>
      {showAuthModal && (
        <AuthenticationModal onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-creator/LaunchpadScreen.tsx src/pages/CampaignCreator.tsx
git commit -m "feat: add LaunchpadScreen layout and CampaignCreator page with responsive split view"
```

---

## Task 12: Route Swap in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read App.tsx to find exact import lines and route registrations**

Read `src/App.tsx` and locate the imports for `CampaignWizard`, `BrandCreateCampaign`, and `AnonymousCampaignWizard`, plus their route registrations.

- [ ] **Step 2: Add import for CampaignCreator**

At the top of App.tsx with the other lazy imports, add:

```typescript
import CampaignCreator from '@/pages/CampaignCreator';
```

- [ ] **Step 3: Replace the business campaign creation route**

Find the route:
```typescript
<Route path="/dashboard/business/campaigns/create" element={
  <ProtectedRoute><BusinessRoute><CampaignWizard /></BusinessRoute></ProtectedRoute>
} />
```

Replace `<CampaignWizard />` with `<CampaignCreator />`.

- [ ] **Step 4: Replace the brand campaign creation route**

Find the route:
```typescript
<Route path="/dashboard/brand/campaigns/create" element={
  <ProtectedRoute><BrandRoute><BrandCreateCampaign /></BrandRoute></ProtectedRoute>
} />
```

Replace `<BrandCreateCampaign />` with `<CampaignCreator />`.

- [ ] **Step 5: Replace the anonymous campaign creation route**

Find the route:
```typescript
<Route path="/campaign/create" element={<AnonymousCampaignWizard />} />
```

Replace `<AnonymousCampaignWizard />` with `<CampaignCreator />`.

- [ ] **Step 6: Verify the app compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: swap campaign creation routes to unified CampaignCreator"
```

---

## Task 13: Manual Integration Test

**Files:** None (testing)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test anonymous flow**

1. Navigate to `http://localhost:5173/campaign/create`
2. Verify Screen 1 loads: Donny greeting, SmartInput with cycling placeholder, action chips
3. Type "ramen restaurant in Austin" and press Enter
4. Verify extraction messages appear, then Screen 2 loads with 3 idea cards
5. Tap an idea card — verify it expands with CampaignEditor showing all pre-filled fields
6. Edit the title — verify it changes to non-teal color, "Reset" link appears
7. Click "Launch Campaign" — verify auth modal appears (anonymous user)

- [ ] **Step 3: Test authenticated business flow**

1. Log in as a business user
2. Navigate to campaign creation via sidebar
3. Verify same 2-screen flow works
4. Complete flow through to launch (verify campaign appears in campaigns list)

- [ ] **Step 4: Test desktop split view**

1. Widen browser to >768px
2. Verify desktop shows left panel (Donny flow) + right panel (live preview)
3. Edit fields on the left — verify right panel preview updates in real-time

- [ ] **Step 5: Test mobile swipe**

1. Narrow browser to <768px (or use mobile device mode)
2. Verify idea cards are horizontally swipeable with snap behavior
3. Verify single-column layout, no split view

- [ ] **Step 6: Test Regenerate**

1. After ideas load, click "Show different ideas"
2. Verify loading state, then new 3 ideas replace old ones
3. Verify any previously selected idea and editor are cleared

---

## Task 14: Bug Fixes (included with this work)

**Files:**
- Modify: `src/components/campaigns/CampaignApplyForm.tsx` (hard-coded URL)
- Modify: `src/hooks/useAnonymousCampaignWizard.ts` (console.log cleanup)

- [ ] **Step 1: Fix hard-coded SUPABASE_URL in CampaignApplyForm**

Read `src/components/campaigns/CampaignApplyForm.tsx` and find the hard-coded URL. Replace with:

```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
```

- [ ] **Step 2: Remove debug console.log from useAnonymousCampaignWizard**

Read `src/hooks/useAnonymousCampaignWizard.ts` and remove any `console.log` statements that dump campaign data.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignApplyForm.tsx src/hooks/useAnonymousCampaignWizard.ts
git commit -m "fix: remove hard-coded URL and debug logging from campaign code"
```

---

## Summary

| Task | What It Builds | Files |
|------|---------------|-------|
| 1 | Types + Zod schemas | 2 new |
| 2 | Database migration + type regen | 1 migration + 1 modified |
| 3 | Edge function enhancement | 1 modified |
| 4 | Draft persistence helpers | 1 new |
| 5 | useCampaignCreator hook | 1 new |
| 6 | Screen 1 components | 4 new |
| 7 | EditableField primitive | 1 new |
| 8 | Editor field components | 6 new |
| 9 | Idea cards + carousel | 3 new |
| 10 | Editor + launch + preview | 3 new |
| 11 | Screen layouts + page | 2 new |
| 12 | Route swap | 1 modified |
| 13 | Manual integration test | 0 |
| 14 | Bug fixes | 2 modified |

**Total: 23 new files, 4 modified files, 14 tasks, ~50 steps.**
