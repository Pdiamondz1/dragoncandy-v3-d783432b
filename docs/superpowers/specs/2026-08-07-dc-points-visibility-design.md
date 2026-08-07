# DC Points — visibility, explanation, and Donny knowledge

**Date:** 2026-08-07
**Status:** design approved, not implemented
**Concept page:** `docs/wiki/concepts/dragon-rewards-engine.md`

## 1. The problem, as observed

A business user (screenshot, preview environment) received an in-app bell reading
**"You earned DC Points / +200 DC Points"** and had no way to learn what he had done to
earn them. The founder's own guess — "registering, or creating a campaign" — was wrong on
both counts: registering pays 0, and creating a campaign pays 500 + 150. A +200 award to a
business is `business.profile_completed` or `business.first_social`. Answering the question
required a SQL query against `dragon_point_events`.

That is the whole defect. The information exists; nothing displays it.

### Verified prod state (`zocahiffooqdybdhguqv`, 2026-08-07)

The Dragon Rewards Engine is **fully live**, not dark:

| Fact | Value |
|-|-|
| `feature_flags.DRAGON_REWARDS_ENABLED` | `true` (since 2026-06-28) |
| `dre_config.go_live_at` | `2026-06-28T10:07:57Z` (real cutover, not the sentinel) |
| `dragon_point_balances` | 26 users, 25,150 points total |
| `dre_config.point_values` | 25 event types (12 creator, 13 business) |
| Most recent award | 2026-08-02, `business.campaign_launched` |

### What is missing

1. **The bell drops the reason.** `dre-award-engine` coalesces a run's awards per user,
   sums `points_awarded`, and sends `data: { points, tier }` — the `event_type` is
   discarded. No `actionUrl` is set, so clicking the notification navigates nowhere.
2. **Points appear on two pages only.** `DragonPointsCard` (balance + tier word, no link)
   renders on `CreatorDashboard` and `BusinessDashboard`. Nowhere else in the app.
3. **No destination.** There is no rewards page. `dragon_point_events` has own-row SELECT
   RLS and `dre_config` has authenticated SELECT — the history, the earn catalog, and the
   tier thresholds are *already client-readable*. None of it is rendered.
4. **The help article has no numbers.** `help_articles.dragon-rewards` ("DC Points &
   Creator Standing") says "Sharing content and getting it boosted", "Completing campaigns"
   — no point values, no thresholds, no way to act on it.
5. **Donny can promise things that do not exist.** Verified against the live function:
   `match_donny_knowledge(scope_filter <> 'internal')` returns rows where
   `scope IS NULL OR scope <> 'internal'`, and two `scope IS NULL` rows are the DRE
   *engineering* docs — including the 29,810-char six-phase system spec describing
   referrals, streaks, Hype Weeks, and point redemption, **none of which were built**.

## 2. Decisions

### 2.1 Earn-only honesty (founder decision)

Reaching a tier confers **nothing** today: no perk, no discount, no access — only a public
badge. Redemption is Phase 5 of the parent spec and was deliberately deferred pre-revenue.

This work therefore ships as **transparency, not a reward economy**. The page states what
is true, including that points do not convert to money or discounts today. There is no
"coming soon" strip: on a pre-revenue product an unshipped promise is worse than silence,
and it is precisely the failure mode the [[Honest Analytics]] work corrected elsewhere.

Designing the perk economy (take-rate tiers, priority matching, featured placement, free
DragonDash rush) is **out of scope** and remains a business decision with margin exposure.

### 2.2 Always-visible (founder decision)

A live balance chip sits in the top bar on every authenticated page, both viewports. The
chip *is* the nav entry — tapping it opens the page — so no sidebar/drawer item is added.

### 2.3 Donny answers personally (founder decision)

Donny gets a `rewards` sub-agent that reads the asking user's own standing, not just the
help article. He can answer "how many points do I have", "what did I earn that for", and
"what do I need for the next tier".

## 3. Non-goals

- Any perk, redemption, discount, or access tied to a tier.
- Referrals, streaks, daily boosts, leaderboards (deferred parent-spec phases).
- Retuning `point_values` or `tier_thresholds` (a JSONB edit, not a deploy — see §9).
- Brand-role rewards. DRE has no brand triggers and `BRAND_ROLE_ENABLED` hides the role.
- Reviewing the general policy of engineering wiki pages in the consumer RAG (§8).

## 4. Architecture

Seven units, each independently understandable and testable.

| Unit | Responsibility | Depends on |
|-|-|-|
| `dre_my_standing()` RPC | The one definition of "where the caller stands" | `dre_user_aggregates` |
| `src/lib/dragonEvents.ts` | `event_type` → human label + one-time/repeatable | — |
| `supabase/functions/_shared/dre-events.ts` | Same map, edge-side | — |
| `useDcPoints` hooks | Standing, ledger, catalog reads | RPC, `dre_config`, ledger |
| `/rewards` page | Renders the four blocks | hooks, label map |
| `DcPointsChip` | Always-visible balance + entry point | `useDragonPoints` |
| `rewards` Donny sub-agent | Personal answers in chat | RPC, ledger, label map |

Plus two data-only changes: the `dre-award-engine` notification body, and the help-article
+ RAG-scope migrations.

### 4.1 `dre_my_standing()` — new RPC

The tier gap needs `campaigns_completed` and `avg_rating`. Both are already computed by
`dre_user_aggregates(uuid[])`, which is `SECURITY DEFINER` and **service-role only**. Rather
than duplicating that SQL client-side (and risking a page that disagrees with the engine
about your own tier), add a caller-scoped wrapper. A `SECURITY DEFINER` function executes
with its owner's privileges, so it may call the revoked aggregate.

```sql
create or replace function public.dre_my_standing()
returns table (
  role text, balance int, tier text, campaigns_completed int, avg_rating numeric,
  last_activity_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden: authentication required';
  end if;
  return query
    select a.role, a.balance, coalesce(b.tier, 'egg'), a.campaigns_completed,
           a.avg_rating, a.last_activity_at
    from public.dre_user_aggregates(array[auth.uid()]) a
    left join public.dragon_point_balances b on b.user_id = auth.uid();
end;
$$;

revoke all on function public.dre_my_standing() from public, anon;
grant execute on function public.dre_my_standing() to authenticated;
```

**Grant note.** Supabase grants EXECUTE to `anon`/`authenticated` via
`ALTER DEFAULT PRIVILEGES`, so `revoke … from public` alone does **not** lock a
`SECURITY DEFINER` function down — `anon` must be revoked explicitly (the gotcha already
recorded on the DRE concept page). Run `get_advisors` (security) after applying.

The function takes no arguments and derives identity from `auth.uid()`, so there is no
parameter a caller could point at someone else.

### 4.2 The label map, and why it exists twice

`event_type` values are machine keys (`business.first_campaign_created`). Both the bell
(edge, Deno) and the history page (frontend, Vite) must render them as English, and the
frontend cannot import from `supabase/functions/`. Rather than let the two surfaces drift
into calling the same event different things, the map is defined twice **deliberately**:
`src/lib/dragonEvents.ts` and `supabase/functions/_shared/dre-events.ts`. The two files
differ only in module boilerplate; the map literal itself is identical, and a test reads
both files and asserts identical key sets and identical labels.

This mirrors the existing `_shared/dre-rules.ts` precedent (pure logic duplicated edge-side).

Each entry carries `{ label, repeatable }`. `repeatable: false` drives the "already earned"
check in the catalog. An `event_type` present in `dre_config.point_values` but absent from
the map — possible, since config is editable without a deploy — degrades to a label derived
from the key (`business.first_boost_bonus` → "First boost bonus"), never a crash and never
a raw key on screen.

## 5. The page — `/rewards`

Authenticated route (`ProtectedRoute`), registered in `App.tsx` beside `/help`. Uses the
shared light-app kit (`PageBody`, `AppCard`, `AppStatusBadge`) per DESIGN_SYSTEM. Gated by
`DRAGON_REWARDS_ENABLED` — flag off renders a "not available" state, not a blank page.

**Block 1 — Where you stand.** Balance, tier badge, and the gap to the next tier stated in
full: *"Established needs 500 points and 3 completed campaigns. You have 350 points and 1
campaign."* Both conditions are shown because tiers require **both** a point threshold and
an activity milestone — points alone never unlock a tier, and a page that showed only
points would teach the wrong model. At `legend` (DP-only cap) the block says so instead.

The gap must mirror `_shared/dre-rules.ts` `resolveTier` exactly, including its rating rule:
a `min_avg_rating` threshold is **unmet when `avg_rating` is null**, so a creator with no
reviews yet is short of `knight` on rating even at 10 campaigns — the gap line has to say
"an average rating of 4.5 (no reviews yet)" rather than treating null as passing.

**Block 2 — Your history.** `dragon_point_events` for the caller, newest first, each row
`{label} · +{points} · {date}`. Own-row RLS already permits this; no new grant. Empty state:
"You haven't earned any DC Points yet — here's how to start," linking to block 3.

**Block 3 — How to earn.** Rendered from `dre_config.point_values`, filtered by the `role`
returned from `dre_my_standing()` to that role's key prefix (`content_creator` → `creator.`,
`business_client` → `business.`), each entry showing its real point value.
One-time entries the user has already claimed are marked earned (joined against block 2's
ledger). Rendering from config rather than hardcoding preserves the engine's config-first
property: retuning the economy updates this page with no deploy.

**Block 4 — What standing does.** Honest and short: the tier badge is public on your
profile, the balance is private to you, and points do not convert to money or discounts
today. No roadmap.

**Failure behavior.** React Query loading skeletons per block. If `dre_my_standing()` fails,
block 1 degrades to balance + tier read directly from `dragon_point_balances` (already
own-row readable) and hides the gap line, rather than blanking the page. A failed
`dre_config` read hides block 3 only.

## 6. The chip — `DcPointsChip`

One component, two mount points: the `DashboardLayout` top bar and `MobileTopNav`, both
immediately left of `NotificationDropdown`. Reuses `useDragonPoints()`, whose React Query
cache is already populated by the dashboard card, so it adds no per-page request.

- Renders `null` when `DRAGON_REWARDS_ENABLED` is off (mirrors `DragonPointsCard`).
- Renders `null` for the brand role — DRE has no brand triggers, so a brand user would see
  a permanent 0, which is worse than nothing.
- Renders `null` while loading, so there is no layout jitter as the balance resolves.
- Value-only on mobile (no label), `flex-shrink-0`; the existing middle block
  (welcome text / location switcher) already carries `min-w-0 truncate` and yields.
- Brand-adjacent styling, never gray (DESIGN_SYSTEM).

## 7. The notification

Two changes in `supabase/functions/dre-award-engine/index.ts` (step 6):

1. **Deep link.** Add `actionUrl: '/rewards'`.
2. **Name the reason.** The run already holds `newRows` (`user_id`, `points_awarded`,
   `occurred_at`); it currently sums them and drops `event_type`. Carry `event_type`
   through the `.select()` and build the body from `_shared/dre-events.ts`:
   - one event → *"Completing your business profile earned you +200 DC Points"*
   - several → *"+350 DC Points for 2 actions"*, body naming both labels
   - `data` additionally carries `events: [{ type, points }]` for future consumers.
   Tier-up keeps its existing "new tier unlocked" treatment.

Separately, `src/lib/getNotificationRoute.ts` gains a `dragon_points_award` case returning
`/rewards`. `getNotificationRoute` prefers `action_url` when present, so the new case is a
fallback — and it **retro-fixes every notification already sitting in a user's bell without
an `action_url`**, including the one in the screenshot.

## 8. Donny

**New sub-agent** `supabase/functions/donny-orchestrator/agents/rewards.ts` plus its tool
definition in `tools.ts`, shaped like the existing `find_creators`. It reads:

- `dre_my_standing()` — balance, tier, campaigns completed, avg rating
- the caller's recent `dragon_point_events` rows, labeled via `_shared/dre-events.ts`
- `dre_config.point_values` for the earn catalog

**All reads are scoped to `ctx.userId`** (derived from `auth.getUser()`), never a
client-supplied id — the discipline already annotated in `donny-orchestrator/index.ts`
(a client-supplied org id must never scope a service-role read). Suggested action:
`/rewards`.

**Help article rewrite** (migration): `help_articles.dragon-rewards` gets the real earn
catalog with values, the real five tier thresholds with both conditions, and the honest
"what standing does" statement. This also improves the existing `guidance_agent` path,
which already full-text searches `help_articles`.

**RAG honesty fix** (migration): set `scope = 'internal'` on the two `donny_knowledge` rows
whose `metadata->>'path'` is `docs/wiki/concepts/dragon-rewards-engine.md` or
`docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md`, so consumer
retrieval stops returning unbuilt-phase content. The sync (`donny-knowledge-sync`) must be
checked so a later run does not re-insert them at `scope IS NULL`; if it would, the fix
belongs in the sync's scope assignment rather than in a one-off UPDATE.

> **Filed, not fixed here:** the general question of why engineering wiki concepts are in
> the consumer RAG at all. Two rows are corrected because they actively contradict this
> feature's honesty decision; the policy review is a separate piece of work.

## 9. Known issue surfaced by this work

`business.campaign_launched` pays **150 points on every campaign**, not just the first (the
first is separately worth `business.first_campaign_created` = 500). One prod business has
already collected it seven times. Once block 3 makes the catalog public, this is the entry
users will optimize.

Not changed here — retuning is a `dre_config` JSONB edit requiring no deploy, and the
founder has seen it. Flagged so the decision is deliberate rather than discovered.

## 10. Testing

- **Label coverage** — every key in the seeded `point_values` (all 25) resolves to a label;
  an unknown key degrades to a derived label rather than a raw key or a throw.
- **Cross-side parity** — `src/lib/dragonEvents.ts` and `_shared/dre-events.ts` have
  identical key sets and identical labels.
- **`dre_my_standing()` red→green on prod**, rollback-wrapped, using
  `set_config('request.jwt.claim.sub', '<uuid>', true)` to fake `auth.uid()`: returns the
  caller's row only; `anon` EXECUTE is revoked; a null `auth.uid()` raises.
- **Gate tests** — chip and page render nothing / "not available" when
  `DRAGON_REWARDS_ENABLED` is false, extending `dragon-rewards-gate.test.tsx`.
- **Brand hiding** — chip renders nothing for a brand-role user.
- **`getNotificationRoute`** returns `/rewards` for `dragon_points_award`, both with and
  without an `action_url` present.
- **Notification body** — pure builder tested for the one-event, multi-event, and
  unknown-`event_type` cases.
- RTL tests need `// @vitest-environment jsdom` + the jest-dom import as the first two
  lines (jsdom is per-file in this repo, not global).

## 11. Deploy order

The RPC is a new object that both the frontend and an edge function depend on, so:

1. Apply the migrations (`dre_my_standing()`, help-article rewrite, RAG re-scope) to prod.
2. Verify: `get_advisors` (security) clean; `dre_my_standing()` red→green passes.
3. Deploy `dre-award-engine` and `donny-orchestrator` (both now reference
   `_shared/dre-events.ts` — bundle **all** transitive `_shared` deps, and boot-check after,
   since a failed bundle silently keeps the old version).
4. Merge the frontend.
5. Verify on prod at both viewports with console open.

Reversed, the page and Donny call a function that does not exist.

## 12. Open follow-ups (filed, not in scope)

- Design the perk/redemption economy (parent spec Phase 5) — the business decision that
  gives block 4 a different answer.
- Review engineering-wiki presence in the consumer RAG generally (§8).
- Decide whether `business.campaign_launched` should stay uncapped (§9).
- **Stale cached tiers.** `dragon_point_balances.tier` is recomputed only for users who
  earn new points in a run (`dre-award-engine` step 5). A creator's average rating can
  fall below the threshold that earned their tier without generating any ledger event —
  `dre_pending_events` gates `creator.five_star` on `rv.rating = 5`, so a 2-star review
  fires nothing — leaving a tier that the engine would no longer grant. This is
  **pre-existing and system-wide**: `DragonTierBadge` has rendered the same cached value
  on public profiles since June. The `/rewards` page deliberately trusts it too, so the
  gap line and the badge never contradict each other (ruled 2026-08-07; pinned by a test
  in `src/lib/dragonTierGap.test.ts`). Fixing it properly means recomputing tiers on
  rating change, which would demote real users the first time it runs — a product
  decision, not a display one.
