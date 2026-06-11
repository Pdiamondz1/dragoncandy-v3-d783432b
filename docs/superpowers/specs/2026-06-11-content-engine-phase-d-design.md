# Content Engine — Phase D: Creator Brief History + Performance Read Surface

**Date:** 2026-06-11
**Status:** Approved (brainstorm) — pending spec review
**Author:** Dame (with Claude Code)
**Depends on:** Phase A (content-performance capture, PR #59), Phase B (brief → DragonShare action,
PRs #60–#63), Phase C (brief↔published-post link, PR #73)

---

## Goal

Surface the Content Engine loop to the creator who started it. Phase C closed the loop *server-side*
— a brief-originated post that gets published links its engagement back to the brief — but no UI
shows a creator their briefs or that engagement. Phase D ships the **lean** read surface: a
creator-dashboard **"Your content briefs"** card listing the briefs a creator generated, each with a
lifecycle status that lights up with real metrics as they arrive.

## Why now / why lean

`content_performance` is effectively **empty in prod** (no paying boosts yet; Outstand Phase-4
analytics still partial — the data audit calls performance "dark"). Building metric dashboards
against empty data is premature. But there is **real present-day value independent of metrics**:
today the brief generator (`ContentIdeaCard`) is **generate-and-forget** — briefs are persisted to
`content_briefs` (already indexed `(creator_id, created_at desc)`) yet a creator can never see them
again. A brief-history card delivers value now (revisit past briefs, re-enter DragonShare to act on
them) and the *same* card surfaces metrics the instant they flow — no rebuild.

So Phase D = **persistence first, metrics when present**. Out of scope: per-brief detail page,
charts, "regenerate from this brief," any edge-function change.

## The RLS problem (the heart of this slice)

Phase C's capture loop writes `content_performance.user_id` = whoever clicked **"Post Now"** on the
boost auto-draft. Per the one-draft-per-connected-party fan-out, that is **often the restaurant**, not
the creator. The table's RLS is owner-only:

```sql
-- 20260610140000_content_performance.sql
create policy "Users read own content performance"
  on public.content_performance for select
  to authenticated using ( (select auth.uid()) = user_id );
```

A brief's author is the **creator** (`content_briefs.creator_id`). So a creator **cannot** read their
own brief's performance through the table — the rows are owned by the restaurant.

**Solution:** a single `SECURITY DEFINER` RPC, `get_creator_brief_performance`, scoped to
`content_briefs.creator_id = auth.uid()`. It joins the creator's briefs to `content_performance` via
`source_brief_id` and returns aggregated metrics. This:

- leaves the table policy **owner-only** (writes stay trustworthy — users can't forge numbers);
- gives the creator a **scoped** read of *only their own briefs'* performance (the `creator_id =
  auth.uid()` join is the sole authorization — it cannot leak another creator's briefs or a
  restaurant's other posts);
- mirrors the established definer-RPC pattern (`resolve_dragonshare_orgs`, `search_restaurants`).

This is the ledger-first discipline applied to a read: the cross-user bridge is a narrow,
ownership-gated function, not a loosened table policy.

## Architecture

```
CreatorDashboard
  └─ BriefPerformanceCard               (new; mirrors DragonShareActivityCard chrome)
       ├─ useCreatorBriefPerformance    (new hook → supabase.rpc('get_creator_brief_performance'))
       │    └─ get_creator_brief_performance(result_limit)   (new SECURITY DEFINER RPC)
       │         content_briefs (creator_id = auth.uid())
       │           left join (latest-milestone-per-post snapshot of content_performance
       │                      keyed by source_brief_id)
       ├─ useResolveDragonShareOrgs     (REUSED — restaurant display names from organization_id)
       └─ deriveBriefStatus(row)        (new pure fn, unit-tested)
```

### Data unit — the RPC

`get_creator_brief_performance(result_limit int default 10)` — `language sql`, `security definer`,
`set search_path = public`, `stable`. Returns one row per brief (newest first):

| column | source |
|---|---|
| `brief_id, organization_id, created_at, used_performance_data, brief (jsonb)` | `content_briefs` |
| `is_posted boolean` | `social_post_log_id is not null` |
| `post_count bigint` | distinct linked posts |
| `total_views/likes/comments/shares numeric`, `avg_engagement_rate numeric`, `last_captured_at` | aggregated `content_performance` |

**Correctness — latest-milestone-per-post.** `content_performance` holds up to **three** rows per
post (24h / 72h / 7d; `unique(outstand_post_id, milestone)`). A naive `sum(views)` across a brief's
linked rows would multiply-count. The RPC first reduces to the **most-mature snapshot per post** via a
`distinct on (outstand_post_id)` CTE ordered by milestone rank (`7d` > `72h` > `24h`) then
`captured_at desc`, *then* aggregates across the (possibly several) sibling posts tracing to the
brief. Aggregates are `NULL`/`0` until data flows.

**Grants** (Phase-C discipline — a fresh `SECURITY DEFINER` fn in `public` is otherwise a public RPC,
Supabase advisors 0028/0029): `revoke execute ... from public, anon;` `grant execute ... to
authenticated;`. Unlike the Phase-C *trigger* functions (which revoke from everyone), this one **is**
granted to `authenticated` because the frontend calls it via `supabase.rpc`; the `auth.uid()`
predicate inside is the authorization.

### UI units

- **`useCreatorBriefPerformance`** (`src/hooks/`) — React Query, key `['creator-brief-performance',
  user?.id]`, `enabled: !!user`, `supabase.rpc('get_creator_brief_performance', { result_limit: 10
  })`, returns `(data ?? []) as CreatorBriefPerformanceRow[]` (a **local** interface — no `types.ts`
  regen, mirroring `useResolveDragonShareOrgs`). Errors thrown per conventions.
- **`deriveBriefStatus(row)`** (`src/lib/briefStatus.ts`, pure, unit-tested) → `'awaiting_post' |
  'measuring' | 'has_performance'`: `!is_posted` → `awaiting_post`; posted but `post_count === 0` →
  `measuring`; `post_count > 0` → `has_performance`.
- **`BriefPerformanceCard`** (`src/components/dragonshare/`) — sibling of `DragonShareActivityCard`,
  reusing its card chrome (teal-border `rounded-2xl bg-white`, uppercase teal title, skeleton, empty
  state, list rows). Title "Your content briefs". Renders **all** rows the hook returns (the hook and
  card share one limit — default 10; there is no "view all" surface, so do not over-fetch). Each row:
  restaurant name (via `useResolveDragonShareOrgs` on the rows' `organization_id`s — note the brief
  rows key on `organization_id`, not `target_org_id`, so map by hand rather than reusing
  `mergeResolvedOrgs` unchanged), a format/platform chip read from the brief jsonb
  (`brief->>'recommended_format'` and `brief->>'platform'` — the `ContentBrief` shape in
  `useContentBrief.ts`; **omit the chip entirely when a value is absent — never render a gray
  "Unknown" placeholder**), relative timestamp, and a status pill / headline-metric line driven by
  `deriveBriefStatus`. Status pills copy the existing card's exact classes (`bg-dc-teal/15
  text-dc-teal-btn` / `bg-amber-100 text-amber-800` / `bg-emerald-100 text-emerald-700`) — **no
  gray**. Mobile base classes; mirror the existing card's responsive behavior.
- **`CreatorDashboard`** — render `<BriefPerformanceCard />` alongside `ContentIdeaCard` /
  `DragonShareActivityCard`, same card-grid placement.

## Data flow

1. Creator opens dashboard → `useCreatorBriefPerformance` calls the RPC.
2. RPC returns their briefs newest-first with `NULL`/`0` metrics (today's reality) or real aggregates.
3. `useResolveDragonShareOrgs` turns each `organization_id` into a restaurant display name.
4. Each row renders its `deriveBriefStatus` state: **Not posted yet** → **Measuring…** → metrics.

## Error & empty states

- RPC error → React Query error; card shows a brand-styled inline error (no crash; `ErrorBoundary`
  remains the outer net).
- No briefs → empty state ("Generate a content brief to see it here").
- Briefs but no performance (today's norm) → rows render with **"Not posted yet"** / **"Measuring…"**
  pills; this is correct, not an error.

## Testing

- **Unit:** `src/lib/briefStatus.test.ts` (vitest) covers all three `deriveBriefStatus` branches +
  edge (`is_posted` true with `post_count` 0 vs >0).
- **DB:** staging SQL probe (MCP `execute_sql`) — seed one brief + two sibling posts each with 24h+72h
  rows; run the RPC body with a **literal** creator id (auth.uid() is null under service role) and
  assert `post_count = 2` and `total_views` = sum of the **72h** snapshot per post (proves
  latest-milestone-per-post). Second brief with no perf → `is_posted=false`, `post_count=0`. Grant
  check via `has_function_privilege`; `get_advisors` shows no new 0028/0029. Clean up seeds.
- **Build:** `npm run build` + `npm run typecheck` (strict) green.

## Deployment (mirrors Phase A/B/C discipline; prod steps gated on founder go-ahead)

Migration → frontend merge. **No edge-function deploy** (Phase C already forwards `source_brief_id`).
Per the deploy-ordering rule, the prod migration lands **before** the frontend merges (the frontend
calls the RPC). Staging first (probe + grant/advisor), then prod (same checks), then PR + CI-gated
merge (repo disallows auto-merge), refresh local main, prod-verify the creator dashboard on desktop +
mobile.

## Risks & mitigations

- **Empty data reads as "broken."** → Status pills make the pending state explicit and intentional
  ("Not posted yet" / "Measuring…"), and the card's present value (brief history) doesn't depend on
  metrics.
- **Multi-milestone double-count.** → latest-milestone-per-post CTE (verified by the staging probe).
- **Definer-RPC leak.** → consumer-default authorization is the `creator_id = auth.uid()` join;
  grants revoke `public`/`anon`; advisor re-run.
- **`src/integrations/supabase/client.ts` is Lovable-autogenerated** → not touched (local cast avoids
  `types.ts` regen).

## Out of scope (YAGNI)

Per-brief detail route/page; charts/sparklines; "regenerate from this brief"; any
`content-performance-capture` change; `types.ts` regen; any table-RLS change.

## See also

- `docs/wiki/concepts/content-engine.md` — the loop + Phase A/B/C
- `docs/superpowers/specs/2026-06-11-content-engine-phase-c-design.md` — the server-side link
- `docs/wiki/analyses/content-engine-data-audit.md` — what signal data exists in prod
