# DC Points Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DC Points explain themselves — a live balance chip on every page, a `/rewards` page showing what you earned and why, a notification that names the action it paid for, and a Donny who can answer from your own standing.

**Architecture:** Everything renders from data that already exists (`dragon_point_events` has own-row RLS, `dre_config` has authenticated SELECT). One new caller-scoped RPC (`dre_my_standing()`) supplies the tier gap to both the page and Donny so they can never disagree. Two pure modules — an `event_type` label map and a tier-gap calculator — are unit-tested in isolation and consumed by every surface.

**Tech Stack:** React 18 + TypeScript strict, Vite, Tailwind (`dc-*` tokens), shadcn/ui, React Query, Supabase (Postgres/RLS/Deno edge functions), Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-07-dc-points-visibility-design.md`

## Global Constraints

- **Honest, earn-only.** No copy anywhere promises a perk, discount, redemption, or access tied to a tier. Nothing exists behind tiers today except a public badge. No "coming soon" strip.
- **Currency is displayed as "DC Points"**; tiers display as **Rising / Established / Pro / Elite / Icon** (`src/lib/dragonTiers.ts`). Internal keys (`egg/scout/knight/master/legend`) never appear on screen.
- **Never modify** `dre_config` values, the `dragon_point_*` tables, or `dre-award-engine`'s awarding logic (steps 1–5). Only step 6 (the notification) changes.
- **Design system:** light app. Use `PageBody` / `AppCard` / `AppStatusBadge` from `src/components/app/`. Never gray backgrounds/badges. Desktop changes use `lg:`/`xl:` prefixes only; mobile uses base classes only.
- **App chrome is `z-40`**, never `z-50` (that ties the Radix modal layer).
- **RTL test files** must start with these exact two lines, in this order — jsdom is per-file in this repo, not global:
  ```
  // @vitest-environment jsdom
  import '@testing-library/jest-dom';
  ```
- **ESLint:** only `console.error` / `console.warn` allowed. Named exports for components; default export only for pages.
- **Supabase grant rule:** Supabase grants EXECUTE to `anon`/`authenticated` via `ALTER DEFAULT PRIVILEGES`. `revoke ... from public` alone does NOT lock down a `SECURITY DEFINER` function — `anon` must be revoked explicitly.
- **Prod project ref:** `zocahiffooqdybdhguqv`.
- **Run commands from the worktree**, not the main checkout. The shell's default cwd may be the main checkout — `cd` to the worktree first.
- **Every task ends with `npm run typecheck` passing** before its commit.

---

## File Structure

**Create**
| Path | Responsibility |
|-|-|
| `src/lib/dragonEvents.ts` | `event_type` → `{ label, repeatable }`, frontend copy |
| `src/lib/dragonEvents.test.ts` | Coverage, unknown-key fallback, cross-side parity |
| `supabase/functions/_shared/dre-events.ts` | Same map, edge copy |
| `src/lib/dragonTierGap.ts` | Pure next-tier gap calculator |
| `src/lib/dragonTierGap.test.ts` | Gap cases incl. null rating and the Icon cap |
| `src/hooks/useDcPoints.ts` | Standing / ledger / catalog React Query hooks |
| `src/pages/DcPointsPage.tsx` | The `/rewards` page (default export) |
| `src/components/rewards/StandingCard.tsx` | Block 1 — balance, tier, gap |
| `src/components/rewards/PointsHistory.tsx` | Block 2 — labeled ledger |
| `src/components/rewards/EarnCatalog.tsx` | Block 3 — catalog from config |
| `src/components/rewards/DcPointsChip.tsx` | Always-visible balance chip |
| `src/components/rewards/dc-points-gate.test.tsx` | Flag-off + brand-hidden gates |
| `supabase/functions/_shared/dre-notification.ts` | Pure notification title/body builder |
| `supabase/functions/_shared/dre-notification.test.ts` | Builder cases |
| `supabase/functions/donny-orchestrator/agents/rewards.ts` | Donny's rewards sub-agent |
| `supabase/migrations/20260807120000_dre_my_standing.sql` | The RPC |
| `supabase/migrations/20260807120100_dc_points_help_article.sql` | Help-article rewrite |
| `supabase/migrations/20260807120200_dre_rag_internal_scope.sql` | RAG honesty fix |

**Modify**
| Path | Change |
|-|-|
| `supabase/functions/dre-award-engine/index.ts` | Step 6 only: carry `event_type`, build body, add `actionUrl` |
| `src/lib/getNotificationRoute.ts` | Add `dragon_points_award` case |
| `src/lib/getNotificationRoute.test.ts` | Cover the new case |
| `src/components/DashboardLayout.tsx:226` | Mount `DcPointsChip` |
| `src/components/MobileTopNav.tsx:60` | Mount `DcPointsChip` |
| `src/App.tsx` | Lazy import + `/rewards` route |
| `src/lib/donnyRoutes.ts` | Add `/rewards` to `ROUTE_TEMPLATES` |
| `supabase/functions/donny-orchestrator/routes.ts` | Add `/rewards` to `ROUTE_TEMPLATES` |
| `supabase/functions/donny-orchestrator/tools.ts` | `rewards_agent` tool definition |
| `supabase/functions/donny-orchestrator/index.ts` | Import + `agentMap` entry |

> **Three route tables.** `/rewards` must be added to `src/App.tsx`, `src/lib/donnyRoutes.ts`, AND `supabase/functions/donny-orchestrator/routes.ts`. Miss the last two and Donny's suggested action is silently dropped server-side by `isKnownRoute` and again client-side. Both files carry a "KEEP THE ROUTE TABLE IN SYNC WITH" header saying so.

---

### Task 1: The event label map (both sides)

The 25 `event_type` keys are machine strings. Both the bell (Deno) and the page (Vite) must render them as English, and the frontend cannot import from `supabase/functions/`. So the map is duplicated deliberately, with a test that fails if they drift.

**Files:**
- Create: `src/lib/dragonEvents.ts`
- Create: `supabase/functions/_shared/dre-events.ts`
- Test: `src/lib/dragonEvents.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DragonEventMeta = { label: string; repeatable: boolean }`; `DRAGON_EVENTS: Record<string, DragonEventMeta>`; `getDragonEvent(eventType: string): DragonEventMeta`. Both files export all three with identical names. Tasks 2, 5, 7, 8 consume these.

> **Format is load-bearing.** The parity test regex-parses the `_shared` file as text (parsing TS in a Vitest node env is otherwise fragile). Keep every entry on **one line** in exactly this shape, single-quoted, and **use no apostrophes inside labels**:
> `  'key.name': { label: 'Label text', repeatable: false },`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dragonEvents.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DRAGON_EVENTS, getDragonEvent } from './dragonEvents';
import { getDragonTier } from './dragonTiers';

// The 25 keys seeded into dre_config.point_values on prod (2026-08-07).
const SEEDED_KEYS = [
  'creator.profile_completed', 'creator.first_social', 'creator.post_submitted',
  'creator.first_post_bonus', 'creator.first_application', 'creator.first_campaign',
  'creator.first_boost', 'creator.five_star', 'creator.milestone_campaigns_3',
  'creator.milestone_campaigns_10', 'creator.milestone_campaigns_25',
  'creator.milestone_campaigns_50',
  'business.profile_completed', 'business.first_social', 'business.first_campaign_created',
  'business.first_campaign', 'business.campaign_launched', 'business.boost_given',
  'business.first_boost_bonus', 'business.rate_creator', 'business.five_star_bonus',
  'business.milestone_campaigns_5', 'business.milestone_campaigns_10',
  'business.milestone_campaigns_25', 'business.milestone_campaigns_50',
];

describe('dragonEvents', () => {
  it('labels every seeded point_values key', () => {
    for (const key of SEEDED_KEYS) {
      expect(DRAGON_EVENTS[key], `missing label for ${key}`).toBeDefined();
      expect(DRAGON_EVENTS[key].label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DRAGON_EVENTS)).toHaveLength(25);
  });

  it('derives a readable label for an unknown key instead of throwing', () => {
    // dre_config is editable without a deploy, so a key can exist with no map entry.
    expect(getDragonEvent('business.some_future_event').label).toBe('Some future event');
    expect(getDragonEvent('business.some_future_event').repeatable).toBe(false);
  });

  it('degrades safely on a malformed key', () => {
    expect(getDragonEvent('').label).toBe('DC Points earned');
    expect(getDragonEvent('nodot').label).toBe('Nodot');
  });

  it('keeps the edge-side tier labels in sync with dragonTiers.ts', () => {
    // Donny must say "Established", never the internal key "scout". The edge side
    // cannot import dragonTiers.ts, so this binds the two.
    const edgePath = resolve(__dirname, '../../supabase/functions/_shared/dre-events.ts');
    const source = readFileSync(edgePath, 'utf8');
    const re = /'(egg|scout|knight|master|legend)':\s*'([^']*)'/g;
    const edgeTiers = Object.fromEntries([...source.matchAll(re)].map((m) => [m[1], m[2]]));
    for (const key of ['egg', 'scout', 'knight', 'master', 'legend'] as const) {
      expect(edgeTiers[key], `edge copy missing tier ${key}`).toBe(getDragonTier(key).label);
    }
  });

  it('stays in sync with the edge-side copy', () => {
    const edgePath = resolve(__dirname, '../../supabase/functions/_shared/dre-events.ts');
    const source = readFileSync(edgePath, 'utf8');
    const re = /'([a-z_]+\.[a-z_0-9]+)':\s*\{\s*label:\s*'([^']*)',\s*repeatable:\s*(true|false)\s*\}/g;
    const edge: Record<string, { label: string; repeatable: boolean }> = {};
    for (const m of source.matchAll(re)) {
      edge[m[1]] = { label: m[2], repeatable: m[3] === 'true' };
    }
    expect(Object.keys(edge).sort()).toEqual(Object.keys(DRAGON_EVENTS).sort());
    for (const key of Object.keys(DRAGON_EVENTS)) {
      expect(edge[key], `edge copy missing ${key}`).toEqual(DRAGON_EVENTS[key]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/dragonEvents.test.ts
```
Expected: FAIL — `Failed to resolve import "./dragonEvents"`.

- [ ] **Step 3: Write the frontend map**

Create `src/lib/dragonEvents.ts`:

```ts
// Presentation only — maps a dragon_point_events.event_type key to human copy.
// MIRRORED, INTENTIONALLY, IN: supabase/functions/_shared/dre-events.ts
// (the frontend cannot import from supabase/functions/). dragonEvents.test.ts
// fails if the two drift. Keep one entry per line, single-quoted, no apostrophes
// in labels — the parity test regex-parses the edge file as text.
export interface DragonEventMeta {
  label: string;
  /** false = one-time award; drives the "already earned" check in the earn catalog. */
  repeatable: boolean;
}

export const DRAGON_EVENTS: Record<string, DragonEventMeta> = {
  'creator.profile_completed': { label: 'Completed your creator profile', repeatable: false },
  'creator.first_social': { label: 'Linked your first social account', repeatable: false },
  'creator.post_submitted': { label: 'Submitted a DragonShare post', repeatable: true },
  'creator.first_post_bonus': { label: 'First DragonShare post bonus', repeatable: false },
  'creator.first_application': { label: 'Applied to your first campaign', repeatable: false },
  'creator.first_campaign': { label: 'Completed your first campaign', repeatable: false },
  'creator.first_boost': { label: 'Received your first boost payout', repeatable: false },
  'creator.five_star': { label: 'Earned a 5-star review', repeatable: true },
  'creator.milestone_campaigns_3': { label: 'Completed 3 campaigns', repeatable: false },
  'creator.milestone_campaigns_10': { label: 'Completed 10 campaigns', repeatable: false },
  'creator.milestone_campaigns_25': { label: 'Completed 25 campaigns', repeatable: false },
  'creator.milestone_campaigns_50': { label: 'Completed 50 campaigns', repeatable: false },
  'business.profile_completed': { label: 'Completed your business profile', repeatable: false },
  'business.first_social': { label: 'Linked your first social account', repeatable: false },
  'business.first_campaign_created': { label: 'Created your first campaign', repeatable: false },
  'business.first_campaign': { label: 'Completed your first campaign', repeatable: false },
  'business.campaign_launched': { label: 'Launched a campaign', repeatable: true },
  'business.boost_given': { label: 'Boosted a creator post', repeatable: true },
  'business.first_boost_bonus': { label: 'First boost bonus', repeatable: false },
  'business.rate_creator': { label: 'Rated a creator', repeatable: true },
  'business.five_star_bonus': { label: 'Gave a 5-star rating', repeatable: true },
  'business.milestone_campaigns_5': { label: 'Completed 5 campaigns', repeatable: false },
  'business.milestone_campaigns_10': { label: 'Completed 10 campaigns', repeatable: false },
  'business.milestone_campaigns_25': { label: 'Completed 25 campaigns', repeatable: false },
  'business.milestone_campaigns_50': { label: 'Completed 50 campaigns', repeatable: false },
};

/** Never throws and never shows a raw key: dre_config can add an event without a deploy. */
export function getDragonEvent(eventType: string): DragonEventMeta {
  const known = DRAGON_EVENTS[eventType];
  if (known) return known;
  const tail = eventType.includes('.') ? eventType.split('.').slice(1).join('.') : eventType;
  const words = tail.replace(/_/g, ' ').trim();
  if (!words) return { label: 'DC Points earned', repeatable: false };
  return { label: words.charAt(0).toUpperCase() + words.slice(1), repeatable: false };
}
```

- [ ] **Step 4: Write the edge-side copy**

Create `supabase/functions/_shared/dre-events.ts` with **identical content** to Step 3, changing only the header comment's direction:

```ts
// Presentation only — maps a dragon_point_events.event_type key to human copy.
// MIRRORED, INTENTIONALLY, FROM: src/lib/dragonEvents.ts
// (the frontend cannot import from supabase/functions/). src/lib/dragonEvents.test.ts
// fails if the two drift. Keep one entry per line, single-quoted, no apostrophes
// in labels — the parity test regex-parses this file as text.
```

Everything from `export interface DragonEventMeta` onward is copied verbatim from Step 3. No `https://` imports — this file must stay loadable by Vitest.

Then append the tier labels, which exist **only** in this edge copy (the frontend already has them in `src/lib/dragonTiers.ts`, and the test above binds the two so they cannot drift):

```ts
// Display labels for the standing ladder. The frontend source is
// src/lib/dragonTiers.ts; dragonEvents.test.ts asserts these match it.
// Donny must never say an internal key ('scout') out loud.
export const DRAGON_TIER_LABELS: Record<string, string> = {
  'egg': 'Rising',
  'scout': 'Established',
  'knight': 'Pro',
  'master': 'Elite',
  'legend': 'Icon',
};
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/dragonEvents.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/dragonEvents.ts src/lib/dragonEvents.test.ts supabase/functions/_shared/dre-events.ts
git commit -m "feat(rewards): human labels for DC Points event types, mirrored edge-side"
```

---

### Task 2: The tier-gap calculator

Block 1 must say exactly what the next tier needs. The rule has to mirror `_shared/dre-rules.ts` `resolveTier`, whose subtlety is that **a `min_avg_rating` threshold is unmet when `avg_rating` is null** — a creator with no reviews is short on rating even at 10 campaigns.

**Files:**
- Create: `src/lib/dragonTierGap.ts`
- Test: `src/lib/dragonTierGap.test.ts`

**Interfaces:**
- Consumes: `TierThreshold`, `TierThresholds` from `supabase/functions/_shared/dre-rules.ts` (it has no `https://` imports, so the frontend can import it — `src/App.tsx` already lives in the same Vite graph and `dre-rules.ts` is deliberately dependency-free).
- Produces:
  ```ts
  interface TierGap {
    nextTierKey: string | null;   // null = at the cap
    pointsShort: number;          // 0 when met
    campaignsShort: number;       // 0 when met or not required
    ratingRequired: number | null;// null when not required or already met
    hasNoRatings: boolean;        // true when a rating is required and avg is null
    met: boolean;                 // every condition satisfied
  }
  function computeTierGap(role: string, standing: StandingMetrics, thresholds: TierThresholds): TierGap
  type StandingMetrics = { balance: number; campaignsCompleted: number; avgRating: number | null; tier: string }
  ```
  Task 5 (StandingCard) and Task 8 (Donny) consume `computeTierGap`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dragonTierGap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTierGap } from './dragonTierGap';
import type { TierThresholds } from '../../supabase/functions/_shared/dre-rules';

// The thresholds seeded on prod.
const THRESHOLDS: TierThresholds = {
  creator: [
    { key: 'egg', min_dp: 0 },
    { key: 'scout', min_dp: 500, min_campaigns: 3 },
    { key: 'knight', min_dp: 2500, min_campaigns: 10, min_avg_rating: 4.5 },
    { key: 'master', min_dp: 10000, min_campaigns: 50, min_avg_rating: 4.8 },
    { key: 'legend', min_dp: 50000 },
  ],
  business: [
    { key: 'egg', min_dp: 0 },
    { key: 'scout', min_dp: 500, min_campaigns: 3 },
    { key: 'knight', min_dp: 2500, min_campaigns: 10 },
    { key: 'master', min_dp: 10000, min_campaigns: 50 },
    { key: 'legend', min_dp: 50000 },
  ],
};

describe('computeTierGap', () => {
  it('reports both shortfalls toward the next tier', () => {
    const gap = computeTierGap(
      'business_client',
      { balance: 350, campaignsCompleted: 1, avgRating: null, tier: 'egg' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBe('scout');
    expect(gap.pointsShort).toBe(150);
    expect(gap.campaignsShort).toBe(2);
    expect(gap.met).toBe(false);
  });

  it('zeroes a condition that is already satisfied', () => {
    const gap = computeTierGap(
      'business_client',
      { balance: 900, campaignsCompleted: 1, avgRating: null, tier: 'egg' },
      THRESHOLDS,
    );
    expect(gap.pointsShort).toBe(0);
    expect(gap.campaignsShort).toBe(2);
  });

  it('treats a null average rating as UNMET when a rating is required', () => {
    // Mirrors resolveTier: avgRating == null fails a min_avg_rating condition.
    const gap = computeTierGap(
      'content_creator',
      { balance: 5000, campaignsCompleted: 12, avgRating: null, tier: 'scout' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBe('knight');
    expect(gap.ratingRequired).toBe(4.5);
    expect(gap.hasNoRatings).toBe(true);
    expect(gap.met).toBe(false);
  });

  it('clears the rating condition once the average is high enough', () => {
    const gap = computeTierGap(
      'content_creator',
      { balance: 5000, campaignsCompleted: 12, avgRating: 4.9, tier: 'scout' },
      THRESHOLDS,
    );
    expect(gap.ratingRequired).toBeNull();
    expect(gap.hasNoRatings).toBe(false);
    expect(gap.met).toBe(true);
  });

  it('returns no next tier at the cap', () => {
    const gap = computeTierGap(
      'content_creator',
      { balance: 60000, campaignsCompleted: 80, avgRating: 5, tier: 'legend' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBeNull();
    expect(gap.met).toBe(true);
  });

  it('falls back to the first tier when the stored tier key is unrecognised', () => {
    const gap = computeTierGap(
      'business_client',
      { balance: 0, campaignsCompleted: 0, avgRating: null, tier: 'bogus' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBe('scout');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/dragonTierGap.test.ts
```
Expected: FAIL — `Failed to resolve import "./dragonTierGap"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/dragonTierGap.ts`:

```ts
import type { TierThresholds } from '../../supabase/functions/_shared/dre-rules';

export interface StandingMetrics {
  balance: number;
  campaignsCompleted: number;
  avgRating: number | null;
  tier: string;
}

export interface TierGap {
  nextTierKey: string | null;
  pointsShort: number;
  campaignsShort: number;
  ratingRequired: number | null;
  hasNoRatings: boolean;
  met: boolean;
}

/**
 * What the caller still needs for the NEXT tier. Mirrors _shared/dre-rules.ts
 * resolveTier, including its rule that a null avgRating FAILS a min_avg_rating
 * condition — points alone never unlock a tier.
 */
export function computeTierGap(
  role: string,
  standing: StandingMetrics,
  thresholds: TierThresholds,
): TierGap {
  const list = role === 'content_creator' ? thresholds.creator : thresholds.business;
  const currentIndex = list.findIndex((t) => t.key === standing.tier);
  const next = list[(currentIndex < 0 ? 0 : currentIndex) + 1];

  if (!next) {
    return {
      nextTierKey: null, pointsShort: 0, campaignsShort: 0,
      ratingRequired: null, hasNoRatings: false, met: true,
    };
  }

  const pointsShort = Math.max(0, next.min_dp - standing.balance);
  const campaignsShort = next.min_campaigns != null
    ? Math.max(0, next.min_campaigns - standing.campaignsCompleted)
    : 0;
  const ratingUnmet = next.min_avg_rating != null
    && (standing.avgRating == null || standing.avgRating < next.min_avg_rating);

  return {
    nextTierKey: next.key,
    pointsShort,
    campaignsShort,
    ratingRequired: ratingUnmet ? next.min_avg_rating! : null,
    hasNoRatings: ratingUnmet && standing.avgRating == null,
    met: pointsShort === 0 && campaignsShort === 0 && !ratingUnmet,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/dragonTierGap.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/dragonTierGap.ts src/lib/dragonTierGap.test.ts
git commit -m "feat(rewards): pure next-tier gap calculator mirroring resolveTier"
```

---

### Task 3: `dre_my_standing()` RPC

The gap needs `campaigns_completed` and `avg_rating`, already computed by `dre_user_aggregates(uuid[])` — which is service-role only. A `SECURITY DEFINER` wrapper runs with its owner's privileges, so it may call the revoked aggregate while scoping to `auth.uid()`. Taking no arguments means there is no parameter a caller could point at someone else.

**Files:**
- Create: `supabase/migrations/20260807120000_dre_my_standing.sql`

**Interfaces:**
- Consumes: existing `public.dre_user_aggregates(uuid[])`, `public.dragon_point_balances`.
- Produces: `dre_my_standing()` returning one row — `role text, balance int, tier text, campaigns_completed int, avg_rating numeric, last_activity_at timestamptz`. Tasks 4 and 8 consume it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260807120000_dre_my_standing.sql`:

```sql
-- Caller-scoped standing for the DC Points page and Donny's rewards agent.
-- Wraps the service-role-only dre_user_aggregates so the page, Donny, and the
-- award engine can never disagree about a user's tier. Takes no arguments:
-- identity comes from auth.uid(), so there is no parameter to point elsewhere.
create or replace function public.dre_my_standing()
returns table (
  role text,
  balance int,
  tier text,
  campaigns_completed int,
  avg_rating numeric,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden: authentication required';
  end if;

  return query
    select a.role,
           a.balance,
           coalesce(b.tier, 'egg'),
           a.campaigns_completed,
           a.avg_rating,
           a.last_activity_at
    from public.dre_user_aggregates(array[auth.uid()]) a
    left join public.dragon_point_balances b on b.user_id = auth.uid();
end;
$$;

-- Supabase grants EXECUTE to anon/authenticated via ALTER DEFAULT PRIVILEGES,
-- so `revoke from public` alone does NOT lock this down. anon must go explicitly.
revoke all on function public.dre_my_standing() from public, anon;
grant execute on function public.dre_my_standing() to authenticated;
```

- [ ] **Step 2: Apply the migration to prod**

Use the Supabase MCP `apply_migration` with `project_id: zocahiffooqdybdhguqv`, name `dre_my_standing`, and the SQL above.

- [ ] **Step 3: Verify the grant took (never trust "the migration succeeded")**

Run via MCP `execute_sql` — one statement per call, since only the last result is returned:

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'dre_my_standing';
```
Expected: rows for `authenticated` (and the owner) — **no `anon` row**. If `anon` appears, the revoke did not take; stop and fix before continuing.

- [ ] **Step 4: Verify red→green, rollback-wrapped**

Faking `auth.uid()` needs a real user id. First get one:

```sql
select user_id, balance, tier from dragon_point_balances order by balance desc limit 1;
```

Then, in a single call, prove the function returns that caller's own row (the `rollback` makes this read-only):

```sql
begin;
select set_config('request.jwt.claim.sub', '<uuid-from-above>', true);
select * from dre_my_standing();
rollback;
```
Expected: exactly one row whose `balance` and `tier` match the row selected above.

Then prove the unauthenticated path raises:

```sql
begin;
select set_config('request.jwt.claim.sub', '', true);
select * from dre_my_standing();
rollback;
```
Expected: ERROR `forbidden: authentication required`.

- [ ] **Step 5: Check security advisors**

Run the Supabase MCP `get_advisors` with `type: security` for `zocahiffooqdybdhguqv`. Expected: no NEW advisor naming `dre_my_standing`. (Pre-existing advisors are shelved — see `project_security_advisors_deferred`; do not re-raise them.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260807120000_dre_my_standing.sql
git commit -m "feat(rewards): dre_my_standing() caller-scoped standing RPC"
```

---

### Task 4: The data hooks

**Files:**
- Create: `src/hooks/useDcPoints.ts`

**Interfaces:**
- Consumes: `dre_my_standing()` (Task 3); existing `useDragonRewardsEnabled` from `src/hooks/useDragonPoints.ts`.
- Produces:
  ```ts
  interface DcStanding { role: string; balance: number; tier: string; campaignsCompleted: number; avgRating: number | null; }
  interface DcLedgerEntry { id: string; eventType: string; points: number; occurredAt: string; }
  interface DcCatalog { pointValues: Record<string, number>; thresholds: TierThresholds; }
  useDcStanding(): UseQueryResult<DcStanding | null>
  useDcLedger(): UseQueryResult<DcLedgerEntry[]>
  useDcCatalog(): UseQueryResult<DcCatalog>
  ```
  Tasks 5 and 6 consume these.

> `supabase.rpc` must be called **on the client object** — extracting `const rpc = supabase.rpc` loses `this` and fails only in the production build.

- [ ] **Step 1: Write the hooks**

Create `src/hooks/useDcPoints.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { TierThresholds } from '../../supabase/functions/_shared/dre-rules';

export interface DcStanding {
  role: string;
  balance: number;
  tier: string;
  campaignsCompleted: number;
  avgRating: number | null;
}

export interface DcLedgerEntry {
  id: string;
  eventType: string;
  points: number;
  occurredAt: string;
}

export interface DcCatalog {
  pointValues: Record<string, number>;
  thresholds: TierThresholds;
}

const EMPTY_THRESHOLDS: TierThresholds = { creator: [], business: [] };

/** Balance, tier, and the activity metrics the tier gap needs. Caller-scoped server-side. */
export function useDcStanding() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dc-standing', user?.id],
    queryFn: async (): Promise<DcStanding | null> => {
      // .rpc must be called ON the client — destructuring it loses `this`.
      const { data, error } = await supabase.rpc('dre_my_standing');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        role: row.role ?? '',
        balance: row.balance ?? 0,
        tier: row.tier ?? 'egg',
        campaignsCompleted: row.campaigns_completed ?? 0,
        avgRating: row.avg_rating == null ? null : Number(row.avg_rating),
      };
    },
    enabled: !!user?.id,
  });
}

/** The caller's own award history. dragon_point_events already has own-row SELECT RLS. */
export function useDcLedger() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dc-ledger', user?.id],
    queryFn: async (): Promise<DcLedgerEntry[]> => {
      const { data, error } = await supabase
        .from('dragon_point_events')
        .select('id, event_type, points_awarded, occurred_at')
        .eq('user_id', user!.id)
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        eventType: r.event_type,
        points: r.points_awarded,
        occurredAt: r.occurred_at,
      }));
    },
    enabled: !!user?.id,
  });
}

/** The live earn catalog + tier thresholds. dre_config has authenticated SELECT. */
export function useDcCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dc-catalog'],
    queryFn: async (): Promise<DcCatalog> => {
      const { data, error } = await supabase
        .from('dre_config')
        .select('config_key, config_value')
        .in('config_key', ['point_values', 'tier_thresholds']);
      if (error) throw error;
      const byKey = Object.fromEntries((data ?? []).map((r) => [r.config_key, r.config_value]));
      return {
        pointValues: (byKey.point_values ?? {}) as Record<string, number>,
        thresholds: (byKey.tier_thresholds ?? EMPTY_THRESHOLDS) as TierThresholds,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // config changes rarely; don't refetch per navigation
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors. If `supabase.rpc('dre_my_standing')` errors on the generated types, cast the call site as `supabase.rpc('dre_my_standing' as never)` — `src/integrations/supabase/types.ts` is generated and will not know the new function until regenerated. Leave a one-line comment saying why.

- [ ] **Step 3: Commit**

```bash
npm run lint
git add src/hooks/useDcPoints.ts
git commit -m "feat(rewards): standing, ledger, and catalog hooks for DC Points"
```

---

### Task 5: The `/rewards` page

Four blocks, three route tables. Copy must stay earn-only — no promised perks.

**Files:**
- Create: `src/components/rewards/StandingCard.tsx`
- Create: `src/components/rewards/PointsHistory.tsx`
- Create: `src/components/rewards/EarnCatalog.tsx`
- Create: `src/pages/DcPointsPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/donnyRoutes.ts`
- Modify: `supabase/functions/donny-orchestrator/routes.ts`
- Test: `src/components/rewards/dc-points-gate.test.tsx` (created here, extended in Task 6)

**Interfaces:**
- Consumes: `useDcStanding`, `useDcLedger`, `useDcCatalog` (Task 4); `computeTierGap` (Task 2); `getDragonEvent`, `DRAGON_EVENTS` (Task 1); `getDragonTier` from `src/lib/dragonTiers.ts`; `DragonTierBadge`; `PageBody`, `AppCard`.
- Produces: route `/rewards`; named exports `StandingCard`, `PointsHistory`, `EarnCatalog`; default export `DcPointsPage`.

- [ ] **Step 1: Write the failing gate test**

Create `src/components/rewards/dc-points-gate.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StandingCard } from './StandingCard';

const { mockEnabled } = vi.hoisted(() => ({ mockEnabled: vi.fn() }));
vi.mock('@/hooks/useDragonPoints', () => ({
  useDragonRewardsEnabled: () => mockEnabled(),
  useDragonPoints: () => ({ data: { balance: 1234, tier: 'scout' }, isLoading: false }),
}));
vi.mock('@/hooks/useDcPoints', () => ({
  useDcStanding: () => ({
    data: { role: 'business_client', balance: 350, tier: 'egg', campaignsCompleted: 1, avgRating: null },
    isLoading: false, isError: false,
  }),
  useDcLedger: () => ({ data: [], isLoading: false, isError: false }),
  useDcCatalog: () => ({
    data: {
      pointValues: { 'business.profile_completed': 200 },
      thresholds: {
        creator: [{ key: 'egg', min_dp: 0 }],
        business: [{ key: 'egg', min_dp: 0 }, { key: 'scout', min_dp: 500, min_campaigns: 3 }],
      },
    },
    isLoading: false, isError: false,
  }),
}));

describe('StandingCard', () => {
  beforeEach(() => mockEnabled.mockReset());

  it('states both unmet conditions for the next tier', () => {
    mockEnabled.mockReturnValue(true);
    render(<StandingCard />);
    expect(screen.getByText('350')).toBeInTheDocument();
    // Established needs 500 points and 3 campaigns; the user has 350 and 1.
    expect(screen.getByText(/150 more DC Points/i)).toBeInTheDocument();
    expect(screen.getByText(/2 more completed campaigns/i)).toBeInTheDocument();
  });

  it('never claims points buy anything', () => {
    mockEnabled.mockReturnValue(true);
    const { container } = render(<StandingCard />);
    expect(container.textContent).not.toMatch(/redeem|discount|cash out|coming soon/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/rewards/dc-points-gate.test.tsx
```
Expected: FAIL — cannot resolve `./StandingCard`.

- [ ] **Step 3: Write `StandingCard`**

Create `src/components/rewards/StandingCard.tsx`:

```tsx
import { AppCard } from '@/components/app/AppCard';
import { DragonTierBadge } from '@/components/badges/DragonTierBadge';
import { getDragonTier } from '@/lib/dragonTiers';
import { computeTierGap } from '@/lib/dragonTierGap';
import { useDcStanding, useDcCatalog } from '@/hooks/useDcPoints';
import { useDragonPoints } from '@/hooks/useDragonPoints';

/** Block 1 — balance, tier, and exactly what the next tier still needs. */
export function StandingCard() {
  const { data: standing, isLoading, isError } = useDcStanding();
  const { data: catalog } = useDcCatalog();
  // Degrade path: dragon_point_balances is own-row readable without the RPC, so a
  // failed dre_my_standing() costs the gap line, not the whole card.
  const { data: fallback } = useDragonPoints();

  if (isLoading) {
    return <AppCard><div className="h-24 animate-pulse rounded-xl bg-dc-teal/[0.06]" /></AppCard>;
  }
  if (isError || !standing) {
    return (
      <AppCard pad="6">
        <p className="text-xs font-medium text-dc-pink-accent">Your DC Points</p>
        <p className="mt-1 text-4xl font-bold text-dc-text">
          {(fallback?.balance ?? 0).toLocaleString()}
        </p>
        <div className="mt-2"><DragonTierBadge tier={fallback?.tier ?? 'egg'} /></div>
        <p className="mt-4 text-sm text-dc-text-muted">
          Progress toward your next standing is unavailable right now.
        </p>
      </AppCard>
    );
  }

  const gap = catalog
    ? computeTierGap(standing.role, standing, catalog.thresholds)
    : null;
  const nextLabel = gap?.nextTierKey ? getDragonTier(gap.nextTierKey).label : null;

  const needs: string[] = [];
  if (gap && gap.pointsShort > 0) needs.push(`${gap.pointsShort.toLocaleString()} more DC Points`);
  if (gap && gap.campaignsShort > 0) needs.push(`${gap.campaignsShort} more completed campaigns`);
  if (gap && gap.ratingRequired != null) {
    needs.push(gap.hasNoRatings
      ? `an average rating of ${gap.ratingRequired} (no reviews yet)`
      : `an average rating of ${gap.ratingRequired}`);
  }

  return (
    <AppCard pad="6">
      <p className="text-xs font-medium text-dc-pink-accent">Your DC Points</p>
      <p className="mt-1 text-4xl font-bold text-dc-text">{standing.balance.toLocaleString()}</p>
      <div className="mt-2"><DragonTierBadge tier={standing.tier} /></div>

      {nextLabel && needs.length > 0 && (
        <p className="mt-4 text-sm text-dc-text-muted">
          {nextLabel} needs {needs.join(' and ')}.
        </p>
      )}
      {nextLabel && needs.length === 0 && (
        <p className="mt-4 text-sm text-dc-text-muted">
          You have met everything {nextLabel} requires — it applies on the next update.
        </p>
      )}
      {!nextLabel && (
        <p className="mt-4 text-sm text-dc-text-muted">
          You are at the top of the ladder.
        </p>
      )}
    </AppCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/rewards/dc-points-gate.test.tsx
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `PointsHistory`**

Create `src/components/rewards/PointsHistory.tsx`:

```tsx
import { AppCard } from '@/components/app/AppCard';
import { getDragonEvent } from '@/lib/dragonEvents';
import { useDcLedger } from '@/hooks/useDcPoints';

/** Block 2 — the caller's own award history, human-labeled. */
export function PointsHistory() {
  const { data: entries, isLoading, isError } = useDcLedger();

  if (isLoading) {
    return <AppCard><div className="h-32 animate-pulse rounded-xl bg-dc-teal/[0.06]" /></AppCard>;
  }
  if (isError) {
    return <AppCard><p className="text-sm text-dc-text-muted">Your history is unavailable right now.</p></AppCard>;
  }
  if (!entries || entries.length === 0) {
    return (
      <AppCard pad="6">
        <h2 className="text-base font-bold text-dc-text">Your history</h2>
        <p className="mt-2 text-sm text-dc-text-muted">
          You have not earned any DC Points yet. The list below shows every way to earn them.
        </p>
      </AppCard>
    );
  }

  return (
    <AppCard pad="6">
      <h2 className="text-base font-bold text-dc-text">Your history</h2>
      <ul className="mt-3 divide-y divide-dc-teal/10">
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="text-sm text-dc-text">{getDragonEvent(e.eventType).label}</span>
            <span className="flex items-baseline gap-3 flex-shrink-0">
              <span className="text-sm font-bold text-dc-pink-accent">
                +{e.points.toLocaleString()}
              </span>
              <span className="text-xs text-dc-text-muted whitespace-nowrap">
                {new Date(e.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </AppCard>
  );
}
```

- [ ] **Step 6: Write `EarnCatalog`**

Create `src/components/rewards/EarnCatalog.tsx`:

```tsx
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { getDragonEvent } from '@/lib/dragonEvents';
import { useDcCatalog, useDcLedger, useDcStanding } from '@/hooks/useDcPoints';

/** Block 3 — the live earn catalog, rendered from dre_config so retuning needs no deploy. */
export function EarnCatalog() {
  const { data: catalog, isLoading, isError } = useDcCatalog();
  const { data: standing } = useDcStanding();
  const { data: entries } = useDcLedger();

  if (isLoading) {
    return <AppCard><div className="h-40 animate-pulse rounded-xl bg-dc-teal/[0.06]" /></AppCard>;
  }
  if (isError || !catalog) return null;

  const prefix = standing?.role === 'content_creator' ? 'creator.' : 'business.';
  const earnedKeys = new Set((entries ?? []).map((e) => e.eventType));

  const rows = Object.entries(catalog.pointValues)
    .filter(([key]) => key.startsWith(prefix))
    .sort((a, b) => b[1] - a[1]);

  return (
    <AppCard pad="6">
      <h2 className="text-base font-bold text-dc-text">How to earn</h2>
      <ul className="mt-3 divide-y divide-dc-teal/10">
        {rows.map(([key, points]) => {
          const meta = getDragonEvent(key);
          const earned = !meta.repeatable && earnedKeys.has(key);
          return (
            <li key={key} className="flex items-center justify-between gap-4 py-2.5">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-dc-text truncate">{meta.label}</span>
                {earned && <AppStatusBadge tone="teal">Earned</AppStatusBadge>}
                {meta.repeatable && <AppStatusBadge tone="neutral">Every time</AppStatusBadge>}
              </span>
              <span className="text-sm font-bold text-dc-pink-accent flex-shrink-0">
                +{points.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </AppCard>
  );
}
```

> `AppStatusBadge` is verified as `({ children, tone })` with `tone: 'teal' | 'pink' | 'amber' | 'neutral'`, rendering a `<span>` — safe inside the list rows above.

- [ ] **Step 7: Write the page**

Create `src/pages/DcPointsPage.tsx`:

```tsx
import { PageBody } from '@/components/app/PageBody';
import { AppCard } from '@/components/app/AppCard';
import { StandingCard } from '@/components/rewards/StandingCard';
import { PointsHistory } from '@/components/rewards/PointsHistory';
import { EarnCatalog } from '@/components/rewards/EarnCatalog';
import { useDragonRewardsEnabled } from '@/hooks/useDragonPoints';

export default function DcPointsPage() {
  const enabled = useDragonRewardsEnabled();

  if (!enabled) {
    return (
      <PageBody maxWidth="4xl">
        <AppCard pad="6">
          <p className="text-sm text-dc-text-muted">DC Points are not available yet.</p>
        </AppCard>
      </PageBody>
    );
  }

  return (
    <PageBody maxWidth="4xl">
      <div>
        <h1 className="text-2xl font-bold text-dc-text">DC Points</h1>
        <p className="mt-1 text-sm text-dc-text-muted">
          What you have earned, and how to earn more.
        </p>
      </div>

      <StandingCard />
      <PointsHistory />
      <EarnCatalog />

      {/* Block 4 — honest, earn-only. Do not add perks or a roadmap here. */}
      <AppCard pad="6">
        <h2 className="text-base font-bold text-dc-text">What standing does</h2>
        <p className="mt-2 text-sm text-dc-text-muted">
          Your standing badge is shown publicly on your profile, so businesses and creators
          can see how active you are at a glance. Your points balance is private to you.
          DC Points do not convert to money, credit, or discounts.
        </p>
      </AppCard>
    </PageBody>
  );
}
```

- [ ] **Step 8: Register the route in all three tables**

In `src/App.tsx`, add the lazy import alongside the other page imports (near line 43):

```tsx
const DcPointsPage = lazy(() => import("./pages/DcPointsPage"));
```

and the route beside the other all-role protected routes (near line 269, next to `/notifications`):

```tsx
{/* DC Points — all roles */}
<Route path="/rewards" element={<ProtectedRoute><DcPointsPage /></ProtectedRoute>} />
```

In `src/lib/donnyRoutes.ts`, add to `ROUTE_TEMPLATES` immediately after `"/notifications",`:

```ts
  "/rewards",
```

In `supabase/functions/donny-orchestrator/routes.ts`, add the identical line at the same position in its `ROUTE_TEMPLATES`.

- [ ] **Step 9: Verify the route allow-list test still passes**

```bash
npx vitest run supabase/functions/donny-orchestrator/routes.test.ts
```
Expected: PASS. If that test enumerates the table length, update the expected count.

- [ ] **Step 10: Build, typecheck, commit**

```bash
npm run typecheck
npm run lint
npm run build
git add src/pages/DcPointsPage.tsx src/components/rewards src/App.tsx src/lib/donnyRoutes.ts supabase/functions/donny-orchestrator/routes.ts
git commit -m "feat(rewards): /rewards page with standing, history, and the live earn catalog"
```

---

### Task 6: The always-visible chip

**Files:**
- Create: `src/components/rewards/DcPointsChip.tsx`
- Modify: `src/components/DashboardLayout.tsx` (line ~226)
- Modify: `src/components/MobileTopNav.tsx` (line ~60)
- Test: `src/components/rewards/dc-points-gate.test.tsx` (extend)

**Interfaces:**
- Consumes: `useDragonPoints`, `useDragonRewardsEnabled` (existing, `src/hooks/useDragonPoints.ts`); `useAuth` for the role.
- Produces: named export `DcPointsChip`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/rewards/dc-points-gate.test.tsx` (keep the existing file header and mocks; add this import at the top with the others: `import { DcPointsChip } from './DcPointsChip';`):

```tsx
const { mockRole } = vi.hoisted(() => ({ mockRole: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { role: mockRole() } }),
}));

describe('DcPointsChip', () => {
  beforeEach(() => { mockEnabled.mockReset(); mockRole.mockReturnValue('business_client'); });

  it('renders nothing when the launch flag is OFF', () => {
    mockEnabled.mockReturnValue(false);
    const { container } = render(<DcPointsChip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the balance when the flag is ON', () => {
    mockEnabled.mockReturnValue(true);
    render(<DcPointsChip />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders nothing for a brand user (DRE has no brand triggers, so it would sit at 0)', () => {
    mockEnabled.mockReturnValue(true);
    mockRole.mockReturnValue('brand');
    const { container } = render(<DcPointsChip />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

> Verified: `useAuth()` (`src/hooks/useAuth.tsx`, re-exporting `AuthContext`) returns `{ user, profile, ... }`, and `profile.role` is typed `'business_client' | 'content_creator' | 'brand'`. The mock above matches that shape.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/rewards/dc-points-gate.test.tsx
```
Expected: FAIL — cannot resolve `./DcPointsChip`.

- [ ] **Step 3: Write the chip**

Create `src/components/rewards/DcPointsChip.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Gem } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDragonPoints, useDragonRewardsEnabled } from '@/hooks/useDragonPoints';

/**
 * Always-visible DC Points balance + the entry point to /rewards. Mounted in the
 * DashboardLayout top bar and MobileTopNav, immediately left of the bell.
 * Reuses useDragonPoints, whose React Query cache the dashboard card already fills,
 * so this costs no extra request per page.
 */
export function DcPointsChip() {
  const enabled = useDragonRewardsEnabled();
  const { profile } = useAuth();
  const { data, isLoading } = useDragonPoints();

  // Launch gate, then: brand has no DRE triggers, so a brand chip would read a
  // permanent 0 — worse than showing nothing. Loading renders nothing so the
  // top bar does not jitter as the balance resolves.
  if (!enabled) return null;
  if (profile?.role === 'brand') return null;
  if (isLoading) return null;

  return (
    <Link
      to="/rewards"
      aria-label={`${(data?.balance ?? 0).toLocaleString()} DC Points`}
      className="flex items-center gap-1.5 rounded-full border border-dc-pink/40 bg-dc-pink/10 px-2.5 py-1 transition-colors hover:bg-dc-pink/20"
    >
      <Gem className="h-3.5 w-3.5 text-dc-pink-accent" />
      <span className="text-xs font-bold text-dc-pink-accent">
        {(data?.balance ?? 0).toLocaleString()}
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/rewards/dc-points-gate.test.tsx
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Mount it on desktop**

In `src/components/DashboardLayout.tsx`, add the import with the others:

```tsx
import { DcPointsChip } from '@/components/rewards/DcPointsChip';
```

and place it immediately before `<NotificationDropdown />` (line ~226):

```tsx
                  <DcPointsChip />
                  <NotificationDropdown />
```

- [ ] **Step 6: Mount it on mobile**

In `src/components/MobileTopNav.tsx`, add the same import, then place it immediately before `<NotificationDropdown />` (line ~60), inside the existing `<div className="flex items-center gap-1">`:

```tsx
        <DcPointsChip />
        <NotificationDropdown />
```

The chip must not squeeze the middle block: it is already compact and the middle block carries `min-w-0` / `truncate`, so it yields. Do not add `flex-1` to the chip.

- [ ] **Step 7: Verify both viewports build and render**

```bash
npm run typecheck
npm run lint
npm run build
npm run dev
```
Open `http://127.0.0.1:8080`, sign in, and confirm at 1440px and 390px widths: the chip appears left of the bell, the mobile logo and welcome text are not pushed off, and clicking it lands on `/rewards`.

- [ ] **Step 8: Commit**

```bash
git add src/components/rewards/DcPointsChip.tsx src/components/rewards/dc-points-gate.test.tsx src/components/DashboardLayout.tsx src/components/MobileTopNav.tsx
git commit -m "feat(rewards): always-visible DC Points chip in both top bars"
```

---

### Task 7: The notification names its reason

Today `dre-award-engine` sums a run's awards and discards every `event_type`, and sets no `actionUrl` — so the bell says "+200 DC Points" and clicking it goes nowhere.

**Files:**
- Create: `supabase/functions/_shared/dre-notification.ts`
- Test: `supabase/functions/_shared/dre-notification.test.ts`
- Modify: `supabase/functions/dre-award-engine/index.ts` (step 6 only)
- Modify: `src/lib/getNotificationRoute.ts`
- Test: `src/lib/getNotificationRoute.test.ts` (extend)

**Interfaces:**
- Consumes: `getDragonEvent` from `_shared/dre-events.ts` (Task 1).
- Produces: `buildAwardNotification(events: AwardEvent[], tieredUp: boolean): { title: string; body: string }` where `AwardEvent = { eventType: string; points: number }`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/dre-notification.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAwardNotification } from './dre-notification';

describe('buildAwardNotification', () => {
  it('names the single action that earned the points', () => {
    const n = buildAwardNotification([{ eventType: 'business.profile_completed', points: 200 }], false);
    expect(n.title).toBe('You earned 200 DC Points');
    expect(n.body).toBe('Completed your business profile');
  });

  it('summarises several actions from one run', () => {
    const n = buildAwardNotification([
      { eventType: 'business.first_campaign_created', points: 500 },
      { eventType: 'business.campaign_launched', points: 150 },
    ], false);
    expect(n.title).toBe('You earned 650 DC Points');
    expect(n.body).toBe('Created your first campaign and Launched a campaign');
  });

  it('flags a tier-up without losing the reason', () => {
    const n = buildAwardNotification([{ eventType: 'creator.first_campaign', points: 1000 }], true);
    expect(n.title).toBe('You earned 1,000 DC Points');
    expect(n.body).toBe('Completed your first campaign — new standing unlocked');
  });

  it('falls back readably for an event type with no label', () => {
    const n = buildAwardNotification([{ eventType: 'business.future_thing', points: 25 }], false);
    expect(n.body).toBe('Future thing');
  });

  it('never produces an empty body', () => {
    const n = buildAwardNotification([], false);
    expect(n.title).toBe('You earned DC Points');
    expect(n.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run supabase/functions/_shared/dre-notification.test.ts
```
Expected: FAIL — cannot resolve `./dre-notification`.

- [ ] **Step 3: Write the builder**

Create `supabase/functions/_shared/dre-notification.ts`:

```ts
// Pure title/body builder for the dragon_points_award bell. No `https://` imports
// so Vitest can load it in the frontend test run.
import { getDragonEvent } from './dre-events.ts';

export interface AwardEvent {
  eventType: string;
  points: number;
}

/**
 * The bell used to say only "+N DC Points", which told the user nothing about
 * what they had done. It now names the action(s) the run is paying for.
 */
export function buildAwardNotification(
  events: AwardEvent[],
  tieredUp: boolean,
): { title: string; body: string } {
  const total = events.reduce((sum, e) => sum + e.points, 0);
  const labels = events.map((e) => getDragonEvent(e.eventType).label);

  const title = events.length === 0
    ? 'You earned DC Points'
    : `You earned ${total.toLocaleString('en-US')} DC Points`;

  let body: string;
  if (labels.length === 0) body = 'Open DC Points to see how you earned them';
  else if (labels.length === 1) body = labels[0];
  else if (labels.length === 2) body = `${labels[0]} and ${labels[1]}`;
  else body = `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;

  if (tieredUp) body += ' — new standing unlocked';
  return { title, body };
}
```

> `getDragonEvent` is imported with the `.ts` extension because Deno requires it. Vitest resolves `./dre-events.ts` fine.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run supabase/functions/_shared/dre-notification.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the award engine**

In `supabase/functions/dre-award-engine/index.ts`:

Add the import beside the others at the top:

```ts
import { buildAwardNotification } from '../_shared/dre-notification.ts';
```

Change the step-3 `.select()` so `event_type` survives (line ~55) — it is currently dropped:

```ts
      .select('user_id, event_type, points_awarded, occurred_at');
```

Replace the body of the step-6 loop (lines ~92–112) with:

```ts
    for (const uid of affected) {
      const forward = newRows.filter(
        (r) => r.user_id === uid && new Date(r.occurred_at).getTime() >= goLiveAt,
      );
      const sum = forward.reduce((s, r) => s + (r.points_awarded ?? 0), 0);
      if (sum <= 0) continue;
      const tieredUp = (priorTier.get(uid) ?? 'egg') !== newTier.get(uid);
      const { title, body } = buildAwardNotification(
        forward.map((r) => ({ eventType: r.event_type, points: r.points_awarded ?? 0 })),
        tieredUp,
      );
      await fetch(`${SUPABASE_URL}/functions/v1/create-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          recipientId: uid,
          type: 'dragon_points_award',
          category: 'account',
          title,
          body,
          icon: 'sparkles',
          actionUrl: '/rewards',
          data: {
            points: sum,
            tier: newTier.get(uid),
            events: forward.map((r) => ({ type: r.event_type, points: r.points_awarded ?? 0 })),
          },
        }),
      }).catch(() => { /* fire-and-forget; never block awarding on a bell */ });
      notified++;
    }
```

Do not touch steps 1–5. Awarding logic is unchanged.

- [ ] **Step 6: Add the notification route case**

In `src/lib/getNotificationRoute.ts`, add a case inside the switch (grouped with the other account-level types):

```ts
    // Awards sent before /rewards existed carry no action_url; this fallback
    // fixes them retroactively (action_url still wins when present).
    case 'dragon_points_award':
      return '/rewards';
```

- [ ] **Step 7: Extend the route test**

Append to `src/lib/getNotificationRoute.test.ts`, matching the existing `make(...)` helper's signature in that file:

```ts
describe('getNotificationRoute — DC Points', () => {
  it('routes a points award to /rewards via the type fallback', () => {
    // Awards sent before /rewards existed carry no action_url.
    expect(getNotificationRoute(make('dragon_points_award', { points: 200 })))
      .toBe('/rewards');
  });

  it('prefers an explicit action_url when the engine set one', () => {
    const n = { ...make('dragon_points_award', { points: 200 }), action_url: '/rewards' };
    expect(getNotificationRoute(n)).toBe('/rewards');
  });
});
```

- [ ] **Step 8: Run the tests**

```bash
npx vitest run src/lib/getNotificationRoute.test.ts supabase/functions/_shared/dre-notification.test.ts
```
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

```bash
npm run typecheck
npm run build
git add supabase/functions/_shared/dre-notification.ts supabase/functions/_shared/dre-notification.test.ts supabase/functions/dre-award-engine/index.ts src/lib/getNotificationRoute.ts src/lib/getNotificationRoute.test.ts
git commit -m "feat(rewards): the DC Points bell names the action it paid for and links to /rewards"
```

---

### Task 8: Donny's rewards sub-agent

**Files:**
- Create: `supabase/functions/donny-orchestrator/agents/rewards.ts`
- Modify: `supabase/functions/donny-orchestrator/tools.ts`
- Modify: `supabase/functions/donny-orchestrator/index.ts`

**Interfaces:**
- Consumes: `dre_my_standing()` (Task 3), `getDragonEvent` (Task 1), `SubAgentResult` / `UserContext` from `../types.ts`.
- Produces: `execute(supabase, input, userContext): Promise<SubAgentResult>`, registered as the `rewards_agent` tool.

> **Identity rule.** The orchestrator's supabase client is service-role, so it bypasses RLS. Every read here is keyed to `userContext.user_id` — never an id from `input`. `dre_my_standing()` reads `auth.uid()`, which is null under the service-role client, so the agent must query the underlying tables directly with an explicit `user_id` filter rather than calling the RPC. (`dre_user_aggregates` is service-role callable, which is exactly what this agent has.)

- [ ] **Step 1: Write the sub-agent**

Create `supabase/functions/donny-orchestrator/agents/rewards.ts`:

```ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import { getDragonEvent, DRAGON_TIER_LABELS } from "../../_shared/dre-events.ts";

const RECENT_LIMIT = 10;

/**
 * DC Points questions — "how many points do I have", "what did I earn that for",
 * "what do I need for the next tier". Every read is keyed to userContext.user_id;
 * the orchestrator's client is service-role and bypasses RLS, so an id from
 * `input` must never scope a query here.
 */
export async function execute(
  supabase: SupabaseClient,
  _input: Record<string, unknown>,
  userContext: UserContext,
): Promise<SubAgentResult> {
  const userId = userContext.user_id;

  try {
    const [aggRes, balanceRes, ledgerRes, cfgRes] = await Promise.all([
      supabase.rpc("dre_user_aggregates", { p_user_ids: [userId] }),
      supabase
        .from("dragon_point_balances")
        .select("tier")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("dragon_point_events")
        .select("event_type, points_awarded, occurred_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from("dre_config")
        .select("config_key, config_value")
        .in("config_key", ["point_values", "tier_thresholds"]),
    ]);

    if (aggRes.error) throw aggRes.error;
    if (balanceRes.error) throw balanceRes.error;
    if (ledgerRes.error) throw ledgerRes.error;
    if (cfgRes.error) throw cfgRes.error;

    const agg = (aggRes.data ?? [])[0] ?? null;
    const cfg = Object.fromEntries(
      (cfgRes.data ?? []).map((r: { config_key: string; config_value: unknown }) => [
        r.config_key,
        r.config_value,
      ]),
    );
    const pointValues = (cfg.point_values ?? {}) as Record<string, number>;
    const prefix = agg?.role === "content_creator" ? "creator." : "business.";

    const context = JSON.stringify({
      standing: agg
        ? {
            balance: agg.balance ?? 0,
            standing: DRAGON_TIER_LABELS[balanceRes.data?.tier ?? "egg"] ?? "Rising",
            campaigns_completed: agg.campaigns_completed ?? 0,
            avg_rating: agg.avg_rating,
            role: agg.role,
          }
        : null,
      recent_awards: (ledgerRes.data ?? []).map((r: { event_type: string; points_awarded: number; occurred_at: string }) => ({
        what: getDragonEvent(r.event_type).label,
        points: r.points_awarded,
        when: r.occurred_at,
      })),
      tier_thresholds: cfg.tier_thresholds ?? null,
      ways_to_earn: Object.entries(pointValues)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({ what: getDragonEvent(k).label, points: v })),
      truth: "DC Points do not convert to money, credit, or discounts. Reaching a standing tier shows a public badge on the user's profile and nothing else. Never promise redemption, referrals, streaks, or perks.",
    });

    return {
      context,
      suggested_actions: [{ label: "View DC Points", route: "/rewards" }],
    };
  } catch (err) {
    console.error("[rewards_agent] error:", err);
    return {
      context: "Unable to read DC Points right now.",
      suggested_actions: [{ label: "View DC Points", route: "/rewards" }],
    };
  }
}
```

> The tier comes from `dragon_point_balances` rather than the aggregate because `dre_user_aggregates` returns raw metrics, not a resolved tier — the engine resolves that separately. It is mapped to a display label **before** reaching Donny (`standing: "Established"`), so an internal key can never leak into his answer.
>
> `tier_thresholds` is passed through raw so Donny can state the gap himself. Its entries carry the internal `key`, so the tool description must tell him to use the `standing` string for the user's current level and to name higher levels from the ladder Rising / Established / Pro / Elite / Icon in order — never a `key` value.

- [ ] **Step 2: Register the tool**

In `supabase/functions/donny-orchestrator/tools.ts`, add to `SUB_AGENT_TOOLS`, after `guidance_agent`:

```ts
  {
    name: "rewards_agent",
    description:
      "Use when the user asks about DC Points, their points balance, why they earned points, their standing or tier, or how to earn more. Returns the ASKING user's own balance, recent awards with what earned them, the tier thresholds, and every way to earn. Refer to the user's level using the `standing` string; name other levels from the ladder Rising, Established, Pro, Elite, Icon — never the internal `key` values in tier_thresholds. DC Points do not convert to money or discounts — never promise perks, redemption, referrals, or streaks.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The user's question" },
      },
      required: ["query"],
    },
  },
```

- [ ] **Step 3: Wire the dispatcher**

In `supabase/functions/donny-orchestrator/index.ts`, add the import beside the other agents (near line 15):

```ts
import * as rewardsAgent from "./agents/rewards.ts";
```

and the `agentMap` entry after `guidance_agent` (near line 100):

```ts
    rewards_agent: rewardsAgent.execute,
```

- [ ] **Step 4: Review before deploying**

Dispatch the `edge-function-reviewer` subagent on `donny-orchestrator` and the `data-exposure-reviewer` subagent on `agents/rewards.ts`. Both are read-only. Resolve any ISSUES verdict before Task 10 deploys anything.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add supabase/functions/donny-orchestrator/agents/rewards.ts supabase/functions/donny-orchestrator/tools.ts supabase/functions/donny-orchestrator/index.ts
git commit -m "feat(rewards): Donny answers DC Points questions from the caller's own standing"
```

---

### Task 9: Help article and RAG honesty

**Files:**
- Create: `supabase/migrations/20260807120100_dc_points_help_article.sql`
- Create: `supabase/migrations/20260807120200_dre_rag_internal_scope.sql`

- [ ] **Step 1: Write the help-article migration**

The existing `dragon-rewards` article has no numbers. `help_articles` uses `ON CONFLICT (slug)`, so this is an UPDATE. Create `supabase/migrations/20260807120100_dc_points_help_article.sql`:

```sql
-- Rewrite the DC Points help article with the real catalog and thresholds.
-- Donny's guidance_agent full-text searches this table, so this also improves
-- his answers. Earn-only: nothing here promises a perk or redemption.
update public.help_articles
set title = 'DC Points & Creator Standing',
    body = $body$
<p>You earn <strong>DC Points</strong> for real activity on DragonCandy. Your balance and full history are on your <a href="/rewards">DC Points page</a>, which also lists every way to earn.</p>

<h3>How creators earn</h3>
<ul>
  <li>Complete your creator profile — 250</li>
  <li>Link your first social account — 150</li>
  <li>Apply to your first campaign — 200</li>
  <li>Submit a DragonShare post — 75 each time</li>
  <li>First DragonShare post bonus — 225</li>
  <li>Complete your first campaign — 1,000</li>
  <li>Receive your first boost payout — 400</li>
  <li>Earn a 5-star review — 250 each time</li>
  <li>Campaign milestones — 1,000 at 3, 3,000 at 10, 5,000 at 25, 10,000 at 50</li>
</ul>

<h3>How businesses earn</h3>
<ul>
  <li>Complete your business profile — 200</li>
  <li>Link your first social account — 200</li>
  <li>Create your first campaign — 500</li>
  <li>Launch a campaign — 150 each time</li>
  <li>Complete your first campaign — 1,000</li>
  <li>Boost a creator post — 300 each time</li>
  <li>First boost bonus — 50</li>
  <li>Rate a creator — 100 each time</li>
  <li>Give a 5-star rating — 100 each time</li>
  <li>Campaign milestones — 1,500 at 5, 3,000 at 10, 5,000 at 25, 10,000 at 50</li>
</ul>

<h3>Standing</h3>
<p>Standing goes <strong>Rising → Established → Pro → Elite → Icon</strong>. A tier needs <em>both</em> a points total and real activity — points alone never move you up.</p>
<ul>
  <li><strong>Established</strong> — 500 points and 3 completed campaigns</li>
  <li><strong>Pro</strong> — 2,500 points and 10 completed campaigns (creators also need a 4.5 average rating)</li>
  <li><strong>Elite</strong> — 10,000 points and 50 completed campaigns (creators also need a 4.8 average rating)</li>
  <li><strong>Icon</strong> — 50,000 points</li>
</ul>

<h3>What standing does</h3>
<p>Your standing badge is shown publicly on your profile so businesses and creators can see how active you are. Your points balance is private to you. DC Points do not convert to money, credit, or discounts.</p>
$body$,
    search_terms = ARRAY['dc points','points','rewards','creator standing','tier','badge','rising','established','pro','elite','icon','how to earn points']::text[],
    updated_at = now()
where slug = 'dragon-rewards';
```

> Verified against prod: `help_articles` is `id, slug, title, body, category, roles, search_terms, updated_at, search_vector`. Every column this UPDATE touches exists; `search_vector` is generated, so do not write to it.

- [ ] **Step 2: Check whether the sync would undo the RAG fix**

Read `supabase/functions/donny-knowledge-sync/index.ts` and find where it sets `scope`. Two outcomes:

- If it derives `scope` from the file path (e.g. `docs/wiki/**` → consumer), then a one-off UPDATE **will be reverted** on the next sync, and the fix belongs in that derivation instead. In that case, extend the path rule so the two DRE engineering docs land as `internal`, and note it in the migration comment.
- If `scope` is set only on insert and preserved on update, the one-off UPDATE holds.

Record which case applies in the migration's header comment. Do not skip this step — the spec flags it as the open question for this task.

- [ ] **Step 3: Write the RAG-scope migration**

Create `supabase/migrations/20260807120200_dre_rag_internal_scope.sql`:

```sql
-- Consumer Donny could retrieve the DRE ENGINEERING docs — including the six-phase
-- system spec describing referrals, streaks, Hype Weeks, and point redemption, none
-- of which were built — because match_donny_knowledge's consumer filter returns
-- `scope IS NULL OR scope <> 'internal'` and these rows carry scope IS NULL.
-- Marking them internal stops Donny promising rewards that do not exist.
update public.donny_knowledge
set scope = 'internal', updated_at = now()
where metadata->>'path' in (
  'docs/wiki/concepts/dragon-rewards-engine.md',
  'docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md'
)
and (scope is null or scope <> 'internal');
```

- [ ] **Step 4: Apply both migrations to prod**

Apply via the Supabase MCP `apply_migration` (`project_id: zocahiffooqdybdhguqv`), one per call.

- [ ] **Step 5: Verify**

```sql
select scope, metadata->>'path' as path
from donny_knowledge
where metadata->>'path' like '%dragon-rewards-engine%'
   or metadata->>'path' like '%dre-full-system-spec%';
```
Expected: every row `scope = 'internal'`.

Then confirm the article updated:

```sql
select title, length(body) as len, body ilike '%do not convert to money%' as honest
from help_articles where slug = 'dragon-rewards';
```
Expected: one row, `honest = true`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260807120100_dc_points_help_article.sql supabase/migrations/20260807120200_dre_rag_internal_scope.sql
git commit -m "feat(rewards): real numbers in the help article; DRE engineering docs out of the consumer RAG"
```

---

### Task 10: Deploy, verify, and review

The RPC is a new object both the frontend and an edge function depend on. Reversed, they call a function that does not exist.

- [ ] **Step 1: Confirm migrations are live**

All three (`20260807120000`, `20260807120100`, `20260807120200`) applied and verified in Tasks 3 and 9.

- [ ] **Step 2: Run the full check suite**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
For `npm run test`, trust the "N passed, 0 failed" summary rather than the exit code — this repo exits 1 on ~103 pre-existing failed e2e files in nested worktrees. Confirm none of the new tests are among the failures.

- [ ] **Step 3: Deploy the two edge functions**

`dre-award-engine` is `verify_jwt=false`; `donny-orchestrator` is `verify_jwt=true`. The flags differ — do not copy one command to the other.

```bash
supabase functions deploy dre-award-engine --no-verify-jwt --project-ref zocahiffooqdybdhguqv
supabase functions deploy donny-orchestrator --project-ref zocahiffooqdybdhguqv
```

Both now import `_shared/dre-events.ts` (and the engine also `_shared/dre-notification.ts`) — a failed bundle silently keeps the old version, so confirm the version number incremented via the Supabase MCP `list_edge_functions` before trusting the deploy.

- [ ] **Step 4: Merge the frontend**

Open the PR, then run the mandatory independent Codex second review from the worktree:

```bash
codex review --base main --title "DC Points visibility"
```

Fix anything real it finds and re-run until clean. Relay its verdict. A "blocked by policy" sandbox message is expected, not a failure.

- [ ] **Step 5: Verify on prod after the deploy lands (~1–3 min)**

Use the `verify-prod` skill. Specifically confirm:
- The chip appears in the top bar at 1440px and 390px and navigates to `/rewards`.
- `/rewards` shows a real balance, a labeled history, and the earn catalog.
- No console errors on either viewport.
- Ask Donny "how many DC Points do I have and what did I earn them for?" and confirm he answers from the real ledger with a working "View DC Points" action.

- [ ] **Step 6: Prove the notification end to end**

Trigger one qualifying forward action on a prod test account (e.g. launch a campaign as a business — `business.campaign_launched`, 150). The cron runs every 5 minutes. Then confirm the bell reads *"You earned 150 DC Points / Launched a campaign"* and clicking it lands on `/rewards`.

If you would rather not create real prod data, invoke the engine directly and inspect the resulting `push_notifications` row instead:

```sql
select title, body, action_url, data
from push_notifications
where type = 'dragon_points_award'
order by created_at desc limit 3;
```

- [ ] **Step 7: Knowledge sync**

Run the `knowledge-sync` skill: write the session source to `docs/wiki/raw/sessions/`, `/wiki-ops ingest` it, prepend the entry to `docs/SHIPPED_LOG.md`, add the one-line index entry to `docs/PROJECT_CONTEXT.md` §5, and update `docs/wiki/concepts/dragon-rewards-engine.md` with the new surfaces. Include these in the PR.

After merge, refresh the local main checkout (`refresh-main` skill) so the post-merge hook re-syncs Donny's RAG.

---

## Notes for the implementer

- **`business.campaign_launched` pays 150 every time**, not just the first, and one prod business has already collected it seven times. Task 5 makes that public. This is deliberate and the founder has seen it — do not "fix" it. Retuning is a `dre_config` JSONB edit, not code.
- **Do not add perks, redemption, or a roadmap** anywhere in copy. Reaching a tier confers a public badge and nothing else. This is the spec's central decision.
- **MCP `execute_sql` returns only the last statement's result** — one statement per call, and wrap any proof-of-write in `begin; ... rollback;`.
