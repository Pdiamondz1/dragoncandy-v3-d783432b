# First-Run Experience & Feed Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build progressive-disclosure onboarding for all 3 roles (restaurant, creator, brand), embed Dragon Feed as a style reference in Campaign Creator, and refactor the tour system to on-demand.

**Architecture:** State-machine approach with `first_run_missions` JSONB on `profiles` table. Conditional rendering in dashboard components shows minimal first-run UI until all missions complete. InspirationStrip component embeds Dragon Feed content inside the campaign creation DropScreen. Tour system demoted from auto-fire to manual trigger via `?` button.

**Tech Stack:** React + TypeScript, Supabase (Postgres, Edge Functions), Tailwind CSS, React Query

**Spec:** `docs/superpowers/specs/2026-05-09-first-run-experience-and-feed-integration-design.md`

---

## File Structure

### New Files

| Path | Responsibility |
|------|---------------|
| `supabase/migrations/20260509200000_first_run_missions.sql` | DB migration: add column + backfill existing users |
| `src/hooks/useFirstRunMissions.ts` | Read/update `first_run_missions` state, mission completion logic |
| `src/hooks/useInspirationStrip.ts` | Fetch Dragon Feed items ordered by likes-first, limited to 8 |
| `src/components/first-run/FirstRunDashboard.tsx` | Shell: renders hero card + mission list based on role |
| `src/components/first-run/FirstRunHero.tsx` | Gradient hero card with role-specific copy/CTA |
| `src/components/first-run/MissionChecklist.tsx` | Mission list with active/locked/completed states |
| `src/components/first-run/MissionItem.tsx` | Single mission row with emoji, title, subtitle, status |
| `src/components/campaign-creator/InspirationStrip.tsx` | Horizontal scrollable feed strip for campaign creator |
| `src/components/campaign-creator/InspirationBadge.tsx` | "Inspired by" badge on Launchpad screen |
| `src/types/firstRun.ts` | TypeScript types for missions, role mapping, InspirationRef |

### Modified Files

| Path | Change |
|------|--------|
| `src/pages/BusinessDashboard.tsx` | Wrap in first-run conditional render |
| `src/pages/CreatorDashboard.tsx` | Wrap in first-run conditional render |
| `src/pages/BrandDashboard.tsx` | Wrap in first-run conditional render |
| `src/components/campaign-creator/DropScreen.tsx` | Add InspirationStrip below input options |
| `src/hooks/useCampaignCreator.ts` | Accept `inspiration_refs` and pass to edge function |
| `src/types/campaignCreator.ts` | Add `InspirationRef` to `DonnyGenerateRequest` |
| `src/hooks/useTour.ts` | Remove auto-fire, expose `triggerTour` for manual use |
| `src/components/guidance/DCTour.tsx` | No auto-show; only renders when explicitly triggered |
| `supabase/functions/donny-campaign-generate/index.ts` | Accept and use `inspiration_refs` in prompt |
| `docs/PROJECT_CONTEXT.md` | Add first-run workstream and design principle |
| `CLAUDE.md` | Add new DB column and component references |

---

## Task 1: Types & Data Model

**Files:**
- Create: `src/types/firstRun.ts`
- Create: `supabase/migrations/20260509200000_first_run_missions.sql`

- [ ] **Step 1: Create TypeScript types**

Create `src/types/firstRun.ts`:

```typescript
import type { Json } from '@/integrations/supabase/types';

export type UserRole = 'business_client' | 'content_creator' | 'brand';

export interface RestaurantMissions {
  browse_inspiration: boolean;
  create_campaign: boolean;
  launch_campaign: boolean;
  completed_at?: string;
}

export interface CreatorMissions {
  view_campaigns: boolean;
  add_portfolio: boolean;
  apply_campaign: boolean;
  completed_at?: string;
}

export interface BrandMissions {
  select_style: boolean;
  browse_creators: boolean;
  create_sponsorship: boolean;
  completed_at?: string;
}

export type RoleMissions = RestaurantMissions | CreatorMissions | BrandMissions;

export interface InspirationRef {
  media_url: string;
  creator_name: string;
  content_label: string;
  media_type: 'image' | 'video';
}

export function parseFirstRunMissions(
  json: Json | null,
  role: UserRole
): RoleMissions | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  if (obj.completed_at) return obj as unknown as RoleMissions;

  switch (role) {
    case 'business_client':
      if ('browse_inspiration' in obj) return obj as unknown as RestaurantMissions;
      break;
    case 'content_creator':
      if ('view_campaigns' in obj) return obj as unknown as CreatorMissions;
      break;
    case 'brand':
      if ('select_style' in obj) return obj as unknown as BrandMissions;
      break;
  }
  return null;
}

export function getInitialMissions(role: UserRole): RoleMissions {
  switch (role) {
    case 'business_client':
      return { browse_inspiration: false, create_campaign: false, launch_campaign: false };
    case 'content_creator':
      return { view_campaigns: false, add_portfolio: false, apply_campaign: false };
    case 'brand':
      return { select_style: false, browse_creators: false, create_sponsorship: false };
  }
}

export function areMissionsComplete(missions: RoleMissions): boolean {
  if ('completed_at' in missions && missions.completed_at) return true;
  const { completed_at, ...flags } = missions as Record<string, unknown>;
  return Object.values(flags).every((v) => v === true);
}

export const BRAND_CONTENT_STYLES = [
  'UGC Reels',
  'Flat-lay Product',
  'Behind the Scenes',
  'Event Coverage',
  'Food Photography',
  'Lifestyle',
  'Testimonial',
  'Unboxing',
] as const;
```

- [ ] **Step 2: Create database migration**

Create `supabase/migrations/20260509200000_first_run_missions.sql`:

```sql
-- Add first_run_missions JSONB column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_run_missions JSONB DEFAULT NULL;

-- Backfill all existing users so they never see the first-run experience
UPDATE profiles
SET first_run_missions = '{"completed_at": "migrated"}'::jsonb
WHERE created_at < NOW();

-- Index for querying users in first-run state
CREATE INDEX IF NOT EXISTS idx_profiles_first_run_active
ON profiles ((first_run_missions IS NULL OR first_run_missions->>'completed_at' IS NULL))
WHERE first_run_missions IS NULL OR first_run_missions->>'completed_at' IS NULL;
```

- [ ] **Step 3: Apply migration**

Run: `npx supabase migration up` or apply via Supabase MCP tool.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors (types are standalone, migration is SQL-only)

- [ ] **Step 5: Commit**

```bash
git add src/types/firstRun.ts supabase/migrations/20260509200000_first_run_missions.sql
git commit -m "feat: add first-run missions types and database migration"
```

---

## Task 2: useFirstRunMissions Hook

**Files:**
- Create: `src/hooks/useFirstRunMissions.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useFirstRunMissions.ts`:

```typescript
import { useCallback, useEffect } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  type UserRole,
  type RoleMissions,
  parseFirstRunMissions,
  getInitialMissions,
  areMissionsComplete,
} from '@/types/firstRun';

export function useFirstRunMissions() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const role = profile?.role as UserRole | undefined;

  const { data: missions, isLoading } = useQuery({
    queryKey: ['first-run-missions', user?.id],
    queryFn: async () => {
      if (!user?.id || !role) return null;
      const { data } = await supabase
        .from('profiles')
        .select('first_run_missions')
        .eq('id', user.id)
        .single();
      return parseFirstRunMissions(data?.first_run_missions ?? null, role);
    },
    enabled: !!user?.id && !!role,
  });

  const updateMutation = useMutation({
    mutationFn: async (updated: RoleMissions) => {
      if (!user?.id) throw new Error('No user');
      const { error } = await supabase
        .from('profiles')
        .update({ first_run_missions: updated as unknown as Record<string, unknown> })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['first-run-missions', user?.id] });
    },
  });

  // Initialize missions on first dashboard visit if null
  useEffect(() => {
    if (!user?.id || !role || isLoading) return;
    if (missions === null) {
      const initial = getInitialMissions(role);
      updateMutation.mutate(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role, missions, isLoading]);
  // updateMutation is stable (from useMutation) but ESLint doesn't know that

  const completeMission = useCallback(
    (key: string) => {
      if (!missions || missions.completed_at) return;
      const updated = { ...missions, [key]: true };
      if (areMissionsComplete(updated)) {
        (updated as Record<string, unknown>).completed_at = new Date().toISOString();
      }
      updateMutation.mutate(updated as RoleMissions);

      // Track analytics
      supabase.from('analytics_events').insert({
        event_type: areMissionsComplete(updated)
          ? 'first_run_all_complete'
          : 'first_run_mission_complete',
        user_id: user!.id,
        event_data: { role, mission_key: key },
        page_url: window.location.pathname,
      });
    },
    [missions, user?.id, role]
  );

  const skipMissions = useCallback(() => {
    if (!user?.id) return;
    const skipped = { ...(missions ?? getInitialMissions(role!)), completed_at: new Date().toISOString() };
    updateMutation.mutate(skipped as RoleMissions);
    supabase.from('analytics_events').insert({
      event_type: 'first_run_skipped',
      user_id: user.id,
      event_data: { role },
      page_url: window.location.pathname,
    });
  }, [missions, user?.id, role]);

  const isFirstRun = !!missions && !missions.completed_at;

  return {
    missions,
    isFirstRun,
    isLoading,
    completeMission,
    skipMissions,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFirstRunMissions.ts
git commit -m "feat: add useFirstRunMissions hook with state machine logic"
```

---

## Task 3: First-Run Dashboard Components

**Files:**
- Create: `src/components/first-run/FirstRunHero.tsx`
- Create: `src/components/first-run/MissionItem.tsx`
- Create: `src/components/first-run/MissionChecklist.tsx`
- Create: `src/components/first-run/FirstRunDashboard.tsx`

- [ ] **Step 1: Create FirstRunHero**

Create `src/components/first-run/FirstRunHero.tsx`:

```typescript
import type { UserRole } from '@/types/firstRun';

interface FirstRunHeroProps {
  name: string;
  role: UserRole;
  onCtaClick: () => void;
}

const HERO_CONFIG: Record<UserRole, {
  gradient: string;
  emoji: string;
  subtitle: string;
  cta: string;
  decoration: string;
}> = {
  business_client: {
    gradient: 'from-teal-400 via-emerald-400 to-pink-300',
    emoji: '🐉',
    subtitle: "Let's get creators knocking on your door.\n60 seconds. We'll do the heavy lifting.",
    cta: 'Create Your First Campaign ✨',
    decoration: '✨',
  },
  content_creator: {
    gradient: 'from-teal-400 via-teal-300 to-pink-300',
    emoji: '🎬',
    subtitle: "Brands are looking for creators like you.\nLet's get you booked on your first campaign.",
    cta: 'See Campaigns For You 👀',
    decoration: '✨',
  },
  brand: {
    gradient: 'from-pink-500 via-pink-300 to-teal-400',
    emoji: '🏢',
    subtitle: "Let's connect you with creators who\nget your brand. Under 60 seconds.",
    cta: 'Find Your Creators 🎯',
    decoration: '🍬',
  },
};

export function FirstRunHero({ name, role, onCtaClick }: FirstRunHeroProps) {
  const config = HERO_CONFIG[role];

  return (
    <div className={`bg-gradient-to-br ${config.gradient} rounded-3xl p-6 text-center relative overflow-hidden mb-4`}>
      <div className="absolute top-3 right-4 text-base opacity-50">{config.decoration}</div>
      <div className="text-3xl mb-2">{config.emoji}</div>
      <h1 className="text-xl font-bold text-white mb-1">
        Welcome, {name}!
      </h1>
      <p className="text-sm text-white/90 mb-5 whitespace-pre-line">
        {config.subtitle}
      </p>
      <button
        onClick={onCtaClick}
        className="bg-white text-gray-900 font-bold py-3 px-7 rounded-full text-sm shadow-lg hover:shadow-xl transition-shadow"
      >
        {config.cta}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create MissionItem**

Create `src/components/first-run/MissionItem.tsx`:

```typescript
interface MissionItemProps {
  emoji: string;
  title: string;
  subtitle: string;
  status: 'active' | 'locked' | 'completed';
  onGo?: () => void;
  accentColor?: 'teal' | 'pink';
}

const ACCENT_STYLES = {
  teal: { active: 'bg-teal-50 border border-teal-200', go: 'text-teal-500' },
  pink: { active: 'bg-pink-50 border border-pink-200', go: 'text-pink-500' },
};

export function MissionItem({ emoji, title, subtitle, status, onGo, accentColor = 'teal' }: MissionItemProps) {
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isLocked = status === 'locked';
  const accent = ACCENT_STYLES[accentColor];

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
        isActive
          ? accent.active
          : isCompleted
          ? 'bg-green-50 border border-green-200'
          : 'opacity-50'
      }`}
    >
      <div className="text-lg">{isCompleted ? '✅' : emoji}</div>
      <div className="flex-1">
        <div className={`text-sm font-semibold ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>
          {title}
        </div>
        <div className={`text-xs ${isLocked ? 'text-gray-300' : 'text-gray-500'}`}>
          {subtitle}
        </div>
      </div>
      {isActive && onGo && (
        <button
          onClick={onGo}
          className={`text-xs font-bold ${accent.go}`}
        >
          GO
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create MissionChecklist**

Create `src/components/first-run/MissionChecklist.tsx`:

```typescript
import { MissionItem } from './MissionItem';
import type { UserRole, RoleMissions } from '@/types/firstRun';

interface MissionChecklistProps {
  role: UserRole;
  missions: RoleMissions;
  onMissionGo: (missionKey: string) => void;
  onSkip: () => void;
}

interface MissionDef {
  key: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const MISSION_DEFS: Record<UserRole, MissionDef[]> = {
  business_client: [
    { key: 'browse_inspiration', emoji: '👀', title: 'Get inspired', subtitle: 'See what creators are making' },
    { key: 'create_campaign', emoji: '🪄', title: 'Create with Donny', subtitle: 'Donny does the work' },
    { key: 'launch_campaign', emoji: '🚀', title: 'Launch & attract creators', subtitle: 'Creators start applying' },
  ],
  content_creator: [
    { key: 'view_campaigns', emoji: '👀', title: 'See what\'s out there', subtitle: 'Campaigns matched to your skills' },
    { key: 'add_portfolio', emoji: '📸', title: 'Show your best work', subtitle: 'Add 1 portfolio piece' },
    { key: 'apply_campaign', emoji: '🚀', title: 'Apply to a campaign', subtitle: 'Your first pitch' },
  ],
  brand: [
    { key: 'select_style', emoji: '🎨', title: 'Pick your vibe', subtitle: 'What content style fits your brand?' },
    { key: 'browse_creators', emoji: '🔍', title: 'Meet your matches', subtitle: 'Creators who fit your style' },
    { key: 'create_sponsorship', emoji: '💰', title: 'Sponsor a campaign', subtitle: 'Your first brand deal' },
  ],
};

function getMissionStatus(
  missions: RoleMissions,
  missionKey: string,
  defs: MissionDef[]
): 'active' | 'locked' | 'completed' {
  const value = (missions as Record<string, unknown>)[missionKey];
  if (value === true) return 'completed';

  const idx = defs.findIndex((d) => d.key === missionKey);
  if (idx === 0) return 'active';

  const prevKey = defs[idx - 1].key;
  const prevDone = (missions as Record<string, unknown>)[prevKey] === true;
  return prevDone ? 'active' : 'locked';
}

export function MissionChecklist({ role, missions, onMissionGo, onSkip }: MissionChecklistProps) {
  const defs = MISSION_DEFS[role];
  const accentColor = role === 'brand' ? 'pink' : 'teal';
  const completedCount = defs.filter((d) => (missions as Record<string, unknown>)[d.key] === true).length;

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-gray-900">Your Missions</span>
        <span className={`text-xs font-semibold ${accentColor === 'pink' ? 'text-pink-500' : 'text-teal-500'}`}>
          {completedCount} / {defs.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {defs.map((def) => {
          const status = getMissionStatus(missions, def.key, defs);
          return (
            <MissionItem
              key={def.key}
              emoji={def.emoji}
              title={def.title}
              subtitle={def.subtitle}
              status={status}
              accentColor={accentColor}
              onGo={status === 'active' ? () => onMissionGo(def.key) : undefined}
            />
          );
        })}
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center text-xs text-gray-400 mt-4 hover:text-gray-600 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create FirstRunDashboard**

Create `src/components/first-run/FirstRunDashboard.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { FirstRunHero } from './FirstRunHero';
import { MissionChecklist } from './MissionChecklist';
import type { UserRole, RoleMissions } from '@/types/firstRun';

interface FirstRunDashboardProps {
  role: UserRole;
  missions: RoleMissions;
  onCompleteMission: (key: string) => void;
  onSkip: () => void;
}

export function FirstRunDashboard({ role, missions, onCompleteMission, onSkip }: FirstRunDashboardProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const displayName =
    profile?.business_name || profile?.creator_name || profile?.full_name || 'there';

  const handleCtaClick = () => {
    switch (role) {
      case 'business_client':
        navigate('/dashboard/business/campaigns/create');
        break;
      case 'content_creator':
        navigate('/dashboard/creator/campaigns');
        break;
      case 'brand':
        navigate('/dashboard/brand/style-picker'); // New route added in Task 8
        break;
    }
  };

  const handleMissionGo = (key: string) => {
    switch (key) {
      case 'browse_inspiration':
      case 'create_campaign':
      case 'launch_campaign':
        navigate('/dashboard/business/campaigns/create');
        break;
      case 'view_campaigns':
      case 'apply_campaign':
        navigate('/dashboard/creator/campaigns');
        break;
      case 'add_portfolio':
        navigate('/dashboard/creator/settings'); // Portfolio section lives in settings
        break;
      case 'select_style':
        navigate('/dashboard/brand/style-picker'); // New route added in Task 8
        break;
      case 'browse_creators':
        navigate('/dashboard/brand/creators');
        break;
      case 'create_sponsorship':
        navigate('/dashboard/brand/campaigns/create');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-400 p-4">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-bold text-teal-400">🐉 DragonCandy</span>
        <button
          className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center text-xs text-white"
          aria-label="Help tour"
        >
          ?
        </button>
      </div>

      <FirstRunHero name={displayName} role={role} onCtaClick={handleCtaClick} />
      <MissionChecklist
        role={role}
        missions={missions}
        onMissionGo={handleMissionGo}
        onSkip={onSkip}
      />

      <p className="text-center text-xs text-gray-500 mt-4">
        Takes about 60 seconds total ⚡
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/first-run/
git commit -m "feat: add FirstRunDashboard, hero, and mission checklist components"
```

---

## Task 4: Wire First-Run into Dashboard Pages

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: `src/pages/CreatorDashboard.tsx`
- Modify: `src/pages/BrandDashboard.tsx`

- [ ] **Step 1: Add first-run gate to BusinessDashboard**

At top of `BusinessDashboard.tsx`, add imports:

```typescript
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
```

Inside the component, before the existing return, add:

```typescript
const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

if (isFirstRun && missions) {
  return (
    <FirstRunDashboard
      role="business_client"
      missions={missions}
      onCompleteMission={completeMission}
      onSkip={skipMissions}
    />
  );
}
```

- [ ] **Step 2: Add first-run gate to CreatorDashboard**

Same pattern in `CreatorDashboard.tsx`:

```typescript
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';

// Inside component:
const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

if (isFirstRun && missions) {
  return (
    <FirstRunDashboard
      role="content_creator"
      missions={missions}
      onCompleteMission={completeMission}
      onSkip={skipMissions}
    />
  );
}
```

- [ ] **Step 3: Add first-run gate to BrandDashboard**

Same pattern in `BrandDashboard.tsx`:

```typescript
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';

// Inside component:
const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

if (isFirstRun && missions) {
  return (
    <FirstRunDashboard
      role="brand"
      missions={missions}
      onCompleteMission={completeMission}
      onSkip={skipMissions}
    />
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessDashboard.tsx src/pages/CreatorDashboard.tsx src/pages/BrandDashboard.tsx
git commit -m "feat: wire first-run dashboard gate into all role dashboards"
```

---

## Task 5: InspirationStrip Component & Hook

**Files:**
- Create: `src/hooks/useInspirationStrip.ts`
- Create: `src/components/campaign-creator/InspirationStrip.tsx`

- [ ] **Step 1: Create useInspirationStrip hook**

Create `src/hooks/useInspirationStrip.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface InspirationItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorId: string;
  contentLabel: string;
  isLiked: boolean;
}

export function useInspirationStrip() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['inspiration-strip', user?.id],
    queryFn: async (): Promise<InspirationItem[]> => {
      if (!user?.id) return [];

      // Fetch liked content IDs
      const { data: likeEvents } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .order('created_at', { ascending: false });

      const likedIds = new Set<string>();
      const seen = new Set<string>();
      for (const event of likeEvents ?? []) {
        const d = event.event_data as Record<string, string>;
        if (seen.has(d.content_id)) continue;
        seen.add(d.content_id);
        if (d.action === 'like') likedIds.add(d.content_id);
      }

      // Fetch creator portfolio content
      const { data: creators } = await supabase
        .from('creator_profiles')
        .select('user_id, creator_name, portfolio_urls')
        .eq('is_completed', true)
        .eq('allow_portfolio_in_feed', true)
        .not('portfolio_urls', 'is', null)
        .limit(20);

      if (!creators?.length) return [];

      const items: InspirationItem[] = [];
      for (const creator of creators) {
        const urls = (creator.portfolio_urls as string[]) ?? [];
        for (const url of urls) {
          const id = `${creator.user_id}-${url}`;
          const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
          const label = isVideo ? 'Video content' : 'Photo content';
          items.push({
            id,
            url,
            type: isVideo ? 'video' : 'image',
            creatorName: creator.creator_name ?? 'Creator',
            creatorId: creator.user_id,
            contentLabel: label,
            isLiked: likedIds.has(id),
          });
        }
      }

      // Sort: liked first, then by creator name (stable, not random)
      items.sort((a, b) => {
        if (a.isLiked && !b.isLiked) return -1;
        if (!a.isLiked && b.isLiked) return 1;
        return 0;
      });

      return items.slice(0, 8);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Create InspirationStrip component**

Create `src/components/campaign-creator/InspirationStrip.tsx`:

```typescript
import { useState, useRef, useCallback } from 'react';
import { useInspirationStrip, type InspirationItem } from '@/hooks/useInspirationStrip';
import type { InspirationRef } from '@/types/firstRun';

interface InspirationStripProps {
  onSelectionChange: (refs: InspirationRef[]) => void;
  onScrolled?: () => void;
}

export function InspirationStrip({ onSelectionChange, onScrolled }: InspirationStripProps) {
  const { data: items, isLoading } = useInspirationStrip();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hasScrolled = useRef(false);

  const handleScroll = useCallback(() => {
    if (!hasScrolled.current) {
      hasScrolled.current = true;
      onScrolled?.();
    }
  }, [onScrolled]);

  const toggleItem = (item: InspirationItem) => {
    const next = new Set(selected);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    setSelected(next);

    const refs: InspirationRef[] = (items ?? [])
      .filter((i) => next.has(i.id))
      .map((i) => ({
        media_url: i.url,
        creator_name: i.creatorName,
        content_label: i.contentLabel,
        media_type: i.type,
      }));
    onSelectionChange(refs);
  };

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="flex gap-2 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[100px] h-[130px] rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!items?.length) return null;

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-900">🔥 Inspiration from creators</span>
        <button className="text-xs font-semibold text-pink-500">See all →</button>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
        onScroll={handleScroll}
      >
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item)}
              className={`min-w-[100px] h-[130px] rounded-xl relative flex-shrink-0 overflow-hidden border-2 transition-all ${
                isSelected ? 'border-teal-400 ring-2 ring-teal-200' : 'border-transparent'
              }`}
            >
              {item.type === 'video' ? (
                <video
                  src={item.url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={item.url}
                  alt={item.contentLabel}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-teal-400 flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 rounded-b-xl">
                <span className="text-[9px] text-white">{item.contentLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-gray-500 mt-1">
        Tap content you like — Donny uses it as a style reference
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInspirationStrip.ts src/components/campaign-creator/InspirationStrip.tsx
git commit -m "feat: add InspirationStrip component and hook for campaign creator"
```

---

## Task 6: Integrate InspirationStrip into DropScreen

**Files:**
- Modify: `src/components/campaign-creator/DropScreen.tsx`
- Modify: `src/hooks/useCampaignCreator.ts`
- Modify: `src/types/campaignCreator.ts`
- Create: `src/components/campaign-creator/InspirationBadge.tsx`

- [ ] **Step 1: Add InspirationRef to campaign types**

In `src/types/campaignCreator.ts`, add to `DonnyGenerateRequest`:

```typescript
import type { InspirationRef } from '@/types/firstRun';

// Add to DonnyGenerateRequest interface:
inspiration_refs?: InspirationRef[];
```

- [ ] **Step 2: Update DropScreen props and render InspirationStrip**

In `src/components/campaign-creator/DropScreen.tsx`, add:

```typescript
import { InspirationStrip } from './InspirationStrip';
import type { InspirationRef } from '@/types/firstRun';

// Add to props interface:
interface DropScreenProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  extractionMessages: string[];
  onInspirationChange?: (refs: InspirationRef[]) => void;
  onInspirationScrolled?: () => void;
}
```

Add before the closing of the component's return JSX (after existing content):

```tsx
<InspirationStrip
  onSelectionChange={onInspirationChange ?? (() => {})}
  onScrolled={onInspirationScrolled}
/>
```

- [ ] **Step 3: Update useCampaignCreator to pass inspiration_refs**

In `src/hooks/useCampaignCreator.ts`, add state for inspiration refs and pass them to the edge function call:

```typescript
import type { InspirationRef } from '@/types/firstRun';

// Add state:
const [inspirationRefs, setInspirationRefs] = useState<InspirationRef[]>([]);

// In the function that calls donny-campaign-generate, add to the request body:
inspiration_refs: inspirationRefs.length > 0 ? inspirationRefs : undefined,
```

Expose `setInspirationRefs` in the hook's return value.

- [ ] **Step 4: Create InspirationBadge component**

Create `src/components/campaign-creator/InspirationBadge.tsx`:

```typescript
import type { InspirationRef } from '@/types/firstRun';

interface InspirationBadgeProps {
  refs: InspirationRef[];
  onClear: () => void;
}

export function InspirationBadge({ refs, onClear }: InspirationBadgeProps) {
  if (!refs.length) return null;

  const label = refs.length === 1
    ? `${refs[0].content_label} • @${refs[0].creator_name}`
    : `${refs.length} inspiration picks`;

  return (
    <div className="bg-pink-50 border border-pink-300 rounded-xl px-3 py-2 flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-pink-200 flex-shrink-0" />
      <div className="flex-1">
        <span className="text-xs font-semibold text-pink-500">Inspired by</span>
        <p className="text-xs text-gray-600">{label}</p>
      </div>
      <button onClick={onClear} className="text-gray-400 text-sm">✕</button>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/campaign-creator/DropScreen.tsx src/hooks/useCampaignCreator.ts src/types/campaignCreator.ts src/components/campaign-creator/InspirationBadge.tsx
git commit -m "feat: integrate InspirationStrip into campaign creator flow"
```

---

## Task 7: Update Edge Function for Inspiration Refs

**Files:**
- Modify: `supabase/functions/donny-campaign-generate/index.ts`

- [ ] **Step 1: Accept inspiration_refs in request body**

In the edge function's request parsing, add:

```typescript
const { source_url, source_type, photo_url, manual_text, role, inspiration_refs } = await req.json();
```

- [ ] **Step 2: Augment prompt with inspiration context**

Build the inspiration context string and concatenate it onto the `pageContent` variable (which feeds into the user message for the LLM call). This avoids modifying the `generateCampaignIdeas` function signature:

```typescript
// After extracting request body and before calling generateCampaignIdeas:
let inspirationContext = '';
if (inspiration_refs?.length) {
  const lines = inspiration_refs.map(
    (ref: { content_label: string; creator_name: string; media_type: string; media_url: string }) =>
      `- ${ref.content_label} by @${ref.creator_name} (${ref.media_type}): ${ref.media_url}`
  );
  inspirationContext = `\n\nStyle references the user selected:\n${lines.join('\n')}\n\nGenerate campaign ideas that match these content styles and formats.`;
}

// Append to pageContent before passing to generateCampaignIdeas:
const enrichedContent = pageContent + inspirationContext;
// Then pass enrichedContent instead of pageContent to generateCampaignIdeas()
```

- [ ] **Step 3: Verify build locally**

Run: `npx supabase functions serve donny-campaign-generate` (or just verify TypeScript with `deno check`)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-campaign-generate/index.ts
git commit -m "feat: accept inspiration_refs in donny-campaign-generate edge function"
```

---

## Task 8: Mission Completion Triggers & Brand Style Picker

**Files:**
- Modify: `src/pages/CampaignCreator.tsx` (restaurant triggers)
- Modify: `src/pages/CreatorCampaignMarketplace.tsx` (creator view_campaigns trigger)
- Modify: `src/pages/CreatorSettings.tsx` (creator add_portfolio trigger)
- Modify: `src/pages/BrandCreators.tsx` (brand browse_creators trigger)
- Modify: `src/pages/BrandCreateCampaign.tsx` (brand create_sponsorship trigger)
- Create: `src/pages/BrandStylePicker.tsx` (brand select_style page)
- Modify: `src/App.tsx` (add style-picker route)

- [ ] **Step 1: Add useFirstRunMissions calls to CampaignCreator page**

In `src/pages/CampaignCreator.tsx`, the component that renders DropScreen and LaunchpadScreen:

```typescript
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

// Inside the component:
const { completeMission } = useFirstRunMissions();

// Pass to DropScreen as onInspirationScrolled:
<DropScreen
  {...existingProps}
  onInspirationScrolled={() => completeMission('browse_inspiration')}
  onInspirationChange={(refs) => {
    setInspirationRefs(refs);
    if (refs.length > 0) completeMission('browse_inspiration');
  }}
/>

// After Donny generates ideas (when screen transitions to 'launchpad'):
// In the success callback of the generate mutation:
completeMission('create_campaign');

// After campaign is saved/published (in LaunchButton's success handler):
completeMission('launch_campaign');
```

- [ ] **Step 2: Add trigger to CreatorCampaignMarketplace**

In `src/pages/CreatorCampaignMarketplace.tsx`:

```typescript
import { useEffect } from 'react';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

// Inside the component, after data loads:
const { completeMission } = useFirstRunMissions();

useEffect(() => {
  completeMission('view_campaigns');
}, []);
```

- [ ] **Step 3: Add trigger to CreatorSettings (portfolio upload)**

In `src/pages/CreatorSettings.tsx`, find the portfolio upload success handler and add:

```typescript
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

const { completeMission } = useFirstRunMissions();

// In the upload success callback:
completeMission('add_portfolio');
```

- [ ] **Step 4: Create BrandStylePicker page**

Create `src/pages/BrandStylePicker.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { BRAND_CONTENT_STYLES } from '@/types/firstRun';

export default function BrandStylePicker() {
  const [selected, setSelected] = useState<string[]>([]);
  const { completeMission } = useFirstRunMissions();
  const navigate = useNavigate();

  const toggle = (style: string) => {
    setSelected((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const handleContinue = () => {
    completeMission('select_style');
    navigate('/dashboard/brand/creators');
  };

  return (
    <div className="min-h-screen bg-gray-400 p-4">
      <div className="mb-6 text-center">
        <div className="text-3xl mb-2">🎨</div>
        <h1 className="text-xl font-bold text-white">Pick your vibe</h1>
        <p className="text-sm text-white/80 mt-1">What content style fits your brand?</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {BRAND_CONTENT_STYLES.map((style) => (
          <button
            key={style}
            onClick={() => toggle(style)}
            className={`p-4 rounded-2xl text-sm font-semibold transition-all ${
              selected.includes(style)
                ? 'bg-pink-100 border-2 border-pink-400 text-pink-700'
                : 'bg-white border-2 border-transparent text-gray-700'
            }`}
          >
            {style}
          </button>
        ))}
      </div>

      <button
        onClick={handleContinue}
        disabled={selected.length === 0}
        className="w-full bg-pink-500 text-white font-bold py-3 rounded-full disabled:opacity-50"
      >
        Continue →
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Register route in App.tsx**

In `src/App.tsx`, add the style-picker route near other brand routes:

```typescript
import BrandStylePicker from './pages/BrandStylePicker';

// In the routes section, near other /dashboard/brand/* routes:
<Route path="/dashboard/brand/style-picker" element={<ProtectedRoute><BrandRoute><BrandStylePicker /></BrandRoute></ProtectedRoute>} />
```

- [ ] **Step 6: Add triggers to BrandCreators and BrandCreateCampaign**

In `src/pages/BrandCreators.tsx`:
```typescript
import { useEffect } from 'react';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

const { completeMission } = useFirstRunMissions();
useEffect(() => { completeMission('browse_creators'); }, []);
```

In `src/pages/BrandCreateCampaign.tsx` (brand campaign wizard), in the component:
```typescript
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

const { completeMission } = useFirstRunMissions();
// Call when user reaches brief step (step 1 of wizard):
useEffect(() => { completeMission('create_sponsorship'); }, []);
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/CampaignCreator.tsx src/pages/CreatorCampaignMarketplace.tsx src/pages/CreatorSettings.tsx src/pages/BrandStylePicker.tsx src/pages/BrandCreators.tsx src/pages/BrandCreateCampaign.tsx src/App.tsx
git commit -m "feat: add mission completion triggers and brand style-picker page"
```

---

## Task 9: Tour System Refactor

**Files:**
- Modify: `src/hooks/useTour.ts`
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: `src/pages/CreatorDashboard.tsx`
- Modify: `src/pages/BrandDashboard.tsx`

- [ ] **Step 1: Remove auto-fire from useTour**

In `src/hooks/useTour.ts`, remove the `useEffect` that automatically shows the tour based on `onboarding_completed_at`. Replace with a manual `triggerTour()` function that components can call.

Change the hook to:
- Remove the auto-show setTimeout/useEffect
- Keep `showTour` state but default it to `false`
- Add `triggerTour: () => void` to the return that sets `showTour = true`
- Remove `replayTour` (replaced by `triggerTour` which just sets state, no DB write)
- Keep `completeTour` and `skipTour` as-is (they still set `onboarding_completed_at`)

- [ ] **Step 2: Add ? button to dashboards (post-first-run)**

In each dashboard's full (non-first-run) render, add a `?` button in the top-right that calls `triggerTour()`:

```tsx
const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour('/dashboard/role');

// In JSX, top bar area:
<button
  onClick={triggerTour}
  className="w-7 h-7 rounded-full bg-teal-400 flex items-center justify-center text-xs text-white"
  aria-label="Show tour"
>
  ?
</button>
```

- [ ] **Step 3: Verify tour still works when manually triggered**

Run: `npm run dev`, navigate to a dashboard, click the `?` button, verify tour plays.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTour.ts src/pages/BusinessDashboard.tsx src/pages/CreatorDashboard.tsx src/pages/BrandDashboard.tsx
git commit -m "refactor: demote tour from auto-fire to manual trigger via ? button"
```

---

## Task 10: Document Updates

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update PROJECT_CONTEXT.md**

Add to "Active Workstreams" section:

```markdown
- First-Run Experience: Progressive disclosure + mission-based onboarding
  for all three roles. Dragon Feed integrated as style reference into
  Campaign Creator. State machine architecture (first_run_missions JSONB).
```

Add to "Key Principles & Learnings" section:

```markdown
**Setup disguised as action.** Every onboarding step should feel like
progress toward a goal, not homework. Show value first (what's possible),
then collect what you need (portfolio, preferences), then guide the action
(create, apply, sponsor). Never ask users to configure before they
understand why.
```

- [ ] **Step 2: Update CLAUDE.md**

Add `first_run_missions` to the `profiles` table in the Database Tables section (User & Auth group).

Add to Project Structure section:

```
├── components/
│   ├── first-run/          # FirstRunDashboard, MissionChecklist, MissionItem, FirstRunHero
│   ├── campaign-creator/
│   │   ├── InspirationStrip.tsx  # Dragon Feed reference in campaign creation
│   │   └── InspirationBadge.tsx  # "Inspired by" badge on Launchpad
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors (docs don't affect build but verify no accidental changes)

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_CONTEXT.md CLAUDE.md
git commit -m "docs: update project context and CLAUDE.md with first-run architecture"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test restaurant first-run flow**

1. Create a new test user with `business_client` role (or temporarily set `first_run_missions = NULL` on your profile)
2. Verify: first-run dashboard shows with hero + missions
3. Navigate to campaign creator, verify InspirationStrip appears
4. Scroll the strip → verify mission 1 completes
5. Generate campaign ideas → verify mission 2 completes
6. Save/publish campaign → verify mission 3 completes
7. Verify: full dashboard renders after all missions done

- [ ] **Step 3: Test skip flow**

1. Reset `first_run_missions` to `NULL`
2. Click "Skip for now"
3. Verify: full dashboard renders immediately

- [ ] **Step 4: Test ? button tour**

1. On full dashboard, click `?` button
2. Verify: tour plays through all steps

- [ ] **Step 5: Verify existing users unaffected**

1. Check that existing users (with `completed_at: "migrated"`) see normal dashboard
2. No first-run UI appears for them

- [ ] **Step 6: Final build check**

Run: `npm run build`
Expected: Clean build, no errors or warnings related to new code
