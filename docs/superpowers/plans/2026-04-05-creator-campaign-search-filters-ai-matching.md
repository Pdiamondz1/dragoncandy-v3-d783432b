# Creator Campaign Search, Filters & AI Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search, content-type/delivery-tier filter pills, sort, and a client-side "Donny's Picks" AI matching section to the creator campaign marketplace.

**Architecture:** All filtering and matching is client-side against the already-fetched `usePublicCampaigns` data. A new `useCreatorMatchProfile` hook fetches the logged-in creator's profile and active collab count. A new `useDonnyMatches` hook scores campaigns using a weighted formula (skills 40%, location 30%, rating 20%, availability 10%) with fallback weights when location data is missing. New UI components are mobile-first pill-based filters that sit compactly above the existing swipe stack.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Query (TanStack), Supabase JS client, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-creator-campaign-search-filters-ai-matching-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/donnyMatching.ts` | **Create** | Pure matching logic: skill mapping, scoring functions, sort. No React dependencies. |
| `src/lib/donnyMatching.test.ts` | **Create** | Unit tests for all scoring functions and edge cases |
| `src/hooks/useCreatorMatchProfile.ts` | **Create** | Fetch logged-in creator's profile (skills, city, country, rating) + active collab count |
| `src/hooks/useDonnyMatches.ts` | **Create** | React hook that combines creator profile + campaigns -> scored & sorted picks |
| `src/hooks/useCampaignFilters.ts` | **Create** | Filter/search/sort state and logic for campaigns |
| `src/components/campaigns/CampaignSearchFilters.tsx` | **Create** | Mobile-first compact search + filter pills + sort UI |
| `src/components/campaigns/DonnyPicksBadge.tsx` | **Create** | Match score badge overlay component |
| `src/components/campaigns/DonnyPicksRow.tsx` | **Create** | Desktop "Donny's Picks for You" horizontal section |
| `src/pages/CreatorCampaignMarketplace.tsx` | **Modify** | Wire up filters, Donny's Picks injection into swipe stack, desktop picks row |
| `src/components/campaigns/CampaignSwipeCard.tsx` | **Modify** | Accept optional `matchScore` prop to render badge overlay |

---

### Task 1: Pure Matching Logic (`donnyMatching.ts`)

**Files:**
- Create: `src/lib/donnyMatching.ts`
- Test: `src/lib/donnyMatching.test.ts`

This is the core algorithm with zero React/Supabase dependencies — pure functions that take data in, return scores out.

- [ ] **Step 1: Write failing tests for skill-to-content-type mapping**

```typescript
// src/lib/donnyMatching.test.ts
import { describe, test, expect } from 'vitest';
import { SKILL_TO_CONTENT_TYPES, computeSkillScore } from './donnyMatching';

describe('SKILL_TO_CONTENT_TYPES mapping', () => {
  test('photography maps to photo', () => {
    expect(SKILL_TO_CONTENT_TYPES.photography).toContain('photo');
  });

  test('video_editing maps to video formats', () => {
    const types = SKILL_TO_CONTENT_TYPES.video_editing;
    expect(types).toContain('video_reel');
    expect(types).toContain('tiktok');
    expect(types).toContain('youtube_short');
  });

  test('other maps to empty array', () => {
    expect(SKILL_TO_CONTENT_TYPES.other).toEqual([]);
  });
});

describe('computeSkillScore', () => {
  test('returns 100 when all campaign types match creator skills', () => {
    const score = computeSkillScore(['photography'], ['photo']);
    expect(score).toBe(100);
  });

  test('returns 0 when no skills match', () => {
    const score = computeSkillScore(['copywriting'], ['photo']);
    expect(score).toBe(0);
  });

  test('returns 0 for empty creator skills', () => {
    const score = computeSkillScore([], ['photo', 'video_reel']);
    expect(score).toBe(0);
  });

  test('returns 0 for empty campaign content types', () => {
    const score = computeSkillScore(['photography'], []);
    expect(score).toBe(0);
  });

  test('broad-match skills score at 50%', () => {
    const score = computeSkillScore(['social_media_management'], ['photo']);
    expect(score).toBe(50);
  });

  test('partial overlap scores proportionally', () => {
    // photography matches photo but not video_reel
    const score = computeSkillScore(['photography'], ['photo', 'video_reel']);
    expect(score).toBe(50); // 1 of 2 matched
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/donnyMatching.test.ts`
Expected: FAIL — module `./donnyMatching` not found

- [ ] **Step 3: Implement skill mapping and skill score**

```typescript
// src/lib/donnyMatching.ts

import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

/**
 * Maps each creator skill to the campaign content_types it can fulfill.
 * Broad-match skills (social_media_management, content_strategy, influencer_marketing)
 * match all types but are weighted at 50% in scoring.
 */
export const SKILL_TO_CONTENT_TYPES: Record<CreatorSkill, string[]> = {
  photography: ['photo'],
  video_editing: ['video_reel', 'tiktok', 'youtube_short'],
  ugc_creation: ['video_reel', 'photo', 'story'],
  illustration: ['photo', 'carousel'],
  graphic_design: ['photo', 'carousel'],
  animation: ['video_reel', 'story'],
  copywriting: ['carousel', 'story'],
  social_media_management: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'],
  content_strategy: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'],
  influencer_marketing: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'],
  other: [],
};

const BROAD_MATCH_SKILLS: Set<CreatorSkill> = new Set([
  'social_media_management',
  'content_strategy',
  'influencer_marketing',
]);

/**
 * Score how well a creator's skills match a campaign's content types.
 * Returns 0-100. Broad-match skills are weighted at 50%.
 */
export function computeSkillScore(
  creatorSkills: CreatorSkill[],
  campaignContentTypes: string[],
): number {
  if (creatorSkills.length === 0 || campaignContentTypes.length === 0) return 0;

  // For each campaign content type, check if any creator skill covers it
  let matchedCount = 0;
  let broadMatchCount = 0;

  for (const contentType of campaignContentTypes) {
    let matched = false;
    let isBroadOnly = true;

    for (const skill of creatorSkills) {
      const mappedTypes = SKILL_TO_CONTENT_TYPES[skill];
      if (mappedTypes.includes(contentType)) {
        matched = true;
        if (!BROAD_MATCH_SKILLS.has(skill)) {
          isBroadOnly = false;
        }
      }
    }

    if (matched) {
      matchedCount += isBroadOnly ? 0.5 : 1;
    }
  }

  return Math.round((matchedCount / campaignContentTypes.length) * 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/donnyMatching.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Write failing tests for location, rating, availability scoring**

Add to `src/lib/donnyMatching.test.ts`:

```typescript
import {
  SKILL_TO_CONTENT_TYPES,
  computeSkillScore,
  computeLocationScore,
  computeRatingScore,
  computeAvailabilityScore,
} from './donnyMatching';

describe('computeLocationScore', () => {
  test('exact city match scores 100', () => {
    expect(computeLocationScore('Philadelphia', 'US', 'Philadelphia', 'US')).toBe(100);
  });

  test('case-insensitive city match scores 100', () => {
    expect(computeLocationScore('philadelphia', 'US', 'Philadelphia', 'us')).toBe(100);
  });

  test('same country different city scores 50', () => {
    expect(computeLocationScore('New York', 'US', 'Philadelphia', 'US')).toBe(50);
  });

  test('different country scores 0', () => {
    expect(computeLocationScore('London', 'UK', 'Philadelphia', 'US')).toBe(0);
  });

  test('null creator city returns 0', () => {
    expect(computeLocationScore(null, 'US', 'Philadelphia', 'US')).toBe(0);
  });

  test('null business city returns 0', () => {
    expect(computeLocationScore('Philadelphia', 'US', null, 'US')).toBe(0);
  });
});

describe('computeRatingScore', () => {
  test('5-star rating scores 100', () => {
    expect(computeRatingScore(5)).toBe(100);
  });

  test('null rating scores 50 (neutral)', () => {
    expect(computeRatingScore(null)).toBe(50);
  });

  test('3-star rating scores 60', () => {
    expect(computeRatingScore(3)).toBe(60);
  });
});

describe('computeAvailabilityScore', () => {
  test('0 active with max_projects 5 scores 100', () => {
    expect(computeAvailabilityScore(0, 5)).toBe(100);
  });

  test('3 active with max_projects 5 scores 40', () => {
    expect(computeAvailabilityScore(3, 5)).toBe(40);
  });

  test('5 active with max_projects 5 scores 0', () => {
    expect(computeAvailabilityScore(5, 5)).toBe(0);
  });

  test('null max_projects falls back: 0 active scores 100', () => {
    expect(computeAvailabilityScore(0, null)).toBe(100);
  });

  test('null max_projects falls back: 2 active scores 50', () => {
    expect(computeAvailabilityScore(2, null)).toBe(50);
  });

  test('null max_projects falls back: 3 active scores 0', () => {
    expect(computeAvailabilityScore(3, null)).toBe(0);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/lib/donnyMatching.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 7: Implement location, rating, availability scoring**

Add to `src/lib/donnyMatching.ts`:

```typescript
/**
 * Score location proximity via city string matching.
 * Exact city match = 100, same country = 50, else 0.
 */
export function computeLocationScore(
  creatorCity: string | null,
  creatorCountry: string | null,
  businessCity: string | null,
  businessCountry: string | null,
): number {
  if (!creatorCity || !businessCity) return 0;

  const cCity = creatorCity.trim().toLowerCase();
  const bCity = businessCity.trim().toLowerCase();
  const cCountry = (creatorCountry ?? '').trim().toLowerCase();
  const bCountry = (businessCountry ?? '').trim().toLowerCase();

  if (cCity === bCity && cCountry === bCountry) return 100;
  if (cCountry && bCountry && cCountry === bCountry) return 50;
  return 0;
}

/**
 * Score based on creator's average rating.
 * Null rating gets a neutral 50. Otherwise scaled from rating/5.
 */
export function computeRatingScore(averageRating: number | null): number {
  if (averageRating == null) return 50;
  return Math.round((averageRating / 5) * 100);
}

/**
 * Score based on creator availability.
 * Uses max_projects_per_month if available, otherwise hard thresholds.
 */
export function computeAvailabilityScore(
  activeCount: number,
  maxProjects: number | null,
): number {
  if (maxProjects != null && maxProjects > 0) {
    return Math.round(Math.max(0, (maxProjects - activeCount) / maxProjects) * 100);
  }
  // Fallback: hard thresholds
  if (activeCount < 2) return 100;
  if (activeCount === 2) return 50;
  return 0;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/donnyMatching.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Write failing tests for the composite scoring function**

Add to `src/lib/donnyMatching.test.ts`:

```typescript
import {
  // ... existing imports ...
  computeMatchScore,
} from './donnyMatching';

describe('computeMatchScore', () => {
  const baseCreator = {
    skills: ['photography' as CreatorSkill],
    city: 'Philadelphia',
    country: 'US',
    averageRating: 4.5,
    activeCount: 0,
    maxProjects: 5,
  };

  const baseCampaign = {
    contentTypes: ['photo'],
    businessCity: 'Philadelphia',
    businessCountry: 'US',
  };

  test('perfect match scores high', () => {
    const result = computeMatchScore(baseCreator, baseCampaign);
    expect(result.score).toBeGreaterThan(80);
    expect(result.matchReasons).toContain('Photography');
  });

  test('uses fallback weights when location data missing', () => {
    const noLocationCampaign = { ...baseCampaign, businessCity: null, businessCountry: null };
    const result = computeMatchScore(baseCreator, noLocationCampaign);
    // Should still produce a score (skills + rating + availability)
    expect(result.score).toBeGreaterThan(0);
  });

  test('no skills match scores low', () => {
    const noMatchCreator = { ...baseCreator, skills: ['copywriting' as CreatorSkill] };
    const result = computeMatchScore(noMatchCreator, baseCampaign);
    expect(result.score).toBeLessThan(60);
  });
});
```

You'll need to add `import type { Database } from '@/integrations/supabase/types'; type CreatorSkill = Database['public']['Enums']['creator_skill'];` at the top of the test file too.

- [ ] **Step 10: Implement composite scoring function**

Add to `src/lib/donnyMatching.ts`:

```typescript
export interface CreatorMatchInput {
  skills: CreatorSkill[];
  city: string | null;
  country: string | null;
  averageRating: number | null;
  activeCount: number;
  maxProjects: number | null;
}

export interface CampaignMatchInput {
  contentTypes: string[];
  businessCity: string | null;
  businessCountry: string | null;
}

export interface MatchResult {
  score: number;
  matchReasons: string[];
}

const SKILL_LABELS: Partial<Record<CreatorSkill, string>> = {
  photography: 'Photography',
  video_editing: 'Video Editing',
  ugc_creation: 'UGC Creation',
  illustration: 'Illustration',
  graphic_design: 'Graphic Design',
  animation: 'Animation',
  copywriting: 'Copywriting',
  social_media_management: 'Social Media',
  content_strategy: 'Content Strategy',
  influencer_marketing: 'Influencer Marketing',
};

/**
 * Compute overall match score for a creator-campaign pair.
 * With location: skills(0.4) + location(0.3) + rating(0.2) + availability(0.1)
 * Without location: skills(0.5) + rating(0.3) + availability(0.2)
 */
export function computeMatchScore(
  creator: CreatorMatchInput,
  campaign: CampaignMatchInput,
): MatchResult {
  const skillScore = computeSkillScore(creator.skills, campaign.contentTypes);
  const locationScore = computeLocationScore(
    creator.city, creator.country,
    campaign.businessCity, campaign.businessCountry,
  );
  const ratingScore = computeRatingScore(creator.averageRating);
  const availScore = computeAvailabilityScore(creator.activeCount, creator.maxProjects);

  const hasLocation = creator.city != null && campaign.businessCity != null;

  let score: number;
  if (hasLocation) {
    score = Math.round(
      skillScore * 0.4 + locationScore * 0.3 + ratingScore * 0.2 + availScore * 0.1
    );
  } else {
    score = Math.round(
      skillScore * 0.5 + ratingScore * 0.3 + availScore * 0.2
    );
  }

  // Build human-readable match reasons
  const matchReasons: string[] = [];
  for (const skill of creator.skills) {
    const mapped = SKILL_TO_CONTENT_TYPES[skill];
    if (campaign.contentTypes.some(ct => mapped.includes(ct))) {
      const label = SKILL_LABELS[skill] ?? skill;
      matchReasons.push(label);
    }
  }
  if (hasLocation && locationScore >= 50) {
    matchReasons.push(creator.city!);
  }

  return { score, matchReasons };
}
```

- [ ] **Step 11: Run all tests**

Run: `npx vitest run src/lib/donnyMatching.test.ts`
Expected: All tests PASS

- [ ] **Step 12: Commit**

```bash
git add src/lib/donnyMatching.ts src/lib/donnyMatching.test.ts
git commit -m "feat: add Donny matching algorithm — skill mapping, scoring, composite match"
```

---

### Task 2: Creator Match Profile Hook (`useCreatorMatchProfile.ts`)

**Files:**
- Create: `src/hooks/useCreatorMatchProfile.ts`

Fetches the logged-in creator's profile data and active collaboration count needed by the matching algorithm.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCreatorMatchProfile.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export interface CreatorMatchProfile {
  skills: CreatorSkill[];
  city: string | null;
  country: string | null;
  averageRating: number | null;
  maxProjects: number | null;
  activeCollabCount: number;
}

export const useCreatorMatchProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-match-profile', user?.id],
    queryFn: async (): Promise<CreatorMatchProfile | null> => {
      if (!user?.id) return null;

      // Fetch creator profile
      const { data: profile, error: profileError } = await supabase
        .from('creator_profiles')
        .select('skills, city, country, average_rating, max_projects_per_month')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) return null;

      // Fetch active collaboration count
      const { count, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'active');

      if (collabError) throw collabError;

      return {
        skills: (profile.skills ?? []) as CreatorSkill[],
        city: profile.city,
        country: profile.country,
        averageRating: profile.average_rating,
        maxProjects: profile.max_projects_per_month,
        activeCollabCount: count ?? 0,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes — profile data doesn't change often
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCreatorMatchProfile.ts
git commit -m "feat: add useCreatorMatchProfile hook for AI matching data"
```

---

### Task 3: Donny Matches Hook (`useDonnyMatches.ts`)

**Files:**
- Create: `src/hooks/useDonnyMatches.ts`

Combines creator profile + campaign list -> top 3 scored picks.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useDonnyMatches.ts

import { useMemo } from 'react';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreatorMatchProfile } from '@/hooks/useCreatorMatchProfile';
import { computeMatchScore, type MatchResult } from '@/lib/donnyMatching';

export interface DonnyPick {
  campaign: PublicCampaign;
  score: number;
  matchReasons: string[];
}

const MIN_SCORE = 40;
const MAX_PICKS = 3;

/**
 * Given a list of campaigns, returns the top Donny's Picks for the logged-in creator.
 * Returns empty array if no creator profile exists or no campaigns score above threshold.
 */
export const useDonnyMatches = (campaigns: PublicCampaign[]): DonnyPick[] => {
  const { data: profile } = useCreatorMatchProfile();

  return useMemo(() => {
    if (!profile) return [];
    if (campaigns.length === 0) return [];

    const scored: DonnyPick[] = campaigns.map((campaign) => {
      const result: MatchResult = computeMatchScore(
        {
          skills: profile.skills,
          city: profile.city,
          country: profile.country,
          averageRating: profile.averageRating,
          activeCount: profile.activeCollabCount,
          maxProjects: profile.maxProjects,
        },
        {
          contentTypes: campaign.content_types ?? [],
          businessCity: campaign.business_profile?.city ?? null,
          businessCountry: campaign.business_profile?.country ?? null,
        },
      );

      return {
        campaign,
        score: result.score,
        matchReasons: result.matchReasons,
      };
    });

    return scored
      .filter((p) => p.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PICKS);
  }, [profile, campaigns]);
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDonnyMatches.ts
git commit -m "feat: add useDonnyMatches hook — top 3 AI picks for creators"
```

---

### Task 4: Campaign Filters Hook (`useCampaignFilters.ts`)

**Files:**
- Create: `src/hooks/useCampaignFilters.ts`

Client-side filter/search/sort state and logic for the campaign list.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCampaignFilters.ts

import { useState, useMemo, useCallback } from 'react';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';

export type ContentTypeFilter = 'all' | 'photo' | 'reel' | 'story' | 'carousel';
export type DeliveryTierFilter = 'all' | 'dragonrush' | 'expedited' | 'standard';
export type SortOption = 'newest' | 'budget' | 'ending_soon';

const REEL_TYPES = ['video_reel', 'tiktok', 'youtube_short'];

export interface CampaignFilterState {
  searchTerm: string;
  contentType: ContentTypeFilter;
  deliveryTier: DeliveryTierFilter;
  sortBy: SortOption;
}

function matchesContentType(campaign: PublicCampaign, filter: ContentTypeFilter): boolean {
  if (filter === 'all') return true;
  const types = campaign.content_types ?? [];
  if (filter === 'reel') return types.some((t) => REEL_TYPES.includes(t));
  return types.includes(filter);
}

function matchesDeliveryTier(campaign: PublicCampaign, filter: DeliveryTierFilter): boolean {
  if (filter === 'all') return true;
  return campaign.delivery_type === filter;
}

function matchesSearch(campaign: PublicCampaign, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  return (
    campaign.title.toLowerCase().includes(lower) ||
    (campaign.description ?? '').toLowerCase().includes(lower) ||
    (campaign.business_profile?.business_name ?? '').toLowerCase().includes(lower)
  );
}

function getBudgetValue(campaign: PublicCampaign): number {
  return campaign.fixed_price ?? campaign.budget_max ?? 0;
}

function sortCampaigns(campaigns: PublicCampaign[], sortBy: SortOption): PublicCampaign[] {
  return [...campaigns].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'budget':
        return getBudgetValue(b) - getBudgetValue(a);
      case 'ending_soon': {
        const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aDeadline - bDeadline;
      }
      default:
        return 0;
    }
  });
}

export const useCampaignFilters = (campaigns: PublicCampaign[]) => {
  const [filters, setFilters] = useState<CampaignFilterState>({
    searchTerm: '',
    contentType: 'all',
    deliveryTier: 'all',
    sortBy: 'newest',
  });

  const setSearchTerm = useCallback((term: string) => {
    setFilters((prev) => ({ ...prev, searchTerm: term }));
  }, []);

  const setContentType = useCallback((ct: ContentTypeFilter) => {
    setFilters((prev) => ({ ...prev, contentType: ct }));
  }, []);

  const setDeliveryTier = useCallback((dt: DeliveryTierFilter) => {
    setFilters((prev) => ({ ...prev, deliveryTier: dt }));
  }, []);

  const setSortBy = useCallback((sort: SortOption) => {
    setFilters((prev) => ({ ...prev, sortBy: sort }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ searchTerm: '', contentType: 'all', deliveryTier: 'all', sortBy: 'newest' });
  }, []);

  const hasActiveFilters = filters.searchTerm !== '' ||
    filters.contentType !== 'all' ||
    filters.deliveryTier !== 'all';

  const filteredCampaigns = useMemo(() => {
    const filtered = campaigns.filter(
      (c) =>
        matchesSearch(c, filters.searchTerm) &&
        matchesContentType(c, filters.contentType) &&
        matchesDeliveryTier(c, filters.deliveryTier),
    );
    return sortCampaigns(filtered, filters.sortBy);
  }, [campaigns, filters]);

  return {
    filters,
    filteredCampaigns,
    hasActiveFilters,
    setSearchTerm,
    setContentType,
    setDeliveryTier,
    setSortBy,
    clearFilters,
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCampaignFilters.ts
git commit -m "feat: add useCampaignFilters hook — search, content type, delivery tier, sort"
```

---

### Task 5: Search & Filter Pills UI (`CampaignSearchFilters.tsx`)

**Files:**
- Create: `src/components/campaigns/CampaignSearchFilters.tsx`

Mobile-first compact search bar + filter pill rows.

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/CampaignSearchFilters.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  ContentTypeFilter,
  DeliveryTierFilter,
  SortOption,
  CampaignFilterState,
} from '@/hooks/useCampaignFilters';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

interface CampaignSearchFiltersProps {
  filters: CampaignFilterState;
  filteredCount: number;
  hasActiveFilters: boolean;
  onSearchChange: (term: string) => void;
  onContentTypeChange: (ct: ContentTypeFilter) => void;
  onDeliveryTierChange: (dt: DeliveryTierFilter) => void;
  onSortChange: (sort: SortOption) => void;
  onClearFilters: () => void;
}

const CONTENT_TYPE_PILLS: { value: ContentTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photo', label: 'Photo' },
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'carousel', label: 'Carousel' },
];

const DELIVERY_TIER_PILLS: { value: DeliveryTierFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'dragonrush', label: 'DragonDash ⚡' },
  { value: 'expedited', label: 'Express' },
  { value: 'standard', label: 'Standard' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'budget', label: 'Highest Budget' },
  { value: 'ending_soon', label: 'Ending Soon' },
];

export const CampaignSearchFilters: React.FC<CampaignSearchFiltersProps> = ({
  filters,
  filteredCount,
  hasActiveFilters,
  onSearchChange,
  onContentTypeChange,
  onDeliveryTierChange,
  onSortChange,
  onClearFilters,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.searchTerm);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Sync local search with external clear
  useEffect(() => {
    setLocalSearch(filters.searchTerm);
  }, [filters.searchTerm]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleSearchInput = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 300);
  };

  return (
    <div className="px-4 pt-3 pb-2 space-y-2">
      {/* Search row */}
      <div className="flex items-center gap-2">
        {searchOpen ? (
          <div className="flex-1 relative">
            <img src={logo} alt="" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search campaigns..."
              value={localSearch}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-full bg-white text-sm text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-dc-teal"
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                onSearchChange('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 hover:border-dc-teal transition-colors"
            >
              <Search className="w-4 h-4 text-gray-500" />
            </button>
            {/* Content type pills */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {CONTENT_TYPE_PILLS.map((pill) => (
                <button
                  key={pill.value}
                  onClick={() => onContentTypeChange(pill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.contentType === pill.value
                      ? 'bg-dc-teal text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-teal'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </>
        )}
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 hover:border-dc-teal transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>

      {/* Content type pills shown below search when search is open */}
      {searchOpen && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {CONTENT_TYPE_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => onContentTypeChange(pill.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                filters.contentType === pill.value
                  ? 'bg-dc-teal text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-teal'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      )}

      {/* Expanded section: delivery tier + sort */}
      {expanded && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {DELIVERY_TIER_PILLS.map((pill) => (
              <button
                key={pill.value}
                onClick={() => onDeliveryTierChange(pill.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  filters.deliveryTier === pill.value
                    ? 'bg-dc-pink text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-pink'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <select
              value={filters.sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-dc-teal"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="text-xs text-dc-pink-accent font-semibold hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Campaign count */}
      <p className="text-xs text-white/60 px-1">
        {filteredCount} campaign{filteredCount !== 1 ? 's' : ''} available
      </p>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaigns/CampaignSearchFilters.tsx
git commit -m "feat: add CampaignSearchFilters — compact mobile-first search and filter pills"
```

---

### Task 6: Donny Picks Badge & Desktop Row Components

**Files:**
- Create: `src/components/campaigns/DonnyPicksBadge.tsx`
- Create: `src/components/campaigns/DonnyPicksRow.tsx`

- [ ] **Step 1: Create the badge component**

```typescript
// src/components/campaigns/DonnyPicksBadge.tsx

import React from 'react';

interface DonnyPicksBadgeProps {
  score: number;
}

export const DonnyPicksBadge: React.FC<DonnyPicksBadgeProps> = ({ score }) => {
  return (
    <div className="flex items-center gap-1 bg-dc-teal rounded-full px-2.5 py-1 shadow-sm">
      <span className="text-[10px]">🎯</span>
      <span className="text-white text-xs font-bold">{score}% Match</span>
    </div>
  );
};
```

- [ ] **Step 2: Create the desktop picks row**

```typescript
// src/components/campaigns/DonnyPicksRow.tsx

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DonnyPicksBadge } from './DonnyPicksBadge';
import { formatBudget } from '@/lib/campaignUtils';
import type { DonnyPick } from '@/hooks/useDonnyMatches';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

interface DonnyPicksRowProps {
  picks: DonnyPick[];
  onViewDetail: (campaign: PublicCampaign) => void;
}

export const DonnyPicksRow: React.FC<DonnyPicksRowProps> = ({ picks, onViewDetail }) => {
  if (picks.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <img src={logo} alt="" className="w-6 h-6" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">Donny's Picks for You</h2>
          <p className="text-[11px] text-gray-500">Matched based on your skills, location, and ratings</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {picks.map((pick) => (
          <Card
            key={pick.campaign.id}
            className="min-w-[280px] max-w-[320px] flex-shrink-0 hover:shadow-lg transition-shadow cursor-pointer border-2 border-dc-teal/30 hover:border-dc-teal"
            onClick={() => onViewDetail(pick.campaign)}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 flex-1 mr-2">
                  {pick.campaign.title}
                </h3>
                <DonnyPicksBadge score={pick.score} />
              </div>
              {pick.campaign.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{pick.campaign.description}</p>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-sm text-dc-teal font-semibold">{formatBudget(pick.campaign)}</span>
                {pick.campaign.business_profile?.business_name && (
                  <span className="text-xs text-gray-400">by {pick.campaign.business_profile.business_name}</span>
                )}
              </div>
              {pick.matchReasons.length > 0 && (
                <p className="text-[10px] text-gray-400">
                  Matches your: {pick.matchReasons.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/DonnyPicksBadge.tsx src/components/campaigns/DonnyPicksRow.tsx
git commit -m "feat: add DonnyPicksBadge and DonnyPicksRow components"
```

---

### Task 7: Modify CampaignSwipeCard to Support Match Badge

**Files:**
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx`

Add optional `matchScores` prop — a map of campaign ID to `DonnyPick` data. When a campaign has a match score, render the `DonnyPicksBadge` overlay on the card.

- [ ] **Step 1: Update the component props and render**

In `src/components/campaigns/CampaignSwipeCard.tsx`:

1. Add import: `import { DonnyPicksBadge } from './DonnyPicksBadge';`

2. Add to `CampaignSwipeCardProps`:
```typescript
matchScores?: Map<string, { score: number; matchReasons: string[] }>;
```

3. Pass `matchScores` through to `CardContent`:
```typescript
// In the CampaignSwipeCard component, where CardContent is rendered:
<CardContent campaign={campaign} onViewDetail={onViewDetail} matchInfo={matchScores?.get(campaign.id)} />
```

4. Add to `CardContentProps`:
```typescript
matchInfo?: { score: number; matchReasons: string[] };
```

5. In `CardContent`, add the badge overlay inside the hero image area, right after the existing applicant count badge (around line 199):
```typescript
{/* Donny's Pick badge — top-left, below applicant count */}
{matchInfo && (
  <div className="absolute top-3 left-3 z-10" style={applicantCount > 0 ? { top: '2.75rem' } : undefined}>
    <DonnyPicksBadge score={matchInfo.score} />
  </div>
)}
```

6. Add match reasons display at the bottom of card body, before the CTA button:
```typescript
{matchInfo && matchInfo.matchReasons.length > 0 && (
  <p className="text-[10px] text-gray-400 mt-1 flex-shrink-0">
    Matches your: {matchInfo.matchReasons.join(', ')}
  </p>
)}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignSwipeCard.tsx
git commit -m "feat: CampaignSwipeCard accepts optional match score badge overlay"
```

---

### Task 8: Wire Everything into CreatorCampaignMarketplace

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

This is the integration task. Wire up filters, Donny's Picks, and the modified swipe card.

- [ ] **Step 1: Add imports**

Add at the top of `CreatorCampaignMarketplace.tsx`:

```typescript
import { useCampaignFilters } from '@/hooks/useCampaignFilters';
import { useDonnyMatches, type DonnyPick } from '@/hooks/useDonnyMatches';
import { CampaignSearchFilters } from '@/components/campaigns/CampaignSearchFilters';
import { DonnyPicksRow } from '@/components/campaigns/DonnyPicksRow';
```

- [ ] **Step 2: Add filter and matching hooks**

Inside the component, after the existing hook calls and before state declarations:

```typescript
// Filter and search
const {
  filters,
  filteredCampaigns: filteredBySearch,
  hasActiveFilters,
  setSearchTerm,
  setContentType,
  setDeliveryTier,
  setSortBy,
  clearFilters,
} = useCampaignFilters(campaigns);

// AI matching — runs against filtered campaigns
const donnyPicks = useDonnyMatches(filteredBySearch);
```

- [ ] **Step 3: Update availableCampaigns derivation**

Replace the existing `availableCampaigns` const (line ~42-44):

```typescript
// Old:
// const availableCampaigns = campaigns.filter(
//   (c) => !c.user_applied && !skippedIds.has(c.id)
// );

// New: filter from the search-filtered list, exclude applied and skipped
const donnyPickIds = new Set(donnyPicks.map((p) => p.campaign.id));

const availableCampaigns = filteredBySearch.filter(
  (c) => !c.user_applied && !skippedIds.has(c.id) && !donnyPickIds.has(c.id)
);

// Build the mobile swipe list: Donny's Picks first, then regular campaigns
const swipeCampaigns = [
  ...donnyPicks.map((p) => p.campaign),
  ...availableCampaigns,
];

// Build match scores map for the swipe card badge overlay
const matchScoresMap = new Map(
  donnyPicks.map((p) => [p.campaign.id, { score: p.score, matchReasons: p.matchReasons }])
);
```

- [ ] **Step 4: Add search filters UI**

In the JSX, between the Tab Bar and the `{activeTab === 'available' && (` section, add the filters. Place it inside the `available` tab content, before the swipe card:

```typescript
{activeTab === 'available' && (
  <>
    {/* Search & Filters */}
    <CampaignSearchFilters
      filters={filters}
      filteredCount={filteredBySearch.filter((c) => !c.user_applied).length}
      hasActiveFilters={hasActiveFilters}
      onSearchChange={setSearchTerm}
      onContentTypeChange={setContentType}
      onDeliveryTierChange={setDeliveryTier}
      onSortChange={setSortBy}
      onClearFilters={clearFilters}
    />

    {/* Swipe card stack — mobile */}
    <div className="flex-1 px-4 pb-4 md:hidden">
      ...
```

- [ ] **Step 5: Update mobile swipe card to use swipeCampaigns and matchScoresMap**

Replace the `CampaignSwipeCard` usage in the mobile section:

```typescript
<CampaignSwipeCard
  campaigns={swipeCampaigns}
  onSwipe={handleSwipe}
  onViewDetail={handleViewDetail}
  matchScores={matchScoresMap}
/>
```

Update the swipe hint text count and the "Skip / View Details" hints to reference `swipeCampaigns`:

```typescript
{swipeCampaigns.length > 0 && (
```

- [ ] **Step 6: Update desktop grid to include Donny's Picks row**

In the desktop grid section (`hidden md:block`), add `DonnyPicksRow` above the grid:

```typescript
<div className="hidden md:block px-4 pb-8 pt-4">
  {/* Donny's Picks */}
  <div className="max-w-6xl mx-auto">
    <DonnyPicksRow picks={donnyPicks} onViewDetail={handleViewDetail} />
  </div>

  {availableCampaigns.length === 0 && donnyPicks.length === 0 ? (
    // existing empty state ...
```

Update the empty state condition to also check `donnyPicks.length` since picks are shown separately.

- [ ] **Step 7: Add empty state for filters with no results**

Add a filtered empty state inside the available tab, after the swipe card section on mobile and inside the grid on desktop:

```typescript
{/* No results with filters active */}
{filteredBySearch.filter((c) => !c.user_applied).length === 0 && hasActiveFilters && (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <p className="text-white font-semibold mb-2">No campaigns found</p>
    <p className="text-white/60 text-sm mb-4">Try different filters or check back soon.</p>
    <button
      onClick={clearFilters}
      className="rounded-full bg-dc-teal text-white text-sm font-bold px-6 py-2 hover:bg-dc-teal-dark transition-colors"
    >
      Clear filters
    </button>
  </div>
)}
```

- [ ] **Step 8: Update campaign count in the header**

Update the existing campaign count in the page header (line ~119) to use the filtered count:

```typescript
<span className="text-xs text-gray-600">
  {filteredBySearch.filter((c) => !c.user_applied).length} campaign{filteredBySearch.filter((c) => !c.user_applied).length !== 1 ? 's' : ''} available
</span>
```

- [ ] **Step 9: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 10: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (existing + new donnyMatching tests)

- [ ] **Step 11: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 12: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "creator-campaigns: search, filters, and AI matching"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Clean build, no warnings related to new code

- [ ] **Step 3: Verify no business page changes**

Run: `git diff 98edd44 -- src/pages/Business* src/components/business*`
Expected: No output (no business pages modified)

- [ ] **Step 4: Verify lg: classes preserved**

Run: `git diff 98edd44 -- src/pages/CreatorCampaignMarketplace.tsx | grep "^-.*lg:"` 
Expected: No removed lg: classes (only additions)
