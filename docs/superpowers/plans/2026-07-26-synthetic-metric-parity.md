# Synthetic Metric Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/internal/simulation` show the bot cohort in the *same* card set as the `/internal` Overview, by extracting the three count sections into a shared component driven off a pure real-vs-synthetic model, where synthetic = `total_all − total`.

**Architecture:** One additive edit to the (unapplied) `aios_platform_stats` migration adds three `*_all` breakdown maps. A pure `deriveCardModel(stats, mode)` produces the section→card model for `'real'` or `'synthetic'`. A shared `<PlatformMetricSections>` renders it and owns its own loading/error/empty states. Overview renders it in `'real'` mode (behaviour-preserving refactor); Simulation renders it in `'synthetic'` mode and drops its ad-hoc Cohort cards.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + @testing-library/react (jsdom, globals enabled), Supabase Postgres (SECURITY DEFINER RPC returning jsonb), Tailwind (`dc-*` tokens), the existing `/internal` StatCard/SectionHeading/ErrorCard primitives.

**Spec:** `docs/superpowers/specs/2026-07-26-synthetic-metric-parity-design.md`

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `supabase/migrations/20260725150000_aios_platform_stats_totals.sql` | RPC gains `by_status_all` / `posts_by_status_all` / `by_platform_all` | **Modify (edit in place)** |
| `src/hooks/internal/usePlatformStats.ts` | `PlatformStats` type gains the three optional `*_all` maps | **Modify** |
| `src/lib/internal/platformMetricModel.ts` | Pure `deriveCardModel` + `diffBuckets` + `syntheticTotalUsers`; owns the card set for BOTH pages | **New** |
| `src/lib/internal/platformMetricModel.test.ts` | Unit tests for the model | **New** |
| `src/components/internal/PlatformMetricSections.tsx` | Renders the 3 sections; owns loading/error/empty | **New** |
| `src/components/internal/PlatformMetricSections.test.tsx` | Branch tests (loading/error/empty/real) | **New** |
| `src/pages/internal/InternalOverview.tsx` | Use the shared component in `'real'` mode | **Modify** |
| `src/pages/internal/InternalSimulation.tsx` | Restructure to the mirror layout | **Modify** |

**Key constraint — the Overview refactor must be byte-identical in output.** `deriveCardModel('real', …)` reproduces the exact current Overview card values and sub-strings. Task 2's tests lock this down before Task 4 touches the page.

**Critical rendering detail:** `PlatformMetricSections` maps each section to a **keyed `<Fragment>`** (NOT a wrapping `<div>`). A wrapper div would make every `SectionHeading` the first child of its own parent, so `SectionHeading`'s `first:mt-0` would zero the top margin on *every* heading. Fragments emit no DOM node, so the headings/grids land as direct flow children exactly as they do in the current inline pages.

---

## Task 1: Data contract — migration keys + TypeScript type

**Files:**
- Modify: `supabase/migrations/20260725150000_aios_platform_stats_totals.sql`
- Modify: `src/hooks/internal/usePlatformStats.ts`

This migration is on this branch and **NOT applied to prod** (commit `9beedec6` "[migration, not applied]"), so editing it in place is correct — no second migration. `create or replace` is idempotent, so a re-apply of the edited version is safe even if it were ever applied anywhere.

- [ ] **Step 1: Add `by_status_all` to the campaigns block**

In the `'campaigns'` object, replace the `by_status` line ending so the object stays open and append the all-inclusive sibling.

Find:
```sql
      'by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status::text as status,count(*) as cnt from campaigns where not public.is_synthetic(user_id) group by status) c)),
```
Replace with:
```sql
      'by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status::text as status,count(*) as cnt from campaigns where not public.is_synthetic(user_id) group by status) c),
      'by_status_all',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status::text as status,count(*) as cnt from campaigns group by status) c_all)),
```

- [ ] **Step 2: Add `posts_by_status_all` to the dragonshare block**

Find:
```sql
      'posts_by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) as cnt from dragonshare_posts where not public.is_synthetic(creator_id) group by status) p),
```
Replace with:
```sql
      'posts_by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) as cnt from dragonshare_posts where not public.is_synthetic(creator_id) group by status) p),
      'posts_by_status_all',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) as cnt from dragonshare_posts group by status) p_all),
```

- [ ] **Step 3: Add `by_platform_all` to the social_connections block**

Find:
```sql
      'by_platform',(select coalesce(jsonb_object_agg(platform,cnt),'{}'::jsonb) from (select platform,count(*) as cnt from business_outstand_accounts where not public.is_synthetic(user_id) group by platform) bp)),
```
Replace with:
```sql
      'by_platform',(select coalesce(jsonb_object_agg(platform,cnt),'{}'::jsonb) from (select platform,count(*) as cnt from business_outstand_accounts where not public.is_synthetic(user_id) group by platform) bp),
      'by_platform_all',(select coalesce(jsonb_object_agg(platform,cnt),'{}'::jsonb) from (select platform,count(*) as cnt from business_outstand_accounts group by platform) bp_all)),
```

- [ ] **Step 4: Extend the in-file VERIFICATION comment**

Append to the verification block (the commented `select …` at the bottom) a note asserting the three new keys are present and `>=` their real counterparts:
```sql
--            (aios_platform_stats()->'campaigns'->'by_status_all') as by_status_all,          -- present
--            (aios_platform_stats()->'dragonshare'->'posts_by_status_all') as posts_by_status_all, -- present
--            (aios_platform_stats()->'social_connections'->'by_platform_all') as by_platform_all;  -- present
--       -- each *_all bucket >= its real bucket (gap = synthetic volume for that status/platform).
```

- [ ] **Step 5: Add the three optional maps to `PlatformStats`**

In `src/hooks/internal/usePlatformStats.ts`, extend the interface (keep them **optional** so a version-skewed RPC still renders headline counts):
```ts
  campaigns: { total: number; total_all: number; by_status: Record<string, number>; by_status_all?: Record<string, number> };
  dragonshare: {
    posts_total: number;
    posts_total_all: number;
    posts_by_status: Record<string, number>;
    posts_by_status_all?: Record<string, number>;
    boosts_total: number;
    boosts_total_all: number;
  };
  promotions: { total: number; total_all: number; by_status: Record<string, number> };
  content: {
    social_posts_logged: number; social_posts_logged_all: number;
    performance_tracked_posts: number; performance_tracked_posts_all: number;
  };
  social_connections: { total: number; total_all: number; by_platform: Record<string, number>; by_platform_all?: Record<string, number> };
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no consumers use the new fields yet; the type just widened).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260725150000_aios_platform_stats_totals.sql src/hooks/internal/usePlatformStats.ts
git commit -m "feat(internal): aios_platform_stats returns *_all breakdowns for synthetic sub-detail parity"
```

---

## Task 2: The pure model — `deriveCardModel` + `diffBuckets`

**Files:**
- Create: `src/lib/internal/platformMetricModel.ts`
- Test: `src/lib/internal/platformMetricModel.test.ts`

This is the heart of the feature. TDD it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/internal/platformMetricModel.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveCardModel, diffBuckets, syntheticTotalUsers } from './platformMetricModel';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

const STATS: PlatformStats = {
  users: {
    total: 40, total_all: 2065,
    by_role: { content_creator: 17, business_client: 20 },
    by_role_all: { content_creator: 1007, business_client: 1050 },
  },
  businesses: {
    restaurants: 11, restaurants_all: 19,
    brands: 6, brands_all: 9,
    locations: 1796, locations_all: 1800,
  },
  campaigns: {
    total: 25, total_all: 52,
    by_status: { active: 2, draft: 23 },
    by_status_all: { active: 5, draft: 47 },
  },
  dragonshare: {
    posts_total: 10, posts_total_all: 20,
    posts_by_status: { verified: 10 },
    posts_by_status_all: { verified: 18 },
    boosts_total: 7, boosts_total_all: 7,
  },
  promotions: { total: 2, total_all: 2, by_status: {} },
  content: {
    social_posts_logged: 14, social_posts_logged_all: 28,
    performance_tracked_posts: 6, performance_tracked_posts_all: 6,
  },
  social_connections: {
    total: 8, total_all: 10,
    by_platform: { youtube: 4, facebook: 1, instagram: 3 },
    by_platform_all: { youtube: 5, facebook: 1, instagram: 4 },
  },
  generated_at: '2026-07-26T00:00:00Z',
};

/** Flatten to { [label]: { value, sub } } for readable assertions. */
function cards(mode: 'real' | 'synthetic') {
  const out: Record<string, { value: number; sub?: string }> = {};
  for (const section of deriveCardModel(STATS, mode)) {
    for (const c of section.cards) out[c.label] = { value: c.value, sub: c.sub };
  }
  return out;
}

describe('diffBuckets', () => {
  it('returns positive per-key differences over the union of keys', () => {
    expect(diffBuckets({ a: 5, b: 1 }, { a: 2 })).toEqual({ a: 3, b: 1 });
  });
  it('drops zero and negative differences', () => {
    expect(diffBuckets({ a: 2, b: 1 }, { a: 2, b: 4 })).toEqual({});
  });
  it('tolerates undefined inputs', () => {
    expect(diffBuckets(undefined, undefined)).toEqual({});
    expect(diffBuckets({ a: 3 }, undefined)).toEqual({ a: 3 });
  });
});

describe('deriveCardModel — real mode reproduces Overview', () => {
  const c = cards('real');
  it('headline values match real counts', () => {
    expect(c['Total users'].value).toBe(40);
    expect(c['Creators'].value).toBe(17);
    expect(c['Restaurants'].value).toBe(11);
    expect(c['Campaigns'].value).toBe(25);
    expect(c['Social connections'].value).toBe(8);
  });
  it('subs match Overview strings', () => {
    expect(c['Total users'].sub).toBe('of 2,065 incl. synthetic');
    expect(c['Restaurants'].sub).toBe('1796 locations · of 19 incl. synthetic');
    expect(c['Campaigns'].sub).toBe('2 active · of 52 incl. synthetic');
    expect(c['DragonShare posts'].sub).toBe('10 verified · 7 boosts · of 20 incl. synthetic');
    expect(c['Social connections'].sub).toBe('youtube 4 · facebook 1 · instagram 3 · of 10 incl. synthetic');
    expect(c['Promotions'].sub).toBeUndefined(); // total_all === total → no ofTotal
  });
});

describe('deriveCardModel — synthetic mode = all − real', () => {
  const c = cards('synthetic');
  it('headline values are the synthetic gap', () => {
    expect(c['Total users'].value).toBe(2025);
    expect(c['Creators'].value).toBe(990);
    expect(c['Restaurants'].value).toBe(8);
    expect(c['Brands'].value).toBe(3);
    expect(c['Campaigns'].value).toBe(27);
    expect(c['DragonShare posts'].value).toBe(10);
    expect(c['Promotions'].value).toBe(0);
    expect(c['Social connections'].value).toBe(2);
    expect(c['Social posts logged'].value).toBe(14);
    expect(c['Performance-tracked posts'].value).toBe(0);
  });
  it('subs are the bucket diffs, without the ofTotal affordance', () => {
    expect(c['Restaurants'].sub).toBe('4 locations');
    expect(c['Campaigns'].sub).toBe('3 active');
    expect(c['DragonShare posts'].sub).toBe('8 verified · 0 boosts');
    expect(c['Social connections'].sub).toBe('youtube 1 · instagram 1'); // facebook diff 0 dropped
    expect(c['Total users'].sub).toBeUndefined();
  });
});

describe('degradation — *_all breakdown maps absent', () => {
  const behind: PlatformStats = {
    ...STATS,
    campaigns: { total: 25, total_all: 52, by_status: { active: 2 } }, // no by_status_all
    social_connections: { total: 8, total_all: 10, by_platform: { youtube: 4 } }, // no by_platform_all
  };
  it('keeps synthetic headline counts, drops the missing subs', () => {
    const c: Record<string, { value: number; sub?: string }> = {};
    for (const s of deriveCardModel(behind, 'synthetic')) for (const k of s.cards) c[k.label] = k;
    expect(c['Campaigns'].value).toBe(27);
    expect(c['Campaigns'].sub).toBe('0 active');
    expect(c['Social connections'].sub).toBeUndefined();
  });
});

describe('syntheticTotalUsers', () => {
  it('is the users gap', () => {
    expect(syntheticTotalUsers(STATS)).toBe(2025);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/internal/platformMetricModel.test.ts`
Expected: FAIL — cannot find module `./platformMetricModel`.

- [ ] **Step 3: Implement the model**

Create `src/lib/internal/platformMetricModel.ts`:
```ts
/**
 * The /internal platform-metric card set, as a pure model rendered by BOTH the
 * Overview (real users) and the Simulation page (synthetic cohort). Synthetic values
 * are `total_all − total` — the same counting method as real, so the two pages
 * reconcile by construction. Keeping this pure (no React) lets us lock the real-mode
 * output to the current Overview with unit tests before refactoring the page.
 */
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

export type MetricMode = 'real' | 'synthetic';

export interface CardModel {
  label: string;
  value: number;
  sub?: string;
}

export interface MetricSection {
  heading: string;
  cards: CardModel[];
}

/** Positive per-key difference all[k] − real[k] (clamped at 0), over the union of keys. */
export function diffBuckets(
  all: Record<string, number> | undefined,
  real: Record<string, number> | undefined,
): Record<string, number> {
  const a = all ?? {};
  const r = real ?? {};
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(r)])) {
    const d = (a[k] ?? 0) - (r[k] ?? 0);
    if (d > 0) out[k] = d;
  }
  return out;
}

/** Synthetic scalar = all − real, clamped; degrades to 0 when `all` is absent. */
function synthValue(real: number, all: number | undefined): number {
  return Math.max(0, (all ?? real) - real);
}

/** Real-mode "of N incl. synthetic" sub — only when synthetic data exists (all > real). */
function ofTotal(real: number, all: number | undefined): string | undefined {
  return all !== undefined && all > real ? `of ${all.toLocaleString()} incl. synthetic` : undefined;
}

/** Join non-empty sub parts with ' · ' (Overview's withSub). */
function withSub(...parts: (string | undefined)[]): string | undefined {
  return parts.filter(Boolean).join(' · ') || undefined;
}

/** "platform N · platform M" from a counts map, or undefined if empty. */
function platformSub(map: Record<string, number>): string | undefined {
  return (
    Object.entries(map)
      .map(([platform, n]) => `${platform} ${n}`)
      .join(' · ') || undefined
  );
}

/** Synthetic total-users count — drives the "no synthetic cohort" empty state. */
export function syntheticTotalUsers(stats: PlatformStats): number {
  return synthValue(stats.users.total, stats.users.total_all);
}

export function deriveCardModel(stats: PlatformStats, mode: MetricMode): MetricSection[] {
  const real = mode === 'real';
  const { users: u, businesses: b, campaigns: c, dragonshare: d, promotions: pr, content: ct, social_connections: sc } = stats;

  const creatorsReal = u.by_role['content_creator'] ?? 0;
  const creatorsAll = u.by_role_all['content_creator'] ?? 0;
  const activeReal = c.by_status['active'] ?? 0;
  const verifiedReal = d.posts_by_status['verified'] ?? 0;

  const synthStatus = diffBuckets(c.by_status_all, c.by_status);
  const synthPosts = diffBuckets(d.posts_by_status_all, d.posts_by_status);
  const synthPlatform = diffBuckets(sc.by_platform_all, sc.by_platform);

  return [
    {
      heading: 'Users & businesses',
      cards: [
        {
          label: 'Total users',
          value: real ? u.total : synthValue(u.total, u.total_all),
          sub: real ? ofTotal(u.total, u.total_all) : undefined,
        },
        {
          label: 'Creators',
          value: real ? creatorsReal : Math.max(0, creatorsAll - creatorsReal),
          sub: real ? ofTotal(creatorsReal, creatorsAll) : undefined,
        },
        {
          label: 'Restaurants',
          value: real ? b.restaurants : synthValue(b.restaurants, b.restaurants_all),
          sub: real
            ? withSub(`${b.locations} locations`, ofTotal(b.restaurants, b.restaurants_all))
            : `${synthValue(b.locations, b.locations_all)} locations`,
        },
        {
          label: 'Brands',
          value: real ? b.brands : synthValue(b.brands, b.brands_all),
          sub: real ? ofTotal(b.brands, b.brands_all) : undefined,
        },
      ],
    },
    {
      heading: 'Activity',
      cards: [
        {
          label: 'Campaigns',
          value: real ? c.total : synthValue(c.total, c.total_all),
          sub: real
            ? withSub(`${activeReal} active`, ofTotal(c.total, c.total_all))
            : `${synthStatus['active'] ?? 0} active`,
        },
        {
          label: 'DragonShare posts',
          value: real ? d.posts_total : synthValue(d.posts_total, d.posts_total_all),
          sub: real
            ? withSub(
                `${verifiedReal} verified · ${d.boosts_total} boosts`,
                ofTotal(d.posts_total, d.posts_total_all),
              )
            : `${synthPosts['verified'] ?? 0} verified · ${synthValue(d.boosts_total, d.boosts_total_all)} boosts`,
        },
        {
          label: 'Promotions',
          value: real ? pr.total : synthValue(pr.total, pr.total_all),
          sub: real ? ofTotal(pr.total, pr.total_all) : undefined,
        },
        {
          label: 'Social connections',
          value: real ? sc.total : synthValue(sc.total, sc.total_all),
          sub: real
            ? withSub(platformSub(sc.by_platform), ofTotal(sc.total, sc.total_all))
            : platformSub(synthPlatform),
        },
      ],
    },
    {
      heading: 'Content',
      cards: [
        {
          label: 'Social posts logged',
          value: real ? ct.social_posts_logged : synthValue(ct.social_posts_logged, ct.social_posts_logged_all),
          sub: real ? ofTotal(ct.social_posts_logged, ct.social_posts_logged_all) : undefined,
        },
        {
          label: 'Performance-tracked posts',
          value: real ? ct.performance_tracked_posts : synthValue(ct.performance_tracked_posts, ct.performance_tracked_posts_all),
          sub: real ? ofTotal(ct.performance_tracked_posts, ct.performance_tracked_posts_all) : undefined,
        },
      ],
    },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/internal/platformMetricModel.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/internal/platformMetricModel.ts src/lib/internal/platformMetricModel.test.ts
git commit -m "feat(internal): pure deriveCardModel (real vs synthetic) for platform metrics"
```

---

## Task 3: Shared renderer — `PlatformMetricSections`

**Files:**
- Create: `src/components/internal/PlatformMetricSections.tsx`
- Test: `src/components/internal/PlatformMetricSections.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/internal/PlatformMetricSections.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformMetricSections } from './PlatformMetricSections';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

const base: PlatformStats = {
  users: { total: 40, total_all: 2065, by_role: { content_creator: 17 }, by_role_all: { content_creator: 1007 } },
  businesses: { restaurants: 11, restaurants_all: 19, brands: 6, brands_all: 9, locations: 1796, locations_all: 1800 },
  campaigns: { total: 25, total_all: 52, by_status: { active: 2 }, by_status_all: { active: 5 } },
  dragonshare: { posts_total: 10, posts_total_all: 20, posts_by_status: {}, posts_by_status_all: {}, boosts_total: 7, boosts_total_all: 7 },
  promotions: { total: 2, total_all: 2, by_status: {} },
  content: { social_posts_logged: 14, social_posts_logged_all: 28, performance_tracked_posts: 6, performance_tracked_posts_all: 6 },
  social_connections: { total: 8, total_all: 10, by_platform: {}, by_platform_all: {} },
  generated_at: '2026-07-26T00:00:00Z',
};

const zeroSynth: PlatformStats = {
  ...base,
  users: { total: 40, total_all: 40, by_role: { content_creator: 17 }, by_role_all: { content_creator: 17 } },
};

describe('PlatformMetricSections', () => {
  it('renders an error card on isError', () => {
    render(<PlatformMetricSections mode="synthetic" stats={undefined} isLoading={false} isError />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows the empty note in synthetic mode when there is no synthetic cohort', () => {
    render(<PlatformMetricSections mode="synthetic" stats={zeroSynth} isLoading={false} isError={false} />);
    expect(screen.getByText(/no synthetic cohort active/i)).toBeInTheDocument();
    expect(screen.queryByText('Users & businesses')).not.toBeInTheDocument();
  });

  it('renders the three section headings for real data', () => {
    render(<PlatformMetricSections mode="real" stats={base} isLoading={false} isError={false} />);
    expect(screen.getByText('Users & businesses')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Total users')).toBeInTheDocument();
  });

  it('renders synthetic values when there is a cohort', () => {
    render(<PlatformMetricSections mode="synthetic" stats={base} isLoading={false} isError={false} />);
    expect(screen.getByText('2025')).toBeInTheDocument(); // 2065 − 40
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/internal/PlatformMetricSections.test.tsx`
Expected: FAIL — cannot find module `./PlatformMetricSections`.

- [ ] **Step 3: Implement the component**

Create `src/components/internal/PlatformMetricSections.tsx`. **Use a keyed `Fragment` per section** (see the rendering note in File Structure):
```tsx
import { Fragment } from 'react';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';
import { deriveCardModel, syntheticTotalUsers, type MetricMode } from '@/lib/internal/platformMetricModel';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

const INLINE_CARD = 'rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm';

interface Props {
  mode: MetricMode;
  stats: PlatformStats | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** The three count sections (Users & businesses / Activity / Content) shared by the
 *  Overview (real) and Simulation (synthetic) pages. Owns its own loading/error/empty
 *  states so, on Simulation, a platform-stats failure degrades only this block. */
export function PlatformMetricSections({ mode, stats, isLoading, isError }: Props) {
  if (isLoading) {
    return (
      <div className={`flex min-h-[8rem] items-center justify-center ${INLINE_CARD}`}>
        <Spinner className="h-6 w-6 border-teal-400" />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorCard message="Platform stats failed to load — check your internal access." />;
  }
  if (mode === 'synthetic' && syntheticTotalUsers(stats) <= 0) {
    return (
      <div className={`${INLINE_CARD} text-sm text-white/60`}>
        No synthetic cohort active — turn the kill switch on and seed bots to populate these metrics.
      </div>
    );
  }

  return (
    <>
      {deriveCardModel(stats, mode).map((section) => (
        <Fragment key={section.heading}>
          <SectionHeading>{section.heading}</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {section.cards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} sub={card.sub} />
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/internal/PlatformMetricSections.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/internal/PlatformMetricSections.tsx src/components/internal/PlatformMetricSections.test.tsx
git commit -m "feat(internal): PlatformMetricSections shared renderer with loading/error/empty states"
```

---

## Task 4: Refactor Overview to the shared component (real mode)

**Files:**
- Modify: `src/pages/internal/InternalOverview.tsx`

Behaviour-preserving: the real-mode model already reproduces the exact card values/subs (Task 2 tests). Overview keeps its banner, Revenue, and admin AI-spend sections inline.

- [ ] **Step 1: Add the import**

Add near the other imports:
```ts
import { PlatformMetricSections } from '@/components/internal/PlatformMetricSections';
```

- [ ] **Step 2: Remove the now-shared inline helpers/derivations**

Delete these lines (they move into the model): the `activeCampaigns` and `verifiedPosts` consts, the `ofTotal` and `withSub` consts, and the `// Real-vs-total …` comment above them. **Keep** `syntheticActive`, `topFunction`, `topModel`, and `cap`.

- [ ] **Step 3: Replace the three inline count sections**

Replace the block from `<SectionHeading>Users &amp; businesses</SectionHeading>` through the end of the Content grid (the `</div>` closing the Content section, immediately before `<SectionHeading>Revenue</SectionHeading>`) with:
```tsx
      <PlatformMetricSections
        mode="real"
        stats={p}
        isLoading={platform.isLoading}
        isError={platform.isError}
      />
```

- [ ] **Step 4: Typecheck + lint (catch unused imports/vars)**

Run: `npm run typecheck && npm run lint`
Expected: PASS. If `StatCard` is now unused anywhere it shouldn't be — note Revenue + AI spend still use `StatCard` and `SectionHeading`, so both imports stay.

- [ ] **Step 5: Run the model tests (regression guard for the refactor)**

Run: `npx vitest run src/lib/internal/platformMetricModel.test.ts`
Expected: PASS — the real-mode assertions are the contract that Overview's output is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/pages/internal/InternalOverview.tsx
git commit -m "refactor(internal): Overview renders the shared PlatformMetricSections (real mode)"
```

---

## Task 5: Restructure the Simulation page (synthetic mirror)

**Files:**
- Modify: `src/pages/internal/InternalSimulation.tsx`

Target order: kill-switch chip → `PlatformMetricSections` (synthetic) → Revenue (modeled) → AI spend (synthetic) → divider → Simulation internals → Bots by persona → Matrix run → Load curve.

- [ ] **Step 1: Add imports + the platform query**

Add imports:
```ts
import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { PlatformMetricSections } from '@/components/internal/PlatformMetricSections';
```
**Do NOT re-import `StatCard`** — it is already imported on line 8 (`StatCard`, `SectionHeading`, `ErrorCard` all come from `@/components/internal/stats`); a duplicate import will fail lint. In the component body, alongside the other hooks:
```ts
  const platform = usePlatformStats();
```
The page-level spinner/error stays gated on `simulation` only.

- [ ] **Step 2: Replace the Cohort section with the synthetic mirror + Revenue/AI-spend analogs**

Replace the current block from `<SectionHeading>Cohort</SectionHeading>` through the end of its grid (the four Cohort StatCards) with:
```tsx
      <PlatformMetricSections
        mode="synthetic"
        stats={platform.data}
        isLoading={platform.isLoading}
        isError={platform.isError}
      />

      <SectionHeading>Revenue (modeled)</SectionHeading>
      <ModeledRevenueCard syntheticCampaigns={s.synthetic_campaigns} />

      <SectionHeading>AI spend (synthetic)</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Synthetic MTD AI spend"
          value={formatUsd(s.synthetic_ai_spend_mtd_usd)}
          sub="Real cost of the synthetic run"
          accent="pink"
        />
      </div>

      <SectionHeading>Simulation internals</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Bots total (registry)" value={s.bots_total} sub="synthetic_users rows" />
        <StatCard label="Synthetic messages" value={s.synthetic_messages} />
      </div>
```

- [ ] **Step 3: Remove the now-duplicated bottom "Modeled revenue" section**

Delete the old `<SectionHeading>Modeled revenue</SectionHeading>` + `<ModeledRevenueCard … />` block at the bottom of the page (it now lives under "Revenue (modeled)" up top). Leave "Bots by persona", "Matrix run (summed)", and "Load curve" where they are.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Confirm no unused imports remain (e.g. if `ModeledRevenueCard` is still referenced — it is, up top).

- [ ] **Step 5: Run the full unit suite for the touched area**

Run: `npx vitest run src/lib/internal/platformMetricModel.test.ts src/components/internal/PlatformMetricSections.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/internal/InternalSimulation.tsx
git commit -m "feat(internal): Simulation mirrors the Overview card set for the synthetic cohort"
```

---

## Task 6: Full verification + Codex second review

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: PASS (production build clean).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Test suite**

Run: `npm run test`
Expected: the new suites pass. Per repo convention, `npm run test` exits non-zero due to ~pre-existing failing e2e files in nested worktrees — trust the "N passed, 0 failed" summary for the files this plan touched, not the exit code.

- [ ] **Step 4: Codex second review (mandatory)**

Run from the worktree: `codex review --base main --title "synthetic metric parity"`
Fix any real findings, re-run until clean, relay the verdict.

- [ ] **Step 5: Commit any Codex fixes**

```bash
git add -A && git commit -m "fix(internal): address Codex review on synthetic metric parity"
```

---

## Done / Deploy (careful gate — after merge)

These are operational steps, not code tasks — run them at ship time:

1. **Apply migration `20260725150000` to prod at the careful gate** (`/careful`). This is the load-bearing step: the synthetic parity AND the Overview real-vs-total banner (already on this branch) both need the `total_all` + the three new `*_all` keys to exist in prod. Verify with the migration's in-file rollback-wrapped VERIFICATION block (fake an internal caller, assert every `*_all` key is present and `>=` its real counterpart).
2. **`verify-prod`** on `internal.dragoncandy.io`: open `/internal` and `/internal/simulation`, confirm the two layouts mirror each other (real vs synthetic), check console for errors, both viewports.
3. **`knowledge-sync`** per the branch-finish rule: wiki session source + ingest, prepend the entry to `docs/SHIPPED_LOG.md`, refresh the PROJECT_CONTEXT §5 index line, sync Donny's RAG after merge.

---

## Notes for the implementer

- **DRY:** `ofTotal`/`withSub`/`platformSub` live only in `platformMetricModel.ts` now — do not re-add them to the pages.
- **Do not** widen scope into sub-projects 2 (live telemetry) or 3 (DAU forecast). This plan is metric-parity only.
- **Byte-identical Overview** is the safety contract: if a real-mode assertion in `platformMetricModel.test.ts` ever needs changing to match Overview, that means the model diverged — fix the model, not the test.
- The main StatCard `value` is rendered raw (no locale formatting) on both pages today; keep it that way (`2025`, not `2,025`). Only the `ofTotal` sub uses `toLocaleString`.
