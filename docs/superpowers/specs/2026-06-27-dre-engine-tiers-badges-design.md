# Dragon Rewards Engine — Engine + Tiers + Badges (v1) — Design

**Date:** 2026-06-27
**Status:** Spec (not built). Execution gated on Dezzy AI deploy + worktree refresh.
**Spec author:** Claude (Opus 4.8)
**Parent spec:** `docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md` (PR #191)

## Problem / Context

The Dragon Rewards Engine (DRE) full spec is a **16-week, 6-phase growth program** —
a configurable Dragon Points economy, tiers/badges, daily-boost multipliers,
auto-generated social share cards with referral attribution, redemption, and a no-code
admin config panel. That is six independent subsystems and cannot be one spec. Per the
brainstorming process we **decomposed it** and this document specs the **first
sub-project**: a configurable points ledger + an idempotent award engine + the full
5-tier system + tier-badge display (≈ parent-spec Phases 1–2).

**Why this slice first.** DragonCandy is pre-revenue (~30 organic users, $0 paying). The
parent spec is calibrated against *projected* targets that do not exist yet, and its
later phases carry real cash (referral bonuses, $500 equipment grants, subscription
credits) against a ~$390/mo operating budget. This slice is **backend-heavy, has zero
cash exposure, and is fully reversible** — it stands up the ledger-first foundation every
later phase depends on, and lets *real* activity calibrate point values before a dollar
is spent. The award engine is, by design, only a **consumer of events the platform
already emits**, so it wires into existing ledgers rather than adding new event
infrastructure.

## Decisions (locked during brainstorming)

- **Scope** = Engine + tiers + badges. Not the viral/referral loop, not redemption, not
  the admin config UI.
- **Award mechanism** = a **cron-invoked edge function** with a pure, vitest-tested rules
  module. *Not* DB triggers — the trigger→`pg_net`→edge-fn path is known-dead in prod
  (the app.settings GUCs are unset; see the campaign Donny-nudge bug). *Not* pure-SQL —
  the project favors testable TS helpers. *Not* inline app-layer awarding — too many
  fragile touch-points, risks missed awards.
- **Notifications** = **minimal in-app bell only**, on forward awards, coalesced to one
  bell per user per run. No email, no Donny nudge, no new notification category in v1.
  Backfill is always silent.
- **Config-driven from day one.** No hardcoded point values or thresholds — all read from
  `dre_config`. Avoids rework when Phase 3+ retunes the economy.
- **FK target = `profiles.id`.** DRE is a *consumer* feature; every actor
  (creator/business) has a `profiles` row. (The `auth.users` FK rule applies only to
  AIOS/internal-only tables — the PR #180 lesson — and does not apply here.)

## Scope

**In:** `dre_config`, `dragon_point_events`, `dragon_point_balances` tables (+ RLS +
indexes + 2 service-role RPCs); the `dre-award-engine` edge function on `pg_cron`; pure
`dre-rules.ts`; per-role tier resolution; a DP-balance card on the creator + business
dashboards; a `DragonTierBadge` on dashboards and public profiles; a coalesced in-app
reward notification.

**Out (deferred, with reason):**
- **Referrals & share-card / UTM viral loop** — no referral/UTM infrastructure exists
  today; this is the separate Phase-4 sub-project.
- **Daily Boosts / Hype Weeks / Surprise Drops** — Phase-3 multiplier engine. The
  `multiplier_applied` column is reserved (always `1.0` in v1) so Phase 3 needs no
  migration.
- **Streak awards** — require daily streak computation; Phase 3. The `streak_days` /
  `streak_last_updated` columns are reserved but unused in v1.
- **Redemption + leaderboards** — Phase 5. `dragon_point_redemptions` is **not** created
  in v1 (`total_redeemed` is reserved on the balances table, always `0`).
- **Brand-role triggers** — the brand role is feature-flag-hidden (`BRAND_ROLE_ENABLED`).
  The engine processes only `content_creator` and `business_client` users.
- **Nuanced signals** ("delivered on time", "approved first submission") — no clean
  signal exists today.
- **Admin config UI** — v1 edits `dre_config` rows directly (SQL/MCP); the no-code panel
  is Phase 6.

## Architecture

### 1. Schema — `supabase/migrations/<ts>_dre_engine_schema.sql`

**`dragon_point_events`** (append-only ledger)
| column | type | notes |
|-|-|-|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | `REFERENCES profiles(id) ON DELETE CASCADE` |
| `event_type` | text | e.g. `creator.first_campaign`, `business.campaign_launched` |
| `points_awarded` | int | from config |
| `multiplier_applied` | numeric | default `1.0` (reserved for Phase 3) |
| `source_id` | uuid | the campaign / post / review / boost id, or `user_id` for one-time events |
| `occurred_at` | timestamptz | the source event's natural timestamp (drives backfill/notify split) |
| `created_at` | timestamptz | default `now()` |

- **`UNIQUE (user_id, event_type, source_id)`** — the idempotency key.
- Index on `user_id`.

**`dragon_point_balances`** (materialized cache, recomputed from the ledger)
| column | type | notes |
|-|-|-|
| `user_id` | uuid PK | `REFERENCES profiles(id) ON DELETE CASCADE` |
| `total_earned` | int | `sum(points_awarded)` |
| `total_redeemed` | int | default `0` (reserved) |
| `balance` | int | `total_earned − total_redeemed` |
| `tier` | text | `egg`/`scout`/`knight`/`master`/`legend` |
| `last_activity_at` | timestamptz | max `occurred_at` |
| `streak_days` | int | default `0` (reserved) |
| `streak_last_updated` | date | nullable (reserved) |

**`dre_config`**: `id uuid PK`, `config_key text UNIQUE`, `config_value jsonb`,
`updated_by uuid`, `updated_at timestamptz`. Seeded with `point_values`,
`tier_thresholds`, `go_live_at` (see §3).

**RLS** (mirror existing policies):
- `dragon_point_events`, `dragon_point_balances`: `FOR SELECT TO authenticated USING
  (auth.uid() = user_id)`. **No** client INSERT/UPDATE/DELETE policy — writes happen
  only via the service-role engine (which bypasses RLS).
- `dre_config`: `FOR SELECT TO authenticated USING (true)`; write policies gated by
  `public.has_role(auth.uid(), 'admin')`.

**RPCs** (both `SECURITY DEFINER`, `SET search_path = public`, `REVOKE EXECUTE FROM anon,
authenticated` — invoked only by the service-role engine):
- `dre_pending_events()` → `setof (user_id uuid, role text, event_type text, source_id
  uuid, occurred_at timestamptz)`. A UNION over each event category (§4), each subquery
  LEFT-JOINed against `dragon_point_events` on `(user_id, event_type, source_id)` with the
  ledger row `IS NULL`. "First-X" events use `NOT EXISTS`/earliest-row logic; milestone
  events fire when a `count(...) >= N` crosses and no ledger row exists yet. Only
  `content_creator` / `business_client` users.
- `dre_user_aggregates(p_user_ids uuid[])` → `setof (user_id uuid, role text, balance
  int, last_activity_at timestamptz, campaigns_completed int, avg_rating numeric)`.
  Post-insert aggregates for tier resolution + balance upsert (balance = sum of the
  user's ledger rows; `campaigns_completed` = completed collaborations for creators /
  completed campaigns for businesses; `avg_rating` = avg of `project_reviews.rating`
  where `reviewee_id = user`).

### 2. Award engine — `supabase/functions/dre-award-engine/index.ts`

Cron-invoked (default `*/5 * * * *`), `verify_jwt=false`, self-gated. Per run:
1. **Authorize** the incoming request via `isAuthorizedIngest(req)`
   (`_shared/ingest-auth.ts`) — the cron caller passes the Vault bearer. Build the admin
   client from the injected `SUPABASE_SERVICE_ROLE_KEY`.
2. **Load config** — `point_values`, `tier_thresholds`, `go_live_at` from `dre_config`.
3. **Collect** pending awards via `dre_pending_events()`.
4. **Compute** `points_awarded` per row with pure `dre-rules.ts`
   (`computeAward(event_type, config) × 1.0`).
5. **Insert** into `dragon_point_events` in bulk with `onConflict:
   'user_id,event_type,source_id', ignoreDuplicates: true` (mirrors the 23505 pattern in
   `_shared/fulfill-boost.ts`). Track which rows were *newly* inserted.
6. **Recompute** affected users: `dre_user_aggregates(affectedIds)` →
   `resolveTier(role, {balance, campaignsCompleted, avgRating}, thresholds)` in TS →
   upsert `dragon_point_balances`.
7. **Notify (forward-only, coalesced):** for newly-inserted events with `occurred_at >=
   go_live_at`, group by `user_id` and POST **one** `create-notification`
   (`type: 'dragon_points_award'`, `category: 'account'`, in-app only — no type→email
   mapping is added, so no email is ever sent) summarizing total DP earned this run and
   the new tier if it changed.

### 3. Config seed (concrete shapes)

`dre_config.point_values` (jsonb, keyed `<role>.<event>`), values from parent-spec §4:
```json
{
  "creator.profile_completed": 250, "creator.first_social": 150,
  "creator.post_submitted": 75, "creator.first_post_bonus": 225,
  "creator.first_application": 200, "creator.first_campaign": 1000,
  "creator.first_boost": 400, "creator.five_star": 250,
  "creator.milestone_campaigns_3": 1000, "creator.milestone_campaigns_10": 3000,
  "creator.milestone_campaigns_25": 5000, "creator.milestone_campaigns_50": 10000,
  "business.profile_completed": 200, "business.first_social": 200,
  "business.first_campaign_created": 500, "business.first_campaign": 1000,
  "business.campaign_launched": 150, "business.boost_given": 300,
  "business.first_boost_bonus": 50, "business.rate_creator": 100,
  "business.five_star_bonus": 100,
  "business.milestone_campaigns_5": 1500, "business.milestone_campaigns_10": 3000,
  "business.milestone_campaigns_25": 5000, "business.milestone_campaigns_50": 10000
}
```
`dre_config.tier_thresholds` (jsonb, per role; `resolveTier` picks the **highest tier
whose every condition is met** — DP *and* milestone, so points alone never unlock a
tier):
```json
{
  "creator": [
    {"key":"egg","min_dp":0},
    {"key":"scout","min_dp":500,"min_campaigns":3},
    {"key":"knight","min_dp":2500,"min_campaigns":10,"min_avg_rating":4.5},
    {"key":"master","min_dp":10000,"min_campaigns":50,"min_avg_rating":4.8},
    {"key":"legend","min_dp":50000}
  ],
  "business": [
    {"key":"egg","min_dp":0},
    {"key":"scout","min_dp":500,"min_campaigns":3},
    {"key":"knight","min_dp":2500,"min_campaigns":10},
    {"key":"master","min_dp":10000,"min_campaigns":50},
    {"key":"legend","min_dp":50000}
  ]
}
```
`dre_config.go_live_at` (jsonb string): the prod cutover timestamp. Events with
`occurred_at <` this are backfilled silently; `>=` notify. Set by the founder at go-live.

> **Legend note:** the parent spec's higher-tier "ambassador / City Captain" conditions
> are not quantifiable from current data, so `legend` is **DP-only** in v1 and
> `master`/`knight` use the quantifiable campaign-count (+ creator rating) conditions.
> These tighten later by editing `tier_thresholds` — no code change. Because `legend` has
> no `min_campaigns`, a (hypothetically) high-DP/low-campaign user would resolve straight to
> `legend` without ever satisfying `master` — **intended**, since `legend` is the cap and
> 50,000 DP is unreachable without heavy activity anyway.

### 4. Event-source map (verified against the schema)

| event_type | source (truth) | user (→ normalize to profiles.id) | source_id | cardinality | occurred_at |
|-|-|-|-|-|-|
| `creator.profile_completed` | `creator_profiles.is_completed=true` | `user_id` | `user_id` | once | `updated_at` |
| `creator.first_social` | first non-null `creator_profiles.*_url` | `user_id` | `user_id` | once | `updated_at` |
| `creator.post_submitted` | `dragonshare_posts` | `creator_id` | post id | each | `submitted_at` |
| `creator.first_post_bonus` | earliest `dragonshare_posts` | `creator_id` | `user_id` | once | earliest `submitted_at` |
| `creator.first_application` | earliest `campaign_applications` | creator | `user_id` | once | `created_at` |
| `creator.first_campaign` | first `campaign_collaborations.status='completed'` | `creator_id` | `user_id` | once | `COALESCE(completed_at, updated_at)` |
| `creator.first_boost` | first `dragonshare_payouts.status='succeeded'` | `creator_id` | `user_id` | once | `processed_at` |
| `creator.five_star` | `project_reviews` `rating=5, review_type='business_to_creator'` | `reviewee_id` | review id | each | `created_at` |
| `creator.milestone_campaigns_{3,10,25,50}` | `count(completed collaborations) >= N` | `creator_id` | `user_id` | once each | Nth completion `COALESCE(completed_at, updated_at)` |
| `business.profile_completed` | `business_profiles.is_completed=true` | `user_id` | `user_id` | once | `updated_at` |
| `business.first_social` | first `business_outstand_accounts` (active) | `user_id` | `user_id` | once | `connected_at` |
| `business.first_campaign_created` | earliest `campaigns` | `user_id` | `user_id` | once | `created_at` |
| `business.campaign_launched` | `campaigns.status <> 'draft'` (ever left draft) | `user_id` | campaign id | each | `created_at` |
| `business.first_campaign` | first `campaigns.status='completed'` | `user_id` | `user_id` | once | `updated_at` |
| `business.boost_given` | `dragonshare_boosts` `status in (captured,transferred)` | `boosting_user_id` | boost id | each | `boosted_at` |
| `business.first_boost_bonus` | earliest boost given | `boosting_user_id` | `user_id` | once | earliest `boosted_at` |
| `business.rate_creator` | `project_reviews` `review_type='business_to_creator'` | `reviewer_id` | review id | each | `created_at` |
| `business.five_star_bonus` | `project_reviews` `reviewer=business, rating=5` | `reviewer_id` | review id | each | `created_at` |
| `business.milestone_campaigns_{5,10,25,50}` | `count(campaigns completed by business) >= N` | `user_id` | `user_id` | once each | Nth completion `updated_at` |

> First-post nets **300** (75 `post_submitted` + 225 `first_post_bonus`, different
> `source_id`s — post id vs `user_id`); a business 5-star nets **200** (100
> `rate_creator` + 100 `five_star_bonus`, **both keyed to the same review id** — distinct
> `event_type`s sharing one `source_id`, which the unique key permits).
>
> **`campaign_launched` predicate = `status <> 'draft'`, not `= 'published'`.**
> `campaign_status` is a forward-progressing lifecycle (`draft → published → active →
> completed → cancelled`; `verify-campaign-escrow` flips launched campaigns to `active`),
> so `status` holds only the *current* state. Matching `= 'published'` would miss every
> campaign that already advanced (≈0 on backfill, and the 5-min cron could miss a campaign
> that transitions inside its window). "Ever left draft" + `source_id = campaign id` awards
> launch exactly once per campaign regardless of later state.

### 5. Pure rules module — `supabase/functions/_shared/dre-rules.ts` (+ test)

No `https://` imports (so Vitest loads it). Exports:
- `computeAward(eventType: string, pointValues: Record<string,number>): number` —
  config lookup; unknown key → `0` (and the engine skips a 0-point insert).
- `resolveTier(role, { balance, campaignsCompleted, avgRating }, thresholds): string` —
  returns the highest tier key whose `min_dp` **and** `min_campaigns` (when present)
  **and** `min_avg_rating` (when present) are all satisfied; defaults to `egg`.

### 6. Frontend

- `src/lib/dragonTiers.ts` (+ `dragonTiers.test.ts`) — pure presentation map: tier key →
  `{ label, emoji, colorClasses }`. Honors **"no gray badges"**: `egg` uses a warm
  neutral (not `dc-gray`); `scout`/`knight` extend Tailwind greens/blues; `master` uses
  `dc-yellow`; `legend` uses `dc-pink-accent`/platinum.
- `src/components/badges/DragonTierBadge.tsx` — modeled on
  `src/components/outstand/VerifiedBadge.tsx` (`size?: 'sm'|'md'`, `className?`).
- `src/hooks/useDragonPoints.ts` — `useQuery`, key `['dragon-points', user?.id]`,
  `enabled: !!user?.id`, reads `dragon_point_balances`, returns `{ balance, tier }`.
  Mirrors `useDragonShare.ts` / `useCreatorDashboardStats.ts`.
- **DP-balance card** (reuse the `DragonShareStatTile.tsx` look; optional
  `DragonPointsCard.tsx`) + tier badge:
  - `src/pages/CreatorDashboard.tsx` — stat grid (~L206–217, beside `DragonShareStatTile`).
  - `src/pages/BusinessDashboard.tsx` — stat area (~L172–182).
- **Tier badge inline by the name:**
  - `src/pages/PublicCreatorProfile.tsx` (~L328–330, after `VerifiedBadge`).
  - `src/pages/PublicBusinessProfile.tsx` (~L194–195, after `business_name`).
- `src/integrations/supabase/types.ts` — **surgical** add of the 3 tables + 2 RPC
  signatures (do not regenerate wholesale; Lovable-autogenerated file).

### 7. Cron + Vault + deploy — `supabase/migrations/<ts>_dre_award_cron.sql`

Mirror `20260619170000_expire_social_hooks_cron.sql`: `cron.schedule('dre-award-engine',
'*/5 * * * *', …)` posting to a Vault-sourced URL with a Vault-sourced bearer. Reuse the
existing `aios_ingest_key` Vault secret; add `dre_award_engine_url`. `cron.schedule`
upserts by name (idempotent re-apply). Add `[functions.dre-award-engine] verify_jwt =
false` to `supabase/config.toml`.

## Idempotency & backfill model

- **Idempotent:** the `(user_id, event_type, source_id)` unique key + `ON CONFLICT DO
  NOTHING` means re-running awards nothing twice. Balances are **recomputed from the
  ledger** (never blindly incremented), so the engine is self-healing.
- **Backfill:** on first prod run the anti-join awards DP for *all* historical qualifying
  activity (a fair starting balance for existing users). Because notifications fire only
  for `occurred_at >= go_live_at`, the backfill is **silent** — no notification storm.

## Invariants held

- **Donny/users never write the ledger directly** — only the service-role engine writes;
  no client INSERT/UPDATE RLS policy exists.
- **Points alone never unlock a tier** — `resolveTier` requires the activity milestone too.
- **No new event infrastructure** — the engine only consumes existing tables.
- **No DB-trigger fan-out** — avoids the known-dead `pg_net`-from-trigger path.
- **Live-mode/consumer behavior unchanged elsewhere** — additive tables, additive UI; no
  existing query, RLS policy, or edge function is modified.
- **No new secret, no new OAuth scope, no new notification category** (reuses
  `aios_ingest_key` + `account` category).

## Sequencing / prerequisites

1. **Timing gate (founder's condition):** start only after the Dezzy AI branch merges +
   deploys. No code dependency on Dezzy — purely scheduling.
2. **Refresh the worktree first:** `DC-DRE-AI` is behind `origin/main` (the DRE parent
   spec landed in #191); rebase/refresh onto `origin/main` before building.
3. **Founder go-live (after Claude + Codex reviews pass):** apply both migrations to prod;
   set Vault `dre_award_engine_url` (+ reuse `aios_ingest_key`); deploy via `npx supabase
   functions deploy dre-award-engine --no-verify-jwt`; create the cron job; set
   `go_live_at`; then merge → Lovable deploys the frontend.

## Testing

- **Unit:** `dre-rules.test.ts` — point-value lookup; unknown key → 0; tier "both
  conditions" including **DP-met-but-milestone-unmet stays at the lower tier**; per-role
  threshold differences. `dragonTiers.test.ts` — every tier maps to a non-gray class set.
- **Idempotency (staging `mhffqrawgizhprbobcta` or prod):** invoke `dre-award-engine`
  twice with the service bearer → `dragon_point_events` gains rows on run 1, **zero** new
  rows on run 2; balances/tier correct. Use the `verify-db-schema` skill (columns exist in
  prod, RLS actor is the consumer `auth.uid()`, FE field names match schema, migration
  applied before dependent code).
- **Backfill/notify split:** a historical event awards DP but produces no bell; an event
  after `go_live_at` produces exactly one coalesced bell via `create-notification`.
- **Prod (`verify-prod` skill):** DP card + tier badge render on creator + business
  dashboards and both public profiles, desktop + mobile viewports, no console errors.

## Process

After this spec passes the `spec-document-reviewer` loop and founder review:
`writing-plans` → **subagent-driven execution** in units (build + typecheck + test per
unit) → Claude reviews (`/simplify`, `/code-review`) → **Codex second review** until clean
→ founder go-live (above) → **`knowledge-sync`** (wiki page, ingest, refresh
PROJECT_CONTEXT + DATABASE_SCHEMA, sync Donny RAG).

## Open risks

- **Milestone "occurred_at" precision** — deriving the Nth-completion timestamp in
  `dre_pending_events()` must be deterministic so the backfill/notify split is stable.
- **Coalesced-notification copy** — keep it generic ("You earned N Dragon Points") to
  avoid per-event tuning in v1.
- **`updated_at`-sourced one-time/milestone events** — several one-time / milestone events
  read `occurred_at` from the source row's `updated_at` (`profile_completed`,
  `business.first_campaign`, the **business** campaign milestones, `first_social`), which
  reflects the *latest* edit, not when the condition was first met. The **creator**
  completion events instead use `campaign_collaborations.completed_at` (set on the
  payout/dispute completion paths; nullable, hence `COALESCE(completed_at, updated_at)`).
  The `campaigns` table has **no `completed_at`** column, so the **business** completion
  events must fall back to `updated_at`. Risk: a pre-go-live qualifier edited after
  `go_live_at` would cross the notify boundary and emit a single (generic, coalesced) bell.
  Acceptable — mitigated by the generic copy; prefer the stable
  `created_at`/`completed_at` wherever it equally identifies the event.
