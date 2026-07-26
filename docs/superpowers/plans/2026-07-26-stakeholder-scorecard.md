# Stakeholder Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a plain-language `/internal/scorecard` page that tells four stakeholder-readable stories (traction, capital efficiency, scale headroom, revenue readiness) with auto signals under a founder-set headline, plus a print-optimized "Export snapshot" one-pager.

**Architecture:** A pure `scorecardModel.ts` turns reused real-only stats into four story cards; a small internal-gated `aios_stakeholder_burn()` aggregate RPC lets non-admin stakeholders see burn; the page + a print snapshot render the model. Deterministic phrasing (no LLM), real-only user metrics.

**Tech Stack:** React 18 + TS (strict), Vitest + @testing-library/react (jsdom per-file pragma), Supabase Postgres (SECURITY DEFINER RPC + KV settings), Tailwind (`dc-*`), the `/internal` shell primitives.

**Spec:** `docs/superpowers/specs/2026-07-26-stakeholder-scorecard-design.md`
**Branch:** `feat/internal-stakeholder-scorecard` (already created off `origin/main`; `npm install` done).

---

## File Structure

| File | Responsibility | New/Mod |
|---|---|---|
| `supabase/migrations/20260726173000_scorecard_settings_and_burn.sql` | Seed `scorecard_headline` + `scorecard_burn_ceiling` KV rows; create `aios_stakeholder_burn()` RPC | **New** |
| `src/hooks/internal/useScorecardSettings.ts` | Read headline + burn ceiling; admin `.update()` mutation | **New** |
| `src/hooks/internal/useScorecardBurn.ts` | Call `aios_stakeholder_burn()` | **New** |
| `src/hooks/internal/usePlatformWeight.ts` | Add `users_total_real?: number \| null` to the row/snapshot types | **Mod** |
| `src/lib/internal/scorecardModel.ts` (+ `.test.ts`) | `buildScorecard` + `growthLast30Days` + signal rules (pure) | **New** |
| `src/components/internal/ScorecardStoryCard.tsx` | One story card (signal · title · headline · meaning · detail) | **New** |
| `src/components/internal/ScorecardSnapshot.tsx` | Print-optimized light one-pager | **New** |
| `src/pages/internal/InternalScorecard.tsx` (+ `.test.tsx`) | The page (headline edit, 4 cards, export) | **New** |
| `src/components/internal/InternalLayout.tsx` | Add a "Scorecard" item to the Monitor nav group | **Mod** |
| `src/App.tsx` | Lazy-import + `<Route path="scorecard" …>` (NOT admin-gated) | **Mod** |

**Migration timestamp:** `20260726173000` — verify with `git grep 20260726173000 -- '*.sql'` (nothing) before writing (concurrent-worktree collision guard).

---

## Task 1: Migration — settings seed + aggregate-burn RPC

**Files:** Create `supabase/migrations/20260726173000_scorecard_settings_and_burn.sql`

Context: `aios_dashboard_settings` is a KV table (`key`,`value` jsonb) with an internal-SELECT policy and an `aios_dashboard_settings_admin_update` (admin UPDATE) policy — no client INSERT, so rows must be seeded here. `is_internal_user()` returns true for admin OR stakeholder and is the standard internal gate (used by `aios_platform_stats`/`aios_revenue_stats`). `aios_revenue_stats()` is internal-gated (callable by stakeholders); `aios_cost_stats()` is admin-only (do NOT call it here — inline the ledger sum).

- [ ] **Step 1: Write the migration**

```sql
-- Scorecard settings (KV rows) + a stakeholder-safe aggregate-burn RPC.
-- The /internal/scorecard page is viewable by non-admin stakeholder-invite accounts, but the burn
-- inputs (operating_expenses, donny_cost_ledger) are admin-only. This SECURITY DEFINER RPC returns
-- ONLY the aggregate burn figure (no line items, no per-model breakdown), gated to internal users.
-- Additive + idempotent. Apply is founder-gated (careful).

-- 1. Seed the two KV settings rows (admin UPDATE policy already exists; no client INSERT policy).
insert into public.aios_dashboard_settings (key, value)
values
  ('scorecard_headline', to_jsonb('Pre-revenue by design — building the marketplace'::text)),
  ('scorecard_burn_ceiling_cents', to_jsonb(40000))   -- $400.00 default ceiling for the green signal
on conflict (key) do nothing;

-- 2. Aggregate-burn RPC — internal-gated, aggregate-only.
create or replace function public.aios_stakeholder_burn()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_month_start timestamptz := date_trunc('month', now());
  v_opex_cents bigint;
  v_ai_usd numeric;
  v_rev_cents bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_internal_user() then raise exception 'forbidden: internal access required'; end if;

  select coalesce(sum(monthly_amount_cents), 0) into v_opex_cents
    from operating_expenses where active;

  select round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4) into v_ai_usd
    from donny_cost_ledger
    where created_at >= v_month_start and is_synthetic is not true;

  -- Reuse the internal-gated revenue RPC (DragonShare MTD platform fee, synthetic-excluded).
  v_rev_cents := coalesce((public.aios_revenue_stats() -> 'dragonshare_mtd' ->> 'platform_fee_cents')::bigint, 0);

  return jsonb_build_object(
    'monthly_opex_cents', v_opex_cents,
    'mtd_ai_spend_usd', v_ai_usd,
    'mtd_revenue_cents', v_rev_cents,
    'net_burn_cents', v_opex_cents + round(v_ai_usd * 100)::bigint - v_rev_cents
  );
end;
$function$;

revoke execute on function public.aios_stakeholder_burn() from public, anon;
grant execute on function public.aios_stakeholder_burn() to authenticated;

-- ===== VERIFICATION (coordinator runs at the careful gate — NOT applied by this migration) =====
-- Rollback-free, read-only. Fake an internal (non-admin) caller and confirm aggregate-only output:
--   begin;
--     select set_config('request.jwt.claim.sub', (select user_id::text from user_roles where role='stakeholder' limit 1), true);
--     set local role authenticated;
--     select public.aios_stakeholder_burn();  -- returns the 4 aggregate keys, no line items
--   rollback;
```

- [ ] **Step 2: Do NOT apply.** This is founder-gated (careful skill). Verify the timestamp is unique (`git grep 20260726173000 -- '*.sql'`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260726173000_scorecard_settings_and_burn.sql
git commit -m "feat(internal): scorecard settings KV + aggregate aios_stakeholder_burn RPC (migration, not applied)"
```

**Note for Task 6:** this RPC is SECURITY DEFINER bypassing admin-only RLS → it MUST go through the `data-exposure-reviewer` subagent (aggregate-only, is_internal_user gate) before the Codex pass.

---

## Task 2: Hooks + platform-weight typing

**Files:** Create `src/hooks/internal/useScorecardSettings.ts`, `src/hooks/internal/useScorecardBurn.ts`; modify `src/hooks/internal/usePlatformWeight.ts`.

- [ ] **Step 1: `useScorecardSettings.ts`** (mirror `useCurrentTierIndex`'s KV read; add an admin update)

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_HEADLINE = 'Pre-revenue by design — building the marketplace';
const DEFAULT_BURN_CEILING_CENTS = 40000;

async function readSetting(key: string) {
  const { data, error } = await supabase
    .from('aios_dashboard_settings').select('value').eq('key', key).maybeSingle();
  if (error) { console.error('aios_dashboard_settings read failed:', error); throw error; }
  return data?.value;
}

export function useScorecardHeadline() {
  return useQuery({
    queryKey: ['aios', 'dashboard-settings', 'scorecard_headline'],
    queryFn: async (): Promise<string> => {
      const v = await readSetting('scorecard_headline');
      return typeof v === 'string' && v.trim() ? v : DEFAULT_HEADLINE;
    },
  });
}

export function useScorecardBurnCeilingCents() {
  return useQuery({
    queryKey: ['aios', 'dashboard-settings', 'scorecard_burn_ceiling_cents'],
    queryFn: async (): Promise<number> => {
      const n = Number(await readSetting('scorecard_burn_ceiling_cents') ?? DEFAULT_BURN_CEILING_CENTS);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BURN_CEILING_CENTS;
    },
  });
}

/** Admin-only headline edit — relies on the existing aios_dashboard_settings_admin_update RLS. */
export function useUpdateScorecardHeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (headline: string) => {
      const { error } = await supabase
        .from('aios_dashboard_settings')
        .update({ value: headline })
        .eq('key', 'scorecard_headline');
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['aios', 'dashboard-settings', 'scorecard_headline'] }),
  });
}
```

- [ ] **Step 2: `useScorecardBurn.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StakeholderBurn {
  monthly_opex_cents: number;
  mtd_ai_spend_usd: number;
  mtd_revenue_cents: number;
  net_burn_cents: number;
}

export function useScorecardBurn() {
  return useQuery({
    queryKey: ['aios', 'stakeholder-burn'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aios_stakeholder_burn');
      if (error) { console.error('aios_stakeholder_burn failed:', error); throw error; }
      return data as unknown as StakeholderBurn;
    },
  });
}
```

- [ ] **Step 3: Type `users_total_real`** in `usePlatformWeight.ts` — add `users_total_real?: number | null;` to the `PlatformWeightRow` interface (it is already fetched by the select but untyped). If `weightThresholds.ts`'s `WeightSnapshot` is used for these snapshots, add it there too.

- [ ] **Step 4:** `npm run typecheck` → PASS. **Commit**

```bash
git add src/hooks/internal/useScorecardSettings.ts src/hooks/internal/useScorecardBurn.ts src/hooks/internal/usePlatformWeight.ts
git commit -m "feat(internal): scorecard settings + burn hooks; type users_total_real"
```

---

## Task 3: Pure model — `scorecardModel.ts` (TDD)

**Files:** Create `src/lib/internal/scorecardModel.ts` + `src/lib/internal/scorecardModel.test.ts`

- [ ] **Step 1: Write the failing test** (`scorecardModel.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { buildScorecard, growthLast30Days } from './scorecardModel';

const WEIGHT = [
  { captured_at: '2026-06-26T00:00:00Z', db_bytes: 70 * 1024 * 1024, users_total_real: null },
  { captured_at: '2026-07-23T00:00:00Z', db_bytes: 78 * 1024 * 1024, users_total_real: 34 },
  { captured_at: '2026-07-26T00:00:00Z', db_bytes: 78 * 1024 * 1024, users_total_real: 40 },
];
const INPUT = {
  realUsers: 40,
  realCreators: 17,
  realBusinesses: 17,
  realCampaigns: 25,
  realPosts: 10,
  weightSnapshots: WEIGHT,
  diskLimitBytes: 8 * 1024 * 1024 * 1024,
  burn: { monthly_opex_cents: 39000, mtd_ai_spend_usd: 12, mtd_revenue_cents: 0, net_burn_cents: 40200 },
  burnCeilingCents: 40000,
  aiUnderCap: true,
};

function stories() {
  const out: Record<string, ReturnType<typeof buildScorecard>[number]> = {};
  for (const s of buildScorecard(INPUT)) out[s.key] = s;
  return out;
}

describe('growthLast30Days', () => {
  it('uses only non-null users_total_real snapshots', () => {
    expect(growthLast30Days(WEIGHT)).toBe(6); // 40 - 34; the null June snapshot is skipped
  });
  it('returns null when <2 non-null snapshots', () => {
    expect(growthLast30Days([{ captured_at: '2026-07-26T00:00:00Z', db_bytes: 1, users_total_real: 40 }])).toBeNull();
    expect(growthLast30Days([])).toBeNull();
  });
});

describe('buildScorecard', () => {
  const s = stories();
  it('traction: headline + green when not declining', () => {
    expect(s.traction.headline).toContain('40');
    expect(s.traction.detail).toContain('6'); // +6 in ~30 days
    expect(s.traction.signal).toBe('green');
  });
  it('efficiency: amber when net burn over ceiling', () => {
    expect(s.efficiency.headline).toContain('$402'); // 40200 cents
    expect(s.efficiency.signal).toBe('amber'); // 40200 > 40000 ceiling
  });
  it('headroom: ~100x and green under 70%', () => {
    expect(s.headroom.headline).toMatch(/~1\d\dx|~100x/); // 8GB / 78MB ≈ 105 → clamped ~100x
    expect(s.headroom.signal).toBe('green');
  });
  it('revenue: always info', () => {
    expect(s.revenue.signal).toBe('info');
    expect(s.revenue.headline.toLowerCase()).toContain('pre-revenue');
  });
});

describe('buildScorecard — degradation', () => {
  it('traction omits detail when no usable history', () => {
    const s = buildScorecard({ ...INPUT, weightSnapshots: [] });
    const traction = s.find((x) => x.key === 'traction')!;
    expect(traction.detail).toBeUndefined();
    expect(traction.signal).toBe('green'); // present users, not declining
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/internal/scorecardModel.test.ts` → FAIL (no module).

- [ ] **Step 3: Implement `scorecardModel.ts`**

```ts
/**
 * Plain-language stakeholder scorecard model — pure, deterministic (NO LLM). Turns reused real-only
 * stats into four stories a non-technical stakeholder can read and speak to. See the design spec.
 */
export type Signal = 'green' | 'amber' | 'info';

export interface ScorecardStory {
  key: 'traction' | 'efficiency' | 'headroom' | 'revenue';
  title: string;
  headline: string;
  meaning: string;
  signal: Signal;
  detail?: string;
}

export interface WeightPoint {
  captured_at: string;
  db_bytes: number;
  users_total_real?: number | null;
}

export interface ScorecardInput {
  realUsers: number;
  realCreators: number;
  realBusinesses: number;
  realCampaigns: number;
  realPosts: number;
  weightSnapshots: WeightPoint[];
  diskLimitBytes: number;
  burn: { monthly_opex_cents: number; mtd_ai_spend_usd: number; mtd_revenue_cents: number; net_burn_cents: number };
  burnCeilingCents: number;
  aiUnderCap: boolean;
}

const DAY = 86_400_000;

/** Real-user delta over ~30 days from platform_weight, skipping NULL users_total_real snapshots
 *  (NULL on pre-2026-07-23 rows — coercing to 0 would render a false spike). null if <2 usable pts. */
export function growthLast30Days(snapshots: WeightPoint[]): number | null {
  const pts = snapshots
    .filter((s) => typeof s.users_total_real === 'number')
    .map((s) => ({ t: new Date(s.captured_at).getTime(), n: s.users_total_real as number }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  // earliest point within the trailing 30-day window (fallback to the first usable point).
  const windowStart = last.t - 30 * DAY;
  const base = pts.find((p) => p.t >= windowStart) ?? pts[0];
  return last.n - base.n;
}

const fmtUsd0 = (usd: number) => `$${Math.round(usd).toLocaleString()}`;
/** Friendly headroom multiple: floor to a round-ish figure so "~105x" reads as "~100x". */
function clampFriendly(mult: number): number {
  if (mult >= 100) return Math.round(mult / 50) * 50;   // 105 → ~100, 140 → ~150
  if (mult >= 10) return Math.round(mult / 10) * 10;
  return Math.max(1, Math.floor(mult));
}

export function buildScorecard(i: ScorecardInput): ScorecardStory[] {
  // Traction
  const delta = growthLast30Days(i.weightSnapshots);
  const traction: ScorecardStory = {
    key: 'traction',
    title: 'Traction',
    headline: `${i.realUsers.toLocaleString()} real people are building on DragonCandy`,
    meaning: `Real creators and businesses — not test data — using the marketplace end to end (${i.realCreators} creators, ${i.realBusinesses} businesses, ${i.realCampaigns} campaigns, ${i.realPosts} posts shared).`,
    signal: delta !== null && delta < 0 ? 'amber' : 'green',
    detail: delta !== null ? `${delta >= 0 ? '+' : ''}${delta} in the last 30 days` : undefined,
  };

  // Capital efficiency
  const burnUsd = i.burn.net_burn_cents / 100;
  const efficiency: ScorecardStory = {
    key: 'efficiency',
    title: 'Capital efficiency',
    headline: `We run the whole platform for ~${fmtUsd0(burnUsd)}/month`,
    meaning: 'Total cost to operate — infrastructure, AI, and tools — minus any revenue. Lean by design.',
    signal: i.burn.net_burn_cents <= i.burnCeilingCents && i.aiUnderCap ? 'green' : 'amber',
    detail: i.aiUnderCap ? undefined : 'AI spend approaching the 15%-of-revenue cap',
  };

  // Scale headroom — physical infra capacity (synthetic-inclusive db_bytes; conservative). See spec §4.
  const latest = [...i.weightSnapshots].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  ).pop();
  const dbBytes = latest?.db_bytes ?? 0;
  const mult = dbBytes > 0 ? clampFriendly(i.diskLimitBytes / dbBytes) : null;
  const ratio = dbBytes / i.diskLimitBytes;
  const headroom: ScorecardStory = {
    key: 'headroom',
    title: 'Scale headroom',
    headline: mult ? `Room to grow ~${mult.toLocaleString()}× before infrastructure costs rise` : 'Ample infrastructure headroom',
    meaning: 'Current infrastructure usage (physical, incl. test data — so this is conservative) is a tiny fraction of the plan. We scale cheaply for a long time.',
    signal: ratio < 0.7 ? 'green' : 'amber',
  };

  // Revenue readiness — framing, always info.
  const revenue: ScorecardStory = {
    key: 'revenue',
    title: 'Revenue readiness',
    headline: 'Pre-revenue by design — the money switch is built, not flipped',
    meaning: 'Payment rails are live in test mode: Stripe Connect, the Free 10% → … → 2% take-rate ladder, and DragonShare 80/20 boosts. Turning on paid campaigns is a switch, not a build.',
    signal: 'info',
  };

  return [traction, efficiency, headroom, revenue];
}
```

- [ ] **Step 4:** Run the test → PASS. **Commit**

```bash
git add src/lib/internal/scorecardModel.ts src/lib/internal/scorecardModel.test.ts
git commit -m "feat(internal): pure scorecard model + growthLast30Days (TDD)"
```

---

## Task 4: Presentational components

**Files:** Create `src/components/internal/ScorecardStoryCard.tsx`, `src/components/internal/ScorecardSnapshot.tsx`

- [ ] **Step 1: `ScorecardStoryCard.tsx`** — one card, dark ops-deck styling (match the `/internal` card look: `rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm`). Props: `{ story: ScorecardStory }`. Render: a signal dot (green `bg-dc-teal`, amber `bg-dc-pink-accent`, info `bg-white/40`), the `title` (mono uppercase, like `StatCard` labels), the `headline` big/bold, the `meaning` in `text-white/60`, and `detail` (if present) in `text-dc-teal text-sm`.

- [ ] **Step 2: `ScorecardSnapshot.tsx`** — a **light-theme, print-optimized** self-contained layout for export. Props: `{ headline: string; stories: ScorecardStory[]; asOf: string }`. Plain white background, dark text, the headline, an "as of {asOf}" line, and the 4 stories as simple rows (title · headline · meaning · signal as a text label like "On track"/"Watch"/"—", NOT color-only, for print). Wrap in a container with an `id="scorecard-snapshot"` and print CSS (`@media print`) that hides everything else. It renders inside a modal/overlay; the page's Export button opens it and calls `window.print()`.

- [ ] **Step 3:** `npm run typecheck` + `npm run lint` → PASS. **Commit**

```bash
git add src/components/internal/ScorecardStoryCard.tsx src/components/internal/ScorecardSnapshot.tsx
git commit -m "feat(internal): scorecard story card + print-optimized snapshot"
```

---

## Task 5: The page + route + nav

**Files:** Create `src/pages/internal/InternalScorecard.tsx` + `src/pages/internal/InternalScorecard.test.tsx`; modify `src/components/internal/InternalLayout.tsx`, `src/App.tsx`.

- [ ] **Step 1: `InternalScorecard.tsx`** — compose the hooks + model + components:
  - Hooks: `usePlatformStats` (real counts), `usePlatformWeight` (snapshots), `useScorecardBurn`, `useScorecardHeadline` + `useScorecardBurnCeilingCents`, `useRevenueStats` (for the revenue story facts), `useInternalAccess` (`isAdmin`). Compute `aiUnderCap` via `aiCapStatus(mtd_ai_spend_usd, mtd_revenue_cents/100).status === 'green'` (import from `@/lib/aiCostCap`).
  - Build stories with `buildScorecard(...)` using `DISK_LIMIT_BYTES` from `weightThresholds`.
  - Render: `PageHeader title="How DragonCandy is doing"` with an admin-only **Export snapshot** action; the **founder headline** (admin: inline-editable via `useUpdateScorecardHeadline` + a save; non-admin: read-only text); an **"as of {date} · real users only"** stamp; then `<ScorecardStoryCard>` × 4 in a responsive grid.
  - Each card degrades independently: if a needed hook errored, that card shows a "—" headline (never blank the page); the page-level guard only trips if `platform` itself fails to load (mirror `InternalOverview`'s top guard).
  - Export: a state toggle renders `<ScorecardSnapshot>` (light) and calls `window.print()`.

- [ ] **Step 2: Route** in `src/App.tsx` — add `const InternalScorecard = lazy(() => import("./pages/internal/InternalScorecard"));` and, alongside the other internal routes, `<Route path="scorecard" element={<InternalScorecard />} />`. **Do NOT wrap in `<InternalRoute tier="admin">`** — stakeholders must view it (match the `weight` route, which is not admin-gated).

- [ ] **Step 3: Nav** in `src/components/internal/InternalLayout.tsx` — add to the **Monitor** group items: `{ to: '/internal/scorecard', label: 'Scorecard', icon: <pick a lucide icon, e.g. Presentation or LineChart> }` (import the icon). Place it first in Monitor (it's the headline view).

- [ ] **Step 4: Component test** (`InternalScorecard.test.tsx`, first two lines `// @vitest-environment jsdom` + `import "@testing-library/jest-dom";`) — mock the hooks; assert: all 4 story titles render; the burn card shows a value for a non-admin (burn comes from the RPC hook, not admin gating); the headline is editable + Export button present for admin, read-only/absent for a non-admin viewer.

- [ ] **Step 5:** `npm run typecheck` + `npm run lint` + `npx vitest run src/pages/internal/InternalScorecard.test.tsx src/lib/internal/scorecardModel.test.ts` → PASS. **Commit**

```bash
git add src/pages/internal/InternalScorecard.tsx src/pages/internal/InternalScorecard.test.tsx src/components/internal/InternalLayout.tsx src/App.tsx
git commit -m "feat(internal): /internal/scorecard page + route + nav"
```

---

## Task 6: Full verification + reviews

**Files:** none (verification only)

- [ ] **Step 1:** `npm run build` → PASS.
- [ ] **Step 2:** `npm run lint` → PASS.
- [ ] **Step 3:** `npm run test` → the new suites pass (trust "N passed, 0 failed"; the repo's `npm run test` exits non-zero on pre-existing e2e files).
- [ ] **Step 4: `data-exposure-reviewer` subagent** on the new RPC + migration (it bypasses admin-only RLS via SECURITY DEFINER — confirm aggregate-only, `is_internal_user()` gate, no line-item leak, correct REVOKE/GRANT). Fix any findings.
- [ ] **Step 5: Codex second review** — `codex review --base main --title "stakeholder scorecard"`; fix until clean; relay the verdict.
- [ ] **Step 6:** Commit any review fixes.

---

## Done / Deploy (careful gate — after merge)

1. **Apply migration `20260726173000` at the careful gate** — seeds the two KV rows + creates `aios_stakeholder_burn()`. Verify with the in-file rollback-wrapped block (fake a non-admin internal caller → aggregate-only output).
2. **`verify-prod`** on `/internal/scorecard` (desktop + mobile; console clean; confirm a non-admin stakeholder sees all four cards incl. burn).
3. **`knowledge-sync`** — wiki concept ([[Stakeholder Scorecard]]), SHIPPED_LOG entry, PROJECT_CONTEXT §5 (move sub-project 4 from scoped → built), Donny RAG after merge.

## Notes for the implementer

- **Deterministic phrasing only** — never call an LLM to write scorecard copy.
- **Do not** wire `useCostStats`/`useOperatingExpenses` into this page — burn comes from `aios_stakeholder_burn()` (those hooks are admin-only and would break for stakeholders).
- Headroom uses physical `db_bytes` on purpose (infra capacity, conservative) — do not try to "real-only" it (there is no `db_bytes_real`).
- Keep the scorecard **real-only** for user/traction/revenue counts (reuse `aios_platform_stats` real fields, not `*_all`).
