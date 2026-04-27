# Section 2: Campaign Detail Rebuild + One-Tap Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Creator's Campaign Detail view with full brief data and replace the multi-field application form with a one-tap "Apply with Donny" flow.

**Architecture:** Enhance existing `CreatorCampaignDetails.tsx` orchestrator with 8 new section components and an enhanced hero. Replace the current apply dialog with a bottom sheet (`Sheet` from shadcn) that calls a new `donny-apply-pitch` Supabase Edge Function (Claude API + template fallback), then submits via the existing `useCreateApplication` hook.

**Tech Stack:** React + TypeScript, Tailwind CSS, Supabase (Postgres + Edge Functions), Anthropic Claude API (Sonnet 4), React Query, shadcn/ui Sheet component.

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260426120000_create_donny_events.sql` | donny_events table + RLS |
| `supabase/functions/donny-apply-pitch/index.ts` | Edge function: Claude pitch generation + fallback |
| `src/components/campaign-details/CampaignMetricsBar.tsx` | Budget, deliverable count, tier badge, match score |
| `src/components/campaign-details/CampaignBriefSection.tsx` | Full description, goals, tone, audience |
| `src/components/campaign-details/CampaignReferencesGallery.tsx` | Horizontal scroll of reference media with lightbox |
| `src/components/campaign-details/CampaignFootageSection.tsx` | Conditional raw footage section |
| `src/components/campaign-details/CampaignDeliverablesBreakdown.tsx` | Numbered deliverables list |
| `src/components/campaign-details/CampaignTimeline.tsx` | Delivery tier + deadline countdown |
| `src/components/campaign-details/CampaignBudgetDetail.tsx` | Budget breakdown + payment footnote |
| `src/components/campaign-details/BusinessProfileStrip.tsx` | Business name, rating, completed campaigns |
| `src/components/campaign-details/StickyApplyCTA.tsx` | Fixed bottom "Apply with Donny" button |
| `src/components/campaigns/OneTapApplySheet.tsx` | Bottom sheet: Donny pitch review + send/edit |
| `src/components/campaigns/ApplyConfirmation.tsx` | Full-screen success overlay with animation |
| `src/hooks/useDonnyApplyPitch.ts` | Hook calling donny-apply-pitch edge function |
| `src/hooks/useCampaignDetailEnriched.ts` | Enhanced hook: media + deliverables + match score + business profile + app count |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/campaign-details/CampaignHero.tsx` | Add cover image, business name, distance, posted time, applicant count |
| `src/components/campaign-details/CreatorCampaignDetails.tsx` | Replace body with new section components |
| `src/pages/CampaignDetailsPage.tsx` | Remove old apply dialog, wire StickyApplyCTA + OneTapApplySheet + ApplyConfirmation |

---

## Task 1: Create `donny_events` migration

**Files:**
- Create: `supabase/migrations/20260426120000_create_donny_events.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260426120000_create_donny_events.sql

CREATE TABLE IF NOT EXISTS donny_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  campaign_id uuid REFERENCES campaigns(id),
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE donny_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own events"
  ON donny_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON donny_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_donny_events_user ON donny_events(user_id);
CREATE INDEX idx_donny_events_campaign ON donny_events(campaign_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260426120000_create_donny_events.sql
git commit -m "migration: create donny_events table with RLS"
```

---

## Task 2: Create `donny-apply-pitch` edge function

**Files:**
- Create: `supabase/functions/donny-apply-pitch/index.ts`

This follows the same Deno serve pattern as existing functions (`donny-creator-match`, `donny-chat`). Uses Anthropic API directly (not OpenAI). Has a 5-second AbortController timeout with template fallback.

- [ ] **Step 1: Write the edge function**

```typescript
// supabase/functions/donny-apply-pitch/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

interface PitchResult {
  pitch: string;
  suggested_rate: number;
  suggested_portfolio_piece_url: string | null;
  pitch_source: "claude" | "template";
}

function buildTemplatePitch(
  creatorName: string,
  skills: string[] | null,
  rating: number | null
): string {
  const skill = skills?.length ? skills[0] : "content";
  const ratingStr = rating ? `${rating.toFixed(1)}-star` : "top";
  return `${creatorName} — ${skill} specialist with ${ratingStr} rating, ready to deliver.`;
}

function clampRate(
  creatorRate: number | null,
  budgetMin: number | null,
  budgetMax: number | null
): number {
  const base = creatorRate ?? budgetMin ?? 100;
  const min = budgetMin ?? 0;
  const max = budgetMax ?? Infinity;
  return Math.max(min, Math.min(max, base));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (!user || authError) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { creator_id, campaign_id } = await req.json();
    if (!creator_id || !campaign_id) {
      return new Response(
        JSON.stringify({ error: "creator_id and campaign_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch creator profile
    const { data: creator } = await supabaseAdmin
      .from("creator_profiles")
      .select(
        "creator_name, base_rate_per_hour, portfolio_urls, skills, average_rating"
      )
      .eq("user_id", creator_id)
      .single();

    // Fetch campaign
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("title, description, goals, budget_min, budget_max")
      .eq("id", campaign_id)
      .single();

    // Fetch campaign deliverables for content types
    const { data: deliverables } = await supabaseAdmin
      .from("campaign_deliverables")
      .select("content_type")
      .eq("campaign_id", campaign_id)
      .limit(5);

    if (!creator || !campaign) {
      return new Response(
        JSON.stringify({ error: "Creator or campaign not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch last 3 successful deliveries by this creator
    const { data: pastWork } = await supabaseAdmin
      .from("campaign_collaborations")
      .select("campaign_id, campaigns(title)")
      .eq("creator_id", creator_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(3);

    const suggestedRate = clampRate(
      creator.base_rate_per_hour,
      campaign.budget_min,
      campaign.budget_max
    );

    const portfolioUrls: string[] = creator.portfolio_urls || [];
    const suggestedPortfolio = portfolioUrls[0] || null;

    // Attempt Claude pitch generation with 5-second timeout
    let pitch: string;
    let pitchSource: "claude" | "template" = "template";

    if (ANTHROPIC_API_KEY) {
      const contentTypes =
        deliverables?.map((d: { content_type: string }) => d.content_type).join(", ") || "content";
      const pastTitles =
        pastWork
          ?.map((p: { campaigns: { title: string } | null }) => p.campaigns?.title)
          .filter(Boolean)
          .join(", ") || "none yet";

      const systemPrompt =
        "You are Donny. Write a 1-sentence pitch (max 25 words) from this creator to this business explaining why they're a great fit. Plain text only. No emoji. No greeting. No signoff.";
      const userPrompt = `Creator: ${creator.creator_name}, skills: ${(creator.skills || []).join(", ") || "general"}, rating: ${creator.average_rating ?? "N/A"}, past campaigns: ${pastTitles}.
Campaign: "${campaign.title}" — ${campaign.description || "No description"}. Goals: ${campaign.goals || "N/A"}. Content needed: ${contentTypes}. Budget: $${campaign.budget_min ?? "?"}–$${campaign.budget_max ?? "?"}.`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const text = data.content?.[0]?.text?.trim();
          if (text && text.length > 0 && text.length <= 200) {
            pitch = text;
            pitchSource = "claude";
          } else {
            pitch = buildTemplatePitch(
              creator.creator_name,
              creator.skills,
              creator.average_rating
            );
          }
        } else {
          console.error("donny-apply-pitch: Claude API error", response.status);
          pitch = buildTemplatePitch(
            creator.creator_name,
            creator.skills,
            creator.average_rating
          );
        }
      } catch (e) {
        clearTimeout(timeout);
        console.error("donny-apply-pitch: Claude timeout or error", e);
        pitch = buildTemplatePitch(
          creator.creator_name,
          creator.skills,
          creator.average_rating
        );
      }
    } else {
      pitch = buildTemplatePitch(
        creator.creator_name,
        creator.skills,
        creator.average_rating
      );
    }

    const result: PitchResult = {
      pitch,
      suggested_rate: suggestedRate,
      suggested_portfolio_piece_url: suggestedPortfolio,
      pitch_source: pitchSource,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("donny-apply-pitch: unexpected error", error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/donny-apply-pitch/index.ts
git commit -m "feat: donny-apply-pitch edge function with Claude + template fallback"
```

---

## Task 3: Create `useCampaignDetailEnriched` hook

**Files:**
- Create: `src/hooks/useCampaignDetailEnriched.ts`

This enhances the existing `useCampaignDetail` hook with match score, business profile, and application count. It's a new hook rather than modifying the existing one, since the existing one is also used in business-side contexts.

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useCampaignDetailEnriched.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaignDetail } from './useCampaignDetail';
import type { CampaignDetail } from './useCampaignDetail';

export interface BusinessProfile {
  business_name: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  profile_slug: string | null;
  user_id: string;
}

export interface EnrichedCampaignDetail extends CampaignDetail {
  matchScore: number | null;
  businessProfile: BusinessProfile | null;
  applicationCount: number;
  completedCampaignCount: number;
}

export const useCampaignDetailEnriched = (
  campaignId: string | null,
  campaignOwnerId: string | null
) => {
  const { user } = useAuth();
  const baseDetail = useCampaignDetail(campaignId);

  const enriched = useQuery({
    queryKey: ['campaign-detail-enriched', campaignId, user?.id, campaignOwnerId],
    queryFn: async (): Promise<{
      matchScore: number | null;
      businessProfile: BusinessProfile | null;
      applicationCount: number;
      completedCampaignCount: number;
    }> => {
      if (!campaignId) throw new Error('No campaign ID');

      const [matchResult, businessResult, appCountResult, completedCountResult] =
        await Promise.all([
          // Match score for this creator + campaign
          user?.id
            ? supabase
                .from('campaign_matches')
                .select('match_score')
                .eq('campaign_id', campaignId)
                .eq('creator_id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          // Business profile via campaign owner
          campaignOwnerId
            ? supabase
                .from('business_profiles')
                .select(
                  'business_name, logo_url, city, country, average_rating, total_reviews, profile_slug, user_id'
                )
                .eq('user_id', campaignOwnerId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          // Application count for this campaign
          supabase
            .from('campaign_applications')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId),

          // Completed campaigns count by this business
          campaignOwnerId
            ? supabase
                .from('campaigns')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', campaignOwnerId)
                .eq('status', 'completed')
            : Promise.resolve({ data: null, error: null, count: 0 }),
        ]);

      return {
        matchScore: matchResult.data?.match_score ?? null,
        businessProfile: businessResult.data as BusinessProfile | null,
        applicationCount: appCountResult.count ?? 0,
        completedCampaignCount: completedCountResult.count ?? 0,
      };
    },
    enabled: !!campaignId,
  });

  const data: EnrichedCampaignDetail | undefined =
    baseDetail.data && enriched.data
      ? {
          ...baseDetail.data,
          ...enriched.data,
        }
      : undefined;

  return {
    data,
    isLoading: baseDetail.isLoading || enriched.isLoading,
    error: baseDetail.error || enriched.error,
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCampaignDetailEnriched.ts
git commit -m "feat: useCampaignDetailEnriched hook with match score, business profile, app count"
```

---

## Task 4: Create `useDonnyApplyPitch` hook

**Files:**
- Create: `src/hooks/useDonnyApplyPitch.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useDonnyApplyPitch.ts

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface DonnyPitchResult {
  pitch: string;
  suggested_rate: number;
  suggested_portfolio_piece_url: string | null;
  pitch_source: 'claude' | 'template';
}

const CLIENT_FALLBACK_PITCH = "I'd love to work on this campaign — happy to chat about specifics.";

export const useDonnyApplyPitch = () => {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      campaignId,
      budgetMin,
      budgetMax,
    }: {
      campaignId: string;
      budgetMin?: number | null;
      budgetMax?: number | null;
    }): Promise<DonnyPitchResult> => {
      if (!user?.id) throw new Error('Not authenticated');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const { data, error } = await supabase.functions.invoke(
          'donny-apply-pitch',
          {
            body: { creator_id: user.id, campaign_id: campaignId },
          }
        );

        clearTimeout(timeout);

        if (error || !data) {
          return {
            pitch: CLIENT_FALLBACK_PITCH,
            suggested_rate: budgetMin ?? 100,
            suggested_portfolio_piece_url: null,
            pitch_source: 'template',
          };
        }

        return data as DonnyPitchResult;
      } catch {
        clearTimeout(timeout);
        return {
          pitch: CLIENT_FALLBACK_PITCH,
          suggested_rate: budgetMin ?? 100,
          suggested_portfolio_piece_url: null,
          pitch_source: 'template',
        };
      }
    },
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDonnyApplyPitch.ts
git commit -m "feat: useDonnyApplyPitch hook with 5s timeout + client fallback"
```

---

## Task 5: Enhance `CampaignHero` with cover image, distance, posted time, app count

**Files:**
- Modify: `src/components/campaign-details/CampaignHero.tsx`

The current hero only shows emoji + title + business name + delivery badge on a teal gradient. The new hero adds a real cover image background (with gradient overlay), distance from creator, posted timestamp, and applicant count.

- [ ] **Step 1: Rewrite CampaignHero**

```typescript
// src/components/campaign-details/CampaignHero.tsx

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Users } from 'lucide-react';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { CampaignMediaItem } from '@/types/campaignMedia';
import { getCoverImageUrl, getRelativeTime } from '@/lib/campaignUtils';

interface CampaignHeroProps {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  businessLogoUrl?: string | null;
  distance?: number | null;
  applicationCount?: number;
}

const TIER_LABELS: Record<string, string> = {
  dragonrush: 'DragonDash',
  expedited: 'Express',
  standard: 'Standard',
};

export function CampaignHero({
  campaign,
  media,
  businessLogoUrl,
  distance,
  applicationCount,
}: CampaignHeroProps) {
  const navigate = useNavigate();
  const tierLabel = campaign.delivery_type
    ? TIER_LABELS[campaign.delivery_type] ?? 'Standard'
    : 'Standard';
  const tierEmoji =
    campaign.delivery_type === 'dragonrush'
      ? '🐉'
      : campaign.delivery_type === 'expedited'
        ? '⚡'
        : '📦';
  const businessName =
    (campaign.ai_analysis as Record<string, unknown>)?.business_name as
      | string
      | undefined;
  const tagline = campaign.tagline;
  const campaignType =
    campaign.campaign_type?.replace(/_/g, ' ') ?? 'Campaign';

  const cover = getCoverImageUrl(
    media,
    campaign.ai_preview_status,
    businessLogoUrl
  );

  return (
    <div className="relative overflow-hidden">
      {/* Cover image or gradient */}
      {cover.url ? (
        <div className="relative h-48 lg:h-64">
          <img
            src={cover.url}
            alt={campaign.title}
            className={`w-full h-full object-cover ${cover.type === 'logo' ? 'blur-sm scale-110' : ''}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        </div>
      ) : (
        <div className="relative h-48 lg:h-64 bg-gradient-to-br from-dc-teal to-dc-teal-dark" />
      )}

      {/* Back button */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5"
          aria-label="Back"
        >
          <div className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-white" />
          </div>
          <span className="text-white/85 text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Delivery tier badge */}
      <div className="absolute top-4 right-4 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
        <span className="text-white text-xs font-semibold">
          {tierEmoji} {tierLabel}
        </span>
      </div>

      {/* Bottom overlay content */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
        <h1 className="text-xl font-bold text-white mb-0.5">{campaign.title}</h1>
        <span className="text-xs text-white/80 capitalize">
          {campaignType}
          {businessName ? ` · ${businessName}` : ''}
        </span>
        {tagline && (
          <p className="text-white/90 text-sm italic mt-1">"{tagline}"</p>
        )}

        {/* Meta row: distance, posted time, applicants */}
        <div className="flex items-center gap-3 mt-2">
          {distance != null && (
            <span className="flex items-center gap-1 text-white/75 text-xs">
              <MapPin className="w-3 h-3" />
              {distance} mi
            </span>
          )}
          <span className="flex items-center gap-1 text-white/75 text-xs">
            <Clock className="w-3 h-3" />
            {getRelativeTime(campaign.created_at)}
          </span>
          {applicationCount != null && applicationCount > 0 && (
            <span className="flex items-center gap-1 text-white/75 text-xs">
              <Users className="w-3 h-3" />
              {applicationCount} applied
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: Build succeeds or only unrelated warnings

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/CampaignHero.tsx
git commit -m "feat: enhance CampaignHero with cover image, distance, posted time, app count"
```

---

## Task 6: Create P1.2 section components (Metrics, Brief, References, Footage, Deliverables, Timeline, Budget, BusinessStrip)

**Files:**
- Create: `src/components/campaign-details/CampaignMetricsBar.tsx`
- Create: `src/components/campaign-details/CampaignBriefSection.tsx`
- Create: `src/components/campaign-details/CampaignReferencesGallery.tsx`
- Create: `src/components/campaign-details/CampaignFootageSection.tsx`
- Create: `src/components/campaign-details/CampaignDeliverablesBreakdown.tsx`
- Create: `src/components/campaign-details/CampaignTimeline.tsx`
- Create: `src/components/campaign-details/CampaignBudgetDetail.tsx`
- Create: `src/components/campaign-details/BusinessProfileStrip.tsx`

Each component is self-contained, receives its data via props, and hides itself when data is missing.

- [ ] **Step 1: Create CampaignMetricsBar**

```typescript
// src/components/campaign-details/CampaignMetricsBar.tsx

import { formatBudget } from '@/lib/campaignUtils';

interface CampaignMetricsBarProps {
  campaign: {
    pricing_type?: string | null;
    fixed_price?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
    delivery_type?: string | null;
  };
  deliverableCount: number;
  matchScore: number | null;
}

const TIER_CONFIG: Record<string, { emoji: string; label: string; timeframe: string; bg: string }> = {
  dragonrush: { emoji: '🐉', label: 'DragonDash', timeframe: '1–3 hrs', bg: 'bg-teal-500 text-white' },
  expedited: { emoji: '🚀', label: 'Express', timeframe: '24–48 hrs', bg: 'bg-pink-400 text-white' },
  standard: { emoji: '📅', label: 'Standard', timeframe: '5–7 days', bg: 'bg-gray-200 text-gray-700' },
};

export function CampaignMetricsBar({ campaign, deliverableCount, matchScore }: CampaignMetricsBarProps) {
  const tier = campaign.delivery_type ? TIER_CONFIG[campaign.delivery_type] : null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-5 py-3 bg-white border-b border-gray-100">
      <span className="text-sm font-bold text-dc-teal">{formatBudget(campaign)}</span>
      <span className="text-gray-300">·</span>
      <span className="text-sm text-gray-600">
        {deliverableCount} deliverable{deliverableCount !== 1 ? 's' : ''}
      </span>
      {tier && (
        <>
          <span className="text-gray-300">·</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tier.bg}`}>
            {tier.emoji} {tier.label}
          </span>
        </>
      )}
      {matchScore != null && (
        <>
          <span className="text-gray-300">·</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-700">
            {matchScore}% Match
          </span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create CampaignBriefSection**

```typescript
// src/components/campaign-details/CampaignBriefSection.tsx

import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignBriefSectionProps {
  description?: string | null;
  goals?: string | null;
  style?: string | null;
  tone?: string | null;
  targetPersonas?: string[] | null;
}

export function CampaignBriefSection({
  description,
  goals,
  style,
  tone,
  targetPersonas,
}: CampaignBriefSectionProps) {
  if (!description && !goals && !style && !tone) return null;

  const goalList = goals
    ?.split(/[,\n]/)
    .map((g) => g.trim())
    .filter(Boolean);

  return (
    <CampaignDetailSection title="Campaign Brief">
      {description && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {description}
        </p>
      )}

      {goalList && goalList.length > 0 && (
        <div>
          <span className="text-[11px] text-gray-500 uppercase">Goals</span>
          <ul className="mt-1 space-y-1">
            {goalList.map((g, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-dc-teal mt-0.5">•</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(style || tone) && (
        <div className="flex gap-4">
          {style && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Style</span>
              <p className="text-sm text-gray-700 mt-0.5">{style}</p>
            </div>
          )}
          {tone && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Tone</span>
              <p className="text-sm text-gray-700 mt-0.5">{tone}</p>
            </div>
          )}
        </div>
      )}

      {targetPersonas && targetPersonas.length > 0 && (
        <div>
          <span className="text-[11px] text-gray-500 uppercase">Target Audience</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {targetPersonas.map((p) => (
              <span key={p} className="bg-pink-100 text-pink-700 text-xs px-2.5 py-1 rounded-full capitalize">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </CampaignDetailSection>
  );
}
```

- [ ] **Step 3: Create CampaignReferencesGallery**

```typescript
// src/components/campaign-details/CampaignReferencesGallery.tsx

import { useState } from 'react';
import { X } from 'lucide-react';
import type { CampaignMediaItem } from '@/types/campaignMedia';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignReferencesGalleryProps {
  referenceMedia: CampaignMediaItem[];
}

export function CampaignReferencesGallery({ referenceMedia }: CampaignReferencesGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (referenceMedia.length === 0) return null;

  return (
    <>
      <CampaignDetailSection title="Visual References">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {referenceMedia.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setLightboxIndex(i)}
              className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-200 hover:border-dc-teal transition-colors"
            >
              {item.media_type === 'reference_video' ? (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                  <span className="text-white text-2xl">▶</span>
                </div>
              ) : (
                <img
                  src={item.thumbnail_url || item.file_url}
                  alt={item.file_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </button>
          ))}
        </div>
      </CampaignDetailSection>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          {referenceMedia[lightboxIndex].media_type === 'reference_video' ? (
            <video
              src={referenceMedia[lightboxIndex].file_url}
              controls
              className="max-w-full max-h-[80vh] rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={referenceMedia[lightboxIndex].file_url}
              alt={referenceMedia[lightboxIndex].file_name}
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Create CampaignFootageSection**

```typescript
// src/components/campaign-details/CampaignFootageSection.tsx

import { Video } from 'lucide-react';
import type { CampaignMediaItem } from '@/types/campaignMedia';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignFootageSectionProps {
  footageItems: CampaignMediaItem[];
  hasApplied: boolean;
}

export function CampaignFootageSection({ footageItems, hasApplied }: CampaignFootageSectionProps) {
  if (footageItems.length === 0) return null;

  return (
    <CampaignDetailSection title="Business Footage">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Video className="w-4 h-4 text-dc-teal" />
          📹 Raw footage provided
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        The business has uploaded footage you can use
      </p>
      <div className="grid grid-cols-3 gap-2">
        {footageItems.map((item) => (
          <div
            key={item.id}
            className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
          >
            <img
              src={item.thumbnail_url || item.file_url}
              alt={item.file_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {!hasApplied && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-[10px] font-semibold text-center px-2">
                  Apply to access
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </CampaignDetailSection>
  );
}
```

- [ ] **Step 5: Create CampaignDeliverablesBreakdown**

```typescript
// src/components/campaign-details/CampaignDeliverablesBreakdown.tsx

import { Camera, Film, Layers, Smartphone } from 'lucide-react';
import type { CampaignDeliverable } from '@/types/campaignMedia';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignDeliverablesBreakdownProps {
  deliverables: CampaignDeliverable[];
  fallbackDeliverables?: string[] | null;
}

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  photo: <Camera className="w-4 h-4 text-dc-teal" />,
  video_reel: <Film className="w-4 h-4 text-dc-teal" />,
  story: <Smartphone className="w-4 h-4 text-dc-teal" />,
  carousel: <Layers className="w-4 h-4 text-dc-teal" />,
  tiktok: <Film className="w-4 h-4 text-dc-teal" />,
  youtube_short: <Film className="w-4 h-4 text-dc-teal" />,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  photo: 'Photo',
  video_reel: 'Reel',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YT Short',
};

export function CampaignDeliverablesBreakdown({
  deliverables,
  fallbackDeliverables,
}: CampaignDeliverablesBreakdownProps) {
  if (deliverables.length === 0 && (!fallbackDeliverables || fallbackDeliverables.length === 0)) {
    return null;
  }

  return (
    <CampaignDetailSection title="Deliverables">
      {deliverables.length > 0 ? (
        <div className="space-y-2">
          {deliverables.map((d, i) => (
            <div key={d.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
              <span className="text-sm font-bold text-gray-400 mt-0.5 w-5 text-right">{i + 1}.</span>
              {CONTENT_TYPE_ICONS[d.content_type] ?? <Camera className="w-4 h-4 text-dc-teal mt-0.5" />}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-900">
                  {CONTENT_TYPE_LABELS[d.content_type] ?? d.content_type}
                </span>
                <span className="text-xs text-gray-500 ml-1.5 capitalize">({d.platform.replace(/_/g, ' ')})</span>
                {d.description && (
                  <p className="text-xs text-gray-600 mt-0.5">{d.description}</p>
                )}
                {d.aspect_ratio && (
                  <span className="text-[10px] text-gray-400 mt-0.5 block">{d.aspect_ratio}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {fallbackDeliverables!.map((d, i) => (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
              {i + 1}. {d}
            </div>
          ))}
        </div>
      )}
    </CampaignDetailSection>
  );
}
```

- [ ] **Step 6: Create CampaignTimeline**

```typescript
// src/components/campaign-details/CampaignTimeline.tsx

import { Calendar, Clock } from 'lucide-react';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignTimelineProps {
  deliveryType?: string | null;
  deadline?: string | null;
}

const TIER_TIMEFRAMES: Record<string, string> = {
  dragonrush: 'Due 1–3 hours after acceptance',
  expedited: 'Due 48 hours after acceptance',
  standard: 'Due in 5–7 days',
};

export function CampaignTimeline({ deliveryType, deadline }: CampaignTimelineProps) {
  if (!deliveryType && !deadline) return null;

  const timeframe = deliveryType ? TIER_TIMEFRAMES[deliveryType] : null;

  return (
    <CampaignDetailSection title="Timeline & Deadline">
      <div className="space-y-2">
        {timeframe && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-dc-teal" />
            <span className="text-sm text-gray-700">{timeframe}</span>
          </div>
        )}
        {deadline && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-dc-teal" />
            <span className="text-sm text-gray-700">
              Deadline:{' '}
              {new Date(deadline).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>
    </CampaignDetailSection>
  );
}
```

- [ ] **Step 7: Create CampaignBudgetDetail**

```typescript
// src/components/campaign-details/CampaignBudgetDetail.tsx

import { DollarSign } from 'lucide-react';
import { formatBudget } from '@/lib/campaignUtils';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignBudgetDetailProps {
  campaign: {
    pricing_type?: string | null;
    fixed_price?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
  };
}

export function CampaignBudgetDetail({ campaign }: CampaignBudgetDetailProps) {
  return (
    <CampaignDetailSection title="Budget">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-dc-teal" />
        <span className="text-lg font-bold text-gray-900">
          {formatBudget(campaign)}
        </span>
        {campaign.pricing_type === 'fixed' && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            Fixed Price
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        Payment via Stripe upon approval
      </p>
    </CampaignDetailSection>
  );
}
```

- [ ] **Step 8: Create BusinessProfileStrip**

```typescript
// src/components/campaign-details/BusinessProfileStrip.tsx

import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import type { BusinessProfile } from '@/hooks/useCampaignDetailEnriched';

interface BusinessProfileStripProps {
  profile: BusinessProfile;
  completedCampaignCount: number;
}

export function BusinessProfileStrip({ profile, completedCampaignCount }: BusinessProfileStripProps) {
  const navigate = useNavigate();

  const profilePath = profile.profile_slug
    ? `/business/${profile.profile_slug}`
    : `/business/${profile.user_id}`;

  return (
    <button
      onClick={() => navigate(profilePath)}
      className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:border-dc-teal transition-colors text-left"
    >
      {profile.logo_url ? (
        <img
          src={profile.logo_url}
          alt={profile.business_name}
          className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-400"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-teal-100 ring-2 ring-teal-400 flex items-center justify-center">
          <span className="text-dc-teal font-bold text-sm">
            {profile.business_name[0]?.toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{profile.business_name}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {profile.city && <span>{profile.city}</span>}
          {profile.average_rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              {profile.average_rating.toFixed(1)}
            </span>
          )}
          {completedCampaignCount > 0 && (
            <span>{completedCampaignCount} campaigns</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}
```

- [ ] **Step 9: Verify build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: Build succeeds (components are created but not yet imported anywhere)

- [ ] **Step 10: Commit**

```bash
git add src/components/campaign-details/CampaignMetricsBar.tsx src/components/campaign-details/CampaignBriefSection.tsx src/components/campaign-details/CampaignReferencesGallery.tsx src/components/campaign-details/CampaignFootageSection.tsx src/components/campaign-details/CampaignDeliverablesBreakdown.tsx src/components/campaign-details/CampaignTimeline.tsx src/components/campaign-details/CampaignBudgetDetail.tsx src/components/campaign-details/BusinessProfileStrip.tsx
git commit -m "feat: add 8 campaign detail section components for P1.2"
```

---

## Task 7: Rewrite `CreatorCampaignDetails` to render all new sections

**Files:**
- Modify: `src/components/campaign-details/CreatorCampaignDetails.tsx`

This replaces the existing three-section layout (Content Requirements, Compensation & Terms, Logistics & Targeting) with the new section components from Task 6.

- [ ] **Step 1: Rewrite CreatorCampaignDetails**

```typescript
// src/components/campaign-details/CreatorCampaignDetails.tsx

import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CampaignHero } from './CampaignHero';
import { CampaignMetricsBar } from './CampaignMetricsBar';
import { CampaignBriefSection } from './CampaignBriefSection';
import { CampaignReferencesGallery } from './CampaignReferencesGallery';
import { CampaignFootageSection } from './CampaignFootageSection';
import { CampaignDeliverablesBreakdown } from './CampaignDeliverablesBreakdown';
import { CampaignTimeline } from './CampaignTimeline';
import { CampaignBudgetDetail } from './CampaignBudgetDetail';
import { BusinessProfileStrip } from './BusinessProfileStrip';
import { InvitationBanner } from './InvitationBanner';

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

      <div className="px-5 pt-4 pb-6 space-y-0">
        <CampaignBriefSection
          description={campaign.description}
          goals={campaign.goals}
          style={campaign.style}
          tone={campaign.tone}
          targetPersonas={campaign.target_creator_personas}
        />

        {enrichedDetail && (
          <CampaignReferencesGallery referenceMedia={enrichedDetail.referenceMedia} />
        )}

        {enrichedDetail && (
          <CampaignFootageSection
            footageItems={rawFootage}
            hasApplied={hasApplied ?? false}
          />
        )}

        <CampaignDeliverablesBreakdown
          deliverables={enrichedDetail?.deliverables ?? []}
          fallbackDeliverables={campaign.deliverables}
        />

        <CampaignTimeline
          deliveryType={campaign.delivery_type}
          deadline={campaign.deadline}
        />

        <CampaignBudgetDetail campaign={campaign} />

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

- [ ] **Step 2: Update CampaignDetailsPage to pass enrichedDetail**

In `src/pages/CampaignDetailsPage.tsx`, import and use `useCampaignDetailEnriched`, pass data to `CreatorCampaignDetails`:

Add import at top:
```typescript
import { useCampaignDetailEnriched } from '@/hooks/useCampaignDetailEnriched';
```

Inside the component, after the `useCreatorApplicationStatus` call, add:
```typescript
const { data: enrichedDetail } = useCampaignDetailEnriched(
  id ?? null,
  campaign?.user_id ?? null
);
```

Update the `<CreatorCampaignDetails>` render:
```tsx
<CreatorCampaignDetails
  campaign={campaign}
  enrichedDetail={enrichedDetail}
  isInvited={isInvited}
  hasApplied={hasApplied}
/>
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1 | head -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/CreatorCampaignDetails.tsx src/pages/CampaignDetailsPage.tsx
git commit -m "feat: wire rebuilt CreatorCampaignDetails with all P1.2 sections"
```

---

## Task 8: Create `StickyApplyCTA`, `OneTapApplySheet`, and `ApplyConfirmation`

**Files:**
- Create: `src/components/campaign-details/StickyApplyCTA.tsx`
- Create: `src/components/campaigns/OneTapApplySheet.tsx`
- Create: `src/components/campaigns/ApplyConfirmation.tsx`

- [ ] **Step 1: Create StickyApplyCTA**

```typescript
// src/components/campaign-details/StickyApplyCTA.tsx

import { Send, CheckCircle, FolderOpen } from 'lucide-react';

interface StickyApplyCTAProps {
  canApply: boolean;
  hasApplied: boolean;
  applicationStatus: 'pending' | 'accepted' | 'rejected' | null;
  onApply: () => void;
  onViewProject: () => void;
  spotsTotal?: number | null;
}

export function StickyApplyCTA({
  canApply,
  hasApplied,
  applicationStatus,
  onApply,
  onViewProject,
  spotsTotal,
}: StickyApplyCTAProps) {
  const canReapply = hasApplied && applicationStatus === 'rejected';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-5 py-3 pb-safe">
      <div className="md:max-w-2xl md:mx-auto">
        {canApply && (
          <button
            onClick={onApply}
            className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 h-14 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Send className="h-4 w-4" />
            Apply with Donny
          </button>
        )}
        {hasApplied && applicationStatus === 'pending' && (
          <div className="w-full rounded-full bg-gray-100 text-gray-500 font-bold py-3.5 h-14 flex items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Applied (Pending)
          </div>
        )}
        {hasApplied && applicationStatus === 'accepted' && (
          <button
            onClick={onViewProject}
            className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 h-14 flex items-center justify-center gap-2"
          >
            <FolderOpen className="h-4 w-4" />
            View Project
          </button>
        )}
        {canReapply && (
          <button
            onClick={onApply}
            className="w-full rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3.5 h-14 flex items-center justify-center gap-2"
          >
            <Send className="h-4 w-4" />
            Apply Again
          </button>
        )}
        {spotsTotal && (
          <p className="text-center text-xs text-gray-500 mt-1.5">
            {spotsTotal} spots total
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create OneTapApplySheet**

```typescript
// src/components/campaigns/OneTapApplySheet.tsx

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useDonnyApplyPitch, type DonnyPitchResult } from '@/hooks/useDonnyApplyPitch';
import type { Campaign } from '@/hooks/useCampaignQueries';
import { formatBudget } from '@/lib/campaignUtils';

interface OneTapApplySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  onSend: (pitch: DonnyPitchResult) => void;
  onEditDetails: (pitch: DonnyPitchResult) => void;
}

const TIER_AVAILABILITY: Record<string, string> = {
  dragonrush: 'Ready within 3 hours',
  expedited: 'Available within 48 hours',
  standard: 'Available this week',
};

export function OneTapApplySheet({
  open,
  onOpenChange,
  campaign,
  onSend,
  onEditDetails,
}: OneTapApplySheetProps) {
  const donnyPitch = useDonnyApplyPitch();

  useEffect(() => {
    if (open && !donnyPitch.data && !donnyPitch.isPending) {
      donnyPitch.mutate({
        campaignId: campaign.id,
        budgetMin: campaign.budget_min,
        budgetMax: campaign.budget_max,
      });
    }
  }, [open]);

  const pitch = donnyPitch.data;
  const availability = campaign.delivery_type
    ? TIER_AVAILABILITY[campaign.delivery_type] ?? 'Available this week'
    : 'Available this week';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pt-6 pb-8 max-h-[60vh]">
        {donnyPitch.isPending ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-dc-teal" />
            <p className="text-sm text-gray-600 font-medium">
              Donny is preparing your application...
            </p>
          </div>
        ) : pitch ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-gray-900">Review Your Application</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">Rate</span>
                <span className="text-sm font-bold text-dc-teal">
                  ${pitch.suggested_rate}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">When</span>
                <span className="text-sm text-gray-700">{availability}</span>
              </div>
              {pitch.suggested_portfolio_piece_url && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase">Sample</span>
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={pitch.suggested_portfolio_piece_url}
                      alt="Portfolio sample"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Pitch</span>
                <p className="text-sm text-gray-700 italic bg-gray-50 rounded-xl p-3">
                  "{pitch.pitch}"
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => onSend(pitch)}
                className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 h-14 active:scale-[0.98] transition-transform"
              >
                Looks good — Send
              </button>
              <button
                onClick={() => onEditDetails(pitch)}
                className="w-full rounded-full border-2 border-gray-300 text-gray-600 font-semibold py-3 text-sm hover:border-gray-400 transition-colors"
              >
                Edit details
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Something went wrong. Please try again.</p>
            <button
              onClick={() =>
                donnyPitch.mutate({
                  campaignId: campaign.id,
                  budgetMin: campaign.budget_min,
                  budgetMax: campaign.budget_max,
                })
              }
              className="mt-3 text-dc-teal text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Create ApplyConfirmation**

```typescript
// src/components/campaigns/ApplyConfirmation.tsx

import { useNavigate } from 'react-router-dom';

interface ApplyConfirmationProps {
  open: boolean;
  onClose: () => void;
  businessName?: string;
}

export function ApplyConfirmation({ open, onClose, businessName }: ApplyConfirmationProps) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Checkmark animation */}
      <div className="w-20 h-20 rounded-full bg-dc-teal flex items-center justify-center mb-6 animate-in zoom-in duration-500">
        <svg
          className="w-10 h-10 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
            className="animate-draw-check"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Application Sent!</h2>
      <p className="text-sm text-gray-500 text-center max-w-xs mb-8">
        {businessName ? `${businessName} will` : 'The business will'} respond within 24h.
        We'll ping you here and on push notifications.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => {
            onClose();
            navigate('/dashboard/creator/campaigns');
          }}
          className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5"
        >
          Browse more campaigns
        </button>
        <button
          onClick={() => {
            onClose();
            navigate('/dashboard/creator/campaigns?tab=applied');
          }}
          className="w-full rounded-full border-2 border-gray-300 text-gray-600 font-semibold py-3"
        >
          View my applications
        </button>
      </div>

      {/* CSS for the checkmark draw animation */}
      <style>{`
        @keyframes draw-check {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-draw-check {
          stroke-dasharray: 24;
          animation: draw-check 0.4s ease-out 0.3s forwards;
          stroke-dashoffset: 24;
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/StickyApplyCTA.tsx src/components/campaigns/OneTapApplySheet.tsx src/components/campaigns/ApplyConfirmation.tsx
git commit -m "feat: StickyApplyCTA, OneTapApplySheet, ApplyConfirmation for P1.3"
```

---

## Task 9: Wire everything into `CampaignDetailsPage`

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx`

This is the final integration: replace the old apply dialog with the new sticky CTA + one-tap sheet + confirmation flow.

- [ ] **Step 1: Rewrite the creator view section of CampaignDetailsPage**

Replace the entire creator view section (inside `if (isCreatorView)`) with the new flow. Key changes:
- Remove `showApplicationDialog` state and `Dialog`/`ApplicationForm` imports
- Add `OneTapApplySheet`, `ApplyConfirmation`, `StickyApplyCTA` imports
- Add `useDonnyApplyPitch` integration for submitting via `useCreateApplication`
- Add state for sheet open, confirmation open, and edit mode
- Keep `ApplicationForm` accessible behind "Edit details" via a Dialog

The full rewritten file:

```typescript
import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Users, Target, AlertCircle } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import CampaignDetailsOverview from '@/components/campaigns/CampaignDetailsOverview';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';
import CreatorMatchingSection from '@/components/campaigns/CreatorMatchingSection';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { StickyApplyCTA } from '@/components/campaign-details/StickyApplyCTA';
import { OneTapApplySheet } from '@/components/campaigns/OneTapApplySheet';
import { ApplyConfirmation } from '@/components/campaigns/ApplyConfirmation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplicationStatus } from '@/hooks/useCreatorApplicationStatus';
import { useCampaignDetailEnriched } from '@/hooks/useCampaignDetailEnriched';
import { useCreateApplication } from '@/hooks/useCreateApplication';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ApplicationForm from '@/components/campaigns/ApplicationForm';
import type { DonnyPitchResult } from '@/hooks/useDonnyApplyPitch';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);

  const isCreatorView = location.pathname.includes('/creator/');
  const userRole = isCreatorView ? 'content_creator' : 'business_client';
  const isOwnCampaign = campaign?.user_id === user?.id;

  const searchParams = new URLSearchParams(location.search);
  const isInvitedByParam = searchParams.get('invited') === 'true';

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

  const { hasApplied, applicationStatus } = useCreatorApplicationStatus(id);
  const { data: enrichedDetail } = useCampaignDetailEnriched(
    id ?? null,
    campaign?.user_id ?? null
  );
  const createApplication = useCreateApplication();

  const canApply = isCreatorView && !isOwnCampaign && campaign?.status === 'published' && !hasApplied;
  const canReapply = isCreatorView && hasApplied && applicationStatus === 'rejected';

  // One-tap apply flow state
  const [showApplySheet, setShowApplySheet] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showLegacyForm, setShowLegacyForm] = useState(false);

  const businessName =
    enrichedDetail?.businessProfile?.business_name ??
    ((campaign?.ai_analysis as Record<string, unknown>)?.business_name as string | undefined);

  const backHref = isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns';

  const handleDonnySend = async (pitch: DonnyPitchResult) => {
    if (!campaign) return;
    try {
      const tierDates: Record<string, number> = { dragonrush: 0, expedited: 2, standard: 7 };
      const daysOut = campaign.delivery_type ? tierDates[campaign.delivery_type] ?? 7 : 7;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysOut);
      const pad = (n: number) => String(n).padStart(2, '0');
      const proposedTimeline = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;

      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: pitch.pitch,
        proposedRate: pitch.suggested_rate,
        proposedTimeline,
        portfolioUrl: pitch.suggested_portfolio_piece_url ?? undefined,
      });

      // Log to donny_events
      supabase
        .from('donny_events' as any)
        .insert({
          event_type: 'apply_with_donny',
          user_id: user!.id,
          campaign_id: campaign.id,
          payload: { used_edit: false, pitch_source: pitch.pitch_source },
        })
        .then(() => {});

      setShowApplySheet(false);
      setShowConfirmation(true);
    } catch {
      // Error handled by useCreateApplication's onError toast
    }
  };

  const handleEditDetails = (pitch: DonnyPitchResult) => {
    // Log that user chose to edit
    supabase
      .from('donny_events' as any)
      .insert({
        event_type: 'apply_edit_details',
        user_id: user!.id,
        campaign_id: campaign?.id,
        payload: {},
      })
      .then(() => {});

    setShowApplySheet(false);
    setShowLegacyForm(true);
  };

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

  // Creator view — rebuilt with full brief + one-tap apply
  if (isCreatorView) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-24">
          <div className="md:max-w-2xl md:mx-auto md:mt-6">
            <CreatorCampaignDetails
              campaign={campaign}
              enrichedDetail={enrichedDetail}
              isInvited={isInvited}
              hasApplied={hasApplied}
            />
          </div>

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

          <Dialog open={showLegacyForm} onOpenChange={setShowLegacyForm}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Apply to Campaign</DialogTitle>
              </DialogHeader>
              <ApplicationForm
                campaign={campaign}
                onSuccess={() => {
                  setShowLegacyForm(false);
                  setShowConfirmation(true);
                }}
                onCancel={() => setShowLegacyForm(false)}
              />
            </DialogContent>
          </Dialog>

          <ApplyConfirmation
            open={showConfirmation}
            onClose={() => setShowConfirmation(false)}
            businessName={businessName}
          />
        </div>
      </DashboardLayout>
    );
  }

  // Business/brand owner view — existing tab layout (unchanged)
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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: wire one-tap Apply with Donny into CampaignDetailsPage"
```

---

## Task 10: Build verification and final commit

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with 0 errors

- [ ] **Step 2: Verify type checking**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors (or only pre-existing ones)

- [ ] **Step 3: Test the creator campaign detail view**

Run: `npm run dev`
Manual checks:
1. Navigate to a campaign detail page as a creator (`/dashboard/creator/campaigns/:id`)
2. Verify all 10 sections render (hero with cover image, metrics bar, brief, references, footage, deliverables, timeline, budget, business profile strip)
3. Sections with no data should be hidden, not empty
4. Mobile viewport (375px): no horizontal overflow, all touch targets >= 44px
5. Sticky "Apply with Donny" CTA visible at bottom

- [ ] **Step 4: Test the one-tap apply flow**

1. Tap "Apply with Donny" — sheet slides up with loading state
2. Donny generates pitch (or falls back to template within 5s)
3. Sheet shows rate, availability, sample, pitch
4. Tap "Looks good — Send" — application submits, confirmation shows
5. Test "Edit details" — legacy form opens pre-filled
6. Check `donny_events` table has event rows

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(section2): campaign detail rebuild + one-tap Apply with Donny (P1.2 + P1.3)"
```
