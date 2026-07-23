# Synthetic Weight Engine — Design Spec

- **Date:** 2026-07-23
- **Status:** Draft (rev 3 — actor-OR-parent exclusion + review recs)
- **Branch:** `feat/synthetic-weight-engine`
- **Owner:** Dame (CPO)
- **Related:** `docs/PROJECT_CONTEXT.md` §4 (Current State), §7 (data-flywheel moat),
  `docs/DragonCandy_Infrastructure_Capacity_Report.md`, `docs/runbooks/qa-staging-gate.md`

---

## 1. Problem & Context

DragonCandy is pre-revenue (~30 organic users, $0 paying). Three needs converge:

1. **Liveness / optics** — the marketplace should *look* alive for demos, investor
   conversations, and screenshots: active users on both sides, fresh campaigns, daily
   transactions, DragonShare posts, Donny usage — **visible to a real visitor**, not just on an
   internal dashboard.
2. **Load & performance proof** — evidence about how the app behaves as usage grows, and a
   measurement-driven answer to "when do we need to scale compute?"
3. **QA / bug surfacing** — exercise the full cross-role feature set end-to-end, repeatedly, to
   shake out breakages before launch.

The proposal: a **Synthetic Weight Engine** that mints and drives a configurable cohort of
synthetic ("bot") users — default **N = 500**, split across creator and business personas —
performing realistic daily marketplace activity **on production**, as **full, visible,
interactive marketplace citizens**.

### 1.1 The load reframe

500 users × tens of transactions/day is a *small* data volume; Postgres will not notice the row
count. Per `DragonCandy_Infrastructure_Capacity_Report.md`, the real ceiling is **concurrent
database connections** — MICRO compute = **60** Supavisor connections, MICRO→SMALL recommended
before ~75 users. So the meaningful load variable is **concurrency**, not headcount, and "scale
storage/RAM/memory" is done **in response to measured saturation** (Phase 4), not up front.

### 1.2 The load-bearing constraint: segregation of *metrics/moat*, not *visibility*

The founder decision is **fully visible + interactive**: synthetic users appear everywhere real
users browse (Find Creators, campaign browse, DragonFeed, Donny matching, invitations,
messaging) and real users may interact with them. Therefore segregation is **not** about hiding
bots from the product — it is exclusively about keeping synthetic activity out of:

- The **data-flywheel moat** (`PROJECT_CONTEXT.md` §7) — the future Donny fine-tuning corpus.
- The **founder-facing `/internal` metrics** — platform/revenue/cost stats, `platform_weight`
  growth counts, the weekly operating brief, and the daily cloud routines that read prod.

**Rule of thumb:** a row is *shown in the product* regardless of synthetic status, but is
*excluded from founder metrics + the moat corpus* iff it involves a **synthetic actor OR a
synthetic parent entity** (e.g. a bot-owned campaign, a bot's DragonShare post). Because real
users now interact with bots (fully interactive), rows can be **mixed** (real actor, synthetic
parent, or vice-versa) — so the exclusion mechanism must be a two-sided **actor-or-parent**
predicate, never a single-FK check (see §4.3). One missed metric/moat surface = corrupted
training data or skewed founder numbers. The safety spine (§4) is Phase 0 and gates all activity.

---

## 2. Goals & Non-Goals

### Goals
- Mint a tunable cohort (default 500) of persona-driven synthetic users on prod, cleanly tagged,
  fully visible and interactive.
- Drive realistic daily marketplace activity across the full content-delivery lifecycle.
- Full realism: real Stripe **test-mode** checkout and (sampled, capped) Donny AI usage.
- Guarantee zero contamination of the moat corpus and founder metrics, provable by test.
- A hard invariant that **no real money ever settles to or from a synthetic user**.
- A one-flip kill switch and a one-command, residue-free teardown.
- A concurrency/burst knob with **reserved headroom** and load metrics that produce a real
  performance/scaling report without denying service to real users.
- A `/internal/simulation` dashboard that surfaces synthetic activity for the founders.

### Non-Goals
- Not a general-purpose synthetic-load framework for other apps.
- Not a replacement for real user acquisition; removable scaffolding.
- Not live-Stripe / real-money anything — test keys only, enforced at boot; synthetic users are
  purged before any go-live to live Stripe.
- Synthetic counts never feed founder KPIs or the moat corpus (they are shown only in the
  product and on `/internal/simulation`).

---

## 3. Architecture Overview

Two halves:

- **Prod-side safety spine** — migrations (tagging, metric/moat exclusion, kill switch, teardown,
  weight split), edge-function guards, email suppression, and the `/internal/simulation`
  dashboard. Deployed and verified before any bot runs.
- **Sim Harness** — a standalone Node package (`sim/`) run by a scheduled GitHub Actions
  workflow. Persona generator, behavior engine, two drive adapters, scheduler/concurrency control.

Global gate: a single `feature_flags` row **`SYNTHETIC_BOTS_ENABLED`** (default `false`). The
harness reads it before every activity tick, **fail-closed** (refuses to run if it cannot read
the flag); flipping it off halts all bot activity within one tick.

```
GitHub Actions (daily cron, TEST-Stripe-key env)
  └─ Sim Harness (Node)   [fail-closed on SYNTHETIC_BOTS_ENABLED + sk_test_ boot assertion]
       ├─ Persona generator ─► service-role auth.admin.createUser ─► handle_new_user (AFTER INSERT)
       │                                                             └─ auto-registers synthetic_users
       ├─ Behavior engine (per-bot daily graph over the marketplace state machine)
       ├─ Direct-API adapter (bulk)   ─► minted JWT ─► Supabase REST/RPC + edge fns (real RLS path)
       └─ Browser pool adapter (10–25) ─► Playwright ─► real UI + real Stripe TEST checkout
Prod DB
  ├─ synthetic_users registry + is_synthetic() + stamp triggers   (tagging)
  ├─ aios_* stats / donny-cost-rollup / cloud routines  (metric+moat exclusion)
  ├─ email suppression for is_synthetic recipients      (sender-reputation guard)
  ├─ platform_weight *_real count split + sim_load_snapshots  (observability)
  └─ purge_synthetic_data()  (teardown)
Product surfaces (Find Creators, browse, DragonFeed, matching, messaging) ── SHOW synthetic by design
/internal/simulation  ── founder view of the synthetic cohort
```

---

## 4. Component 1 — Safety Spine (Phase 0)

### 4.1 Tagging model

Hybrid: an **email anchor** feeding an **auto-populated registry**, plus a **denormalized flag**
on the tables that can't be traced to a live user FK.

- Every bot is minted with email `bot####@synthetic.dragoncandy.test`.
- New table:
  ```
  public.synthetic_users (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    cohort     text,          -- e.g. 'phase3-2026-07'
    persona    text,          -- e.g. 'luxury_creator'
    created_at timestamptz not null default now()
  )
  ```
- **Auto-population:** extend the existing `handle_new_user()` (SECURITY DEFINER, **AFTER INSERT
  ON auth.users** — verified, so the FK target exists when the registry insert runs;
  `supabase/migrations/20260427220001_handle_new_user_create_role_profile.sql`) so that when
  `NEW.email LIKE '%@synthetic.dragoncandy.test'` it inserts into `synthetic_users`
  `ON CONFLICT DO NOTHING`. The email is the single source of truth; the registry is a derived,
  queryable spine the harness cannot forget to populate.
- **Helpers:** `public.is_synthetic(uuid) returns boolean language sql stable` =
  `select exists(select 1 from synthetic_users s where s.user_id = $1)`, plus a parent-resolver
  `public.is_synthetic_campaign(uuid) returns boolean` = `is_synthetic(campaigns.user_id)` for the
  given campaign. **Exclusion idiom depends on row shape:** single-party rows use
  `AND NOT is_synthetic(<user_fk>)`; **two-party / parent-linked** rows (applications,
  collaborations, matches, boosts, invitations) use the **actor-OR-parent** predicate
  `AND NOT (is_synthetic(<actor_fk>) OR is_synthetic(<parent_owner_fk>))` — this is what makes mixed
  real↔bot rows classify correctly (§1.2).
- **Denormalized flag** — add nullable `is_synthetic boolean` (default `false`) to the **rootless /
  telemetry** tables `payment_events`, `analytics_events`, `dragonshare_events`, and
  `pricing_funnel_events`, stamped by `BEFORE INSERT` triggers. Rationale: Stripe-origin
  `payment_events` have `actor_id = NULL`; `analytics_events.user_id` is `ON DELETE SET NULL`; some
  `dragonshare_events` carry only `actor_org_id` (the table has **both** `actor_user_id` and
  `actor_org_id` — the trigger resolves `actor_user_id` when present, else `actor_org_id`→owner);
  `pricing_funnel_events` is generated by the browser-pool bots and had no tagging path. Each
  trigger resolves the acting user (and, where present, the parent) to set the flag. This column is
  what a future training-data exporter keys on. All additive/nullable per CLAUDE.md.

**Rejected alternatives:** `is_synthetic` on all ~25 written tables (too much surface; a missed
insert defaults `false` = silent leak); pure email/naming convention as the query key
(unrecoverable from the rootless tables above).

### 4.2 Propagation (how the tag reaches each write path)

- **Direct-DB RLS writes** (bot JWT): every row carries a user FK → recoverable via
  `is_synthetic(fk)` with **zero write-path changes**.
- **Edge-function writes**: route ledger inserts through the single choke point
  `supabase/functions/_shared/payment-events.ts` (`writePaymentEvent`, verified single choke
  point), which stamps `is_synthetic` by resolving `campaign_id`→`campaigns.user_id` or `actor_id`.
- **Stripe webhook** (`stripe-webhook/index.ts`): escrow/checkout events carry `campaign_id`
  (recoverable + trigger-stamped); `dragonshare_events` rows get stamped via
  `actor_user_id`/`actor_org_id` resolution + the trigger backstop.
- **Known unrecoverable, handled explicitly:** `stripe_webhook_events` (idempotency plumbing, no
  user linkage — not corpus, not a metric; purged in teardown by the harness-recorded event-id
  list).

### 4.3 Metric/moat exclusion — surfaces that MUST HIDE synthetic

Filters live **inside** each function because the stats RPCs are `SECURITY DEFINER` and bypass
RLS (verified). This is the *only* exclusion needed — consumer product reads deliberately show
synthetic (§4.4). **The exclusion predicate is actor-OR-parent** (§4.1): every two-party /
parent-linked SELECT must exclude a row when *either* the acting user *or* the parent entity's
owner is synthetic — a single-FK filter under-counts mixed real↔bot rows.

| Surface | File | What to filter |
|---|---|---|
| `aios_platform_stats` | `supabase/migrations/20260611150000_aios_stats_rpcs.sql` | single-party counts (profiles, business_profiles, campaigns) by `is_synthetic(owner)`; **two-party counts** (applications, collaborations, matches) by actor-OR-parent, e.g. applications excluded when `is_synthetic(creator_id) OR is_synthetic_campaign(campaign_id)` |
| `aios_revenue_stats` | same | `payment_events` sums (`is_synthetic=false`); `dragonshare_boosts` excluded when **`is_synthetic(boosting_user_id) OR is_synthetic(post_creator)`** (a bot boosting a real post is still synthetic revenue) |
| `aios_cost_stats` | same | `donny_cost_ledger` MTD by `user_id` |
| AI-cost cap rollup | `supabase/functions/donny-cost-rollup/index.ts` | exclude synthetic `user_id` from the MTD spend that flips `donny_usage.current_stage` — bots must never throttle the real platform |
| Pricing funnel | any `/internal` read of `pricing_funnel_events` | exclude `is_synthetic=true` (tagged in §4.1) — browser-pool bots generate funnel hits |
| Weekly operating brief | `.claude/schedules/weekly-brief-agent.md` | **highest optics risk** — reads prod + writes a Google Sheet; every SELECT excludes synthetic **actors and synthetic-parent campaigns** on join rows, not just `synthetic_users` membership |
| Bug sweep / playbook / loop scout | `.claude/schedules/{bug-sweep,playbook-runner,loop-scout}-agent.md` | exclude synthetic (actor-or-parent) so bot failures/matches don't spawn phantom findings or skew audits |
| Future moat/training export | (none exists yet) | tag now via `is_synthetic`; the exporter (when built) filters any record with a synthetic actor **or** synthetic parent entity. See §4.3.1. |

**Matching pools are NOT filtered** (`donny-creator-match`, `donny-dragonshare-score`,
`donny-orchestrator/agents/*`): with "fully visible + interactive," synthetic creators/posts
*should* surface in real users' results (optics). Instead, the **resulting** `campaign_matches`
/ `donny_actions` rows are tagged synthetic (via the involved synthetic creator) so they are
excluded from the moat export, not from the product.

#### 4.3.1 Moat export contract (defers the views)

Per spec review (YAGNI), do **not** pre-build `corpus_export_*` views now — no consumer exists
and the export shape is unknown. The durable guarantee is delivered by (a) the `is_synthetic`
tagging above and (b) a **documented column/registry contract** + a build-checklist item: *any
future training-data exporter MUST filter `is_synthetic` / `synthetic_users` and any record whose
parent campaign is bot-owned.* The exclusion view is authored when the exporter is.

### 4.4 Consumer product reads — deliberately SHOW synthetic

No filtering; synthetic participates fully. These paths are listed so an implementer knows they
are **intentionally unfiltered** (verified surfaces from the reviewer): Find Creators
(`useCreatorBrowse`), creator campaign browse (`usePublicCampaigns`), DragonFeed
(`useBusinessDragonFeed`/`useDragonShare`), business→creator invites (`useCampaignInvitations` /
`InviteToCampaignModal`), Donny matching results, messaging. Plus `/internal/simulation` and the
`platform_weight` **physical** fields (`pg_database_size`, `storage_bytes` — synthetic rows use
real disk, needed for scaling). The `platform_weight` **count** fields are split: add parallel
**`*_real` columns** (chosen representation — not a sub-object) to
`supabase/migrations/20260611170000_platform_weight.sql` so one snapshot serves scaling (totals)
without feeding growth KPIs (reals).

### 4.5 Kill switch, money invariant, and email guardrails

- **Kill switch:** `feature_flags` row `SYNTHETIC_BOTS_ENABLED` (default false; same pattern as
  `DRAGON_REWARDS_ENABLED`). Client reads via `src/hooks/useFeatureFlag.ts` (fails safe-off).
  The **harness reads it fail-CLOSED**: if it cannot read the flag, it refuses to run rather than
  defaulting to activity.
- **Boot-time fail-closed money assertion:** the harness refuses to start unless
  `STRIPE_SECRET_KEY` begins `sk_test_` and the publishable key begins `pk_test_`. Live keys live
  only in Vercel **Production** scope; the harness environment holds test keys only. Any `sk_live_`
  → abort + alert.
- **No-real-money-to/from-synthetic invariant** (protects the interactive real↔bot case):
  - Bots get **test-mode Connect accounts** (reuse `_shared/test-mode-connect.ts`
    `createTestModeEnabledAccount`) so escrow→payout completes end-to-end for bot↔bot **and**
    real→bot flows in test mode.
  - `release-creator-payout` (and any escrow settlement) gains a guard: if `is_synthetic(creator_id)`
    **and the platform is in live mode** (`isTestKey()==false`), refuse/hold — so if a synthetic
    user survives into a post-launch live-Stripe world, no real money moves.
  - Synthetic users are **purged before any switch to live Stripe** (§4.6 + a go-live checklist
    item).
- **Email suppression (sender-reputation guard):** minting ~500 `@synthetic.dragoncandy.test`
  addresses, plus bot↔bot and real↔bot activity firing `create-notification` /
  `send-notification-email` / `send-welcome-email`, would send a stream of Resend mail to a
  hard-bouncing domain and degrade the sender reputation real transactional/lead mail depends on.
  **Guard:** the email-sending edge functions skip delivery when the recipient `is_synthetic`
  (resolved by recipient user id / email domain). Verified entry points to guard:
  `send-notification-email`, `send-welcome-email`, and the `create-notification` fan-out.

### 4.6 Teardown

Service-role `SECURITY DEFINER` `purge_synthetic_data()`, modeled on
`supabase/20260407000000_clean_stale_data.sql` (leaf-first) +
`supabase/migrations/20260517100000_reset_transactional_data.sql` (CASCADE + storage caveat).

1. Resolve the set: `synthetic_users` cross-checked against `auth.users WHERE email LIKE
   '%@synthetic.dragoncandy.test'`; assert the two match before deleting (catches drift).
2. Leaf-first delete down every FK chain (most cascades from `campaigns` and from `auth.users`);
   `donny_messages` via synthetic `donny_conversations`.
3. **Real↔synthetic crossover:** because bots are interactive, real users may have rows attached
   to synthetic entities (a real creator's application to a bot campaign; real messages to bots).
   Cascade delete removes these along with the synthetic parent — **including the real user's
   related notifications/messages** for that interaction (they orphan/remove with the parent).
   This is an **accepted, documented consequence** (removing a real user's interaction *with a
   fake* is correct; acceptable at ~30 real users pre-launch, and worth surfacing in teardown
   testing so it isn't a surprise). If a softer behavior is wanted later, add a soft-disable path
   instead of hard delete — deferred.
4. **Order matters:** delete the rootless ledger rows by `is_synthetic` **before** deleting
   `auth.users` (after user deletion the `analytics_events.user_id` link is nulled and the flag is
   the only handle).
5. Storage: delete via the Storage **API** (direct `storage.objects` deletes are blocked by
   `protect_delete()`), selecting objects whose `foldername[1]` = synthetic user id.
6. Delete `auth.users` (service role) → cascades profiles/creator/business/org/`synthetic_users`.
7. **Verify zero residue:** assert 0 across every corpus table by `is_synthetic`; `synthetic_users`
   empty; no synthetic auth users; **`organizations`/`org_members`/`org_units` created by business
   bots gone** (they fire `trg_auto_create_org`); storage clean; `row_counts_real == row_counts`
   after re-running `capture_platform_weight()`.

---

## 5. Component 2 — Personas / Identity

Config-driven archetypes with curated pools; add `@faker-js/faker` as a **harness-only
devDependency** (no faker in the repo today) for names/bios, backed by curated
location/rate/niche pools. Avatars: upload a small seeded placeholder set to the profiles bucket
(no avatar library exists).

Starting archetypes (extensible via config): **luxury lifestyle creators** (NYC/Miami, high
rates), **NYC Gen-Z creators** (TikTok-native, high volume), **Hoboken restaurants**
(`business_client`, `account_type='restaurant'`). Brand/sponsor archetype stays **off**
(`BRAND_ROLE_ENABLED` disabled).

Minting reuses the service-role pattern from `supabase/functions/manage-internal-users/index.ts`
and `supabase/scripts/staging-login.mjs`: `auth.admin.createUser` with `user_metadata.role` +
`full_name` → `handle_new_user` + `trg_auto_create_org` build profiles/creator/business/org rows.
**Must set `profiles.email_verified=true`** post-create or the bot cannot authenticate (gotcha in
`docs/runbooks/qa-staging-gate.md`).

Cohort defaults: **N = 500**, split **~65% creators / 35% businesses**.

---

## 6. Component 3 — Behavior Engine

A per-bot **daily behavior graph** over the real content-delivery lifecycle: `campaign →
application → collaboration → content submission → payout → review`. A "transaction" = one
meaningful funnel-advancing write.

- **Business bots:** create campaign (mostly free direct `campaigns` insert via `useCreateCampaign`;
  a **sampled fraction** via `donny-campaign-generate` for AI realism), review applications, accept
  a creator, fund escrow (test mode), approve content, leave review.
- **Creator bots:** browse/search campaigns, apply (`apply_to_campaign` RPC), counter-offer, get
  accepted, upload deliverable (`file_uploads` + storage), submit for review, receive payout (test
  Connect), post to DragonShare, message businesses.
- **Cross-cutting:** messaging, profile views, presence, **sampled/capped** Donny chat.

**Interactivity (asymmetric by default):** bots **respond** to real users freely (a bot business
replies to a real applicant; a bot creator responds to a real invite) so real↔bot flows feel
alive, but bots **initiate toward real users sparingly** — a low, configurable
`botInitiateTowardRealRate` (default near-zero). Rationale: aggressive bot→real initiation
pollutes a real business's applicant pool with bots to sift, and a bot accepted onto a real
campaign that later goes live-Stripe would trip the §4.5 payout hold and strand real escrow
(mitigated by purge-before-go-live, but avoidable). Bot↔bot initiation is unrestricted. Realism
controls: realistic funnel ratios (not every applicant accepted; some campaigns expire),
persona-weighted behavior, and a `dailyTransactionFloor` (default scales with N — ~100–150/day at
N=500; min 20). **Cost discipline:** bulk stays on free DB rails; Donny/Opus paths sampled
(default ≤10% of campaign creations) under the daily synthetic-AI ceiling (§8).

---

## 7. Component 4 — Drive Adapters (hybrid)

- **Direct-API adapter (bulk workhorse).** Mint a real per-bot JWT via service-role `generateLink`
  (magiclink) → `/auth/v1/verify` (the `staging-login.mjs` pattern adapted for prod synthetic
  users), then call Supabase REST/RPC + edge functions **as the bot** (real RLS + auth + edge-fn
  path). Carries the bulk of N and the daily volume. Uses the service-role `escrow_status='held'`
  shortcut for its payment leg (can't drive a hosted Checkout).
- **Browser-pool adapter (small, 10–25).** Playwright sessions (reuse `tests/e2e` infra) that log
  in and click the real UI — true DAU sessions exercising frontend/realtime/presence, the source of
  demo screenshots, and the **only** path that completes the real Stripe **test** checkout (hosted
  session + test card), so escrow→payout runs genuinely end-to-end.

---

## 8. Component 5 — Scheduler + Concurrency (reserved headroom)

- A **Node harness run by a scheduled GitHub Actions workflow**
  (`.github/workflows/synthetic-weight.yml`, daily cron + `workflow_dispatch`), using service-role
  + minted JWTs against prod — an external client like real users, so connection pressure is
  realistic. Secrets scoped to **test Stripe key only**.
- **`concurrency` knob** with a **hard reserved-headroom ceiling**: the harness caps its
  simultaneous DB/edge connections to a configured fraction of the tier limit (e.g. ≤ 40 of 60 on
  MICRO, reserving ~20 for real users/`/internal`), and steady-state activity is spread across the
  day. This is the primary mitigation for the prod-DoS risk (§14).
- **Phase 4 burst** raises concurrency toward the reserved ceiling in **low-traffic windows** to
  observe saturation behavior *without* crossing into real-user starvation. (Because headroom is
  reserved, this measures approach-to-ceiling, not a true outage — an accepted trade for running on
  prod; see §14.)
- **Daily synthetic-AI USD ceiling** enforced in the harness; exceeding it stops further Donny
  calls that day.
- *(Optional, Phase 4 only)* a thin k6-style module for a pure throughput/latency probe — included
  only if burst mode is insufficient. Marked optional (YAGNI).

---

## 9. Component 6 — Observability

- **`/internal/simulation`** — new page `src/pages/internal/InternalSimulation.tsx` +
  `useSimulationStats` hook + a `synthetic_users`-joined RPC: cohort size, active bots, synthetic
  campaign/message/boost/transaction volume, daily-AI spend vs ceiling, kill-switch state.
- **Real-vs-synthetic weight split** via `platform_weight.*_real` (§4.4).
- **Load metrics** — new `sim_load_snapshots` table capturing `pg_stat_activity` connection count +
  query/edge-fn latency + error rate during runs, correlated with burst windows.
- **Cost** — a `synthetic`-scoped view over `donny_cost_ledger` + the hard daily ceiling (§8).

---

## 10. Data Model Summary (all additive)

| Object | Type | Purpose |
|---|---|---|
| `synthetic_users` | new table | registry keyed to `auth.users`; auto-filled by `handle_new_user` |
| `is_synthetic(uuid)` + `is_synthetic_campaign(uuid)` | new functions | actor test + parent-owner resolver for the actor-OR-parent predicate |
| `payment_events.is_synthetic` / `analytics_events.is_synthetic` / `dragonshare_events.is_synthetic` / `pricing_funnel_events.is_synthetic` | new nullable columns + BEFORE INSERT triggers | rootless/telemetry tagging |
| `platform_weight.*_real` | new columns | real-vs-synthetic count split |
| `sim_load_snapshots` | new table | Phase-4 load metrics |
| `purge_synthetic_data()` | new function | teardown |
| `SYNTHETIC_BOTS_ENABLED` | `feature_flags` row | kill switch |

Deferred (not built now): `corpus_export_*` views (§4.3.1 contract instead). No drops, no renames,
no existing-type changes.

---

## 11. Cost & Tier Scaling

At N=500 + full realism, AI spend scales ~5× vs 100 → sampling + the daily ceiling (§8) bound it.
Tier scaling is the **load-proof narrative** (Phase 4): run at MICRO with reserved headroom, watch
connections approach the reserved ceiling (`sim_load_snapshots`), upgrade compute
MICRO→SMALL/MEDIUM, re-run, compare latency/error curves — the measurement-driven version of
"scale to accommodate load," kept safe by the reserved headroom.

---

## 12. Phased Roadmap

Each phase gated by the kill switch and verified against a pre-run snapshot of founder metrics.

- **Phase 0 — Safety spine.** The migration (registry, `is_synthetic`, triggers, metric/moat
  exclusion filters, email suppression, `SYNTHETIC_BOTS_ENABLED`, `*_real` split,
  `purge_synthetic_data()`), edge-fn guards, and the `/internal/simulation` skeleton. Prove on
  **5 bots**: activity flows + is visible in-product, founder metrics stay byte-identical, no
  synthetic email is delivered, teardown leaves zero residue. **Nothing scales until this is merged
  + prod-verified.**
- **Phase 1 — Identity + free-rails activity.** Personas, minting, direct-API adapter, behavior
  engine on **free rails** (no Stripe, no Donny), daily scheduler. N=25.
- **Phase 2 — Realism legs.** Browser pool (10–25) + real Stripe **test** checkout + test-mode
  Connect → escrow→payout end-to-end (bot↔bot and real→bot).
- **Phase 3 — Donny AI (capped) + scale to N=500.** Sampled, hard-capped Donny usage; ramp the
  cohort; hit the steady-state daily floor.
- **Phase 4 — Load proof + tier scaling** *(separable; may become its own plan per spec review).*
  Reserved-headroom burst + connection/latency snapshots; run at MICRO, measure approach-to-ceiling,
  upgrade tier, re-run; produce the performance report.

---

## 13. Testing & Verification

- **Segregation proof (critical):** snapshot every `/internal` stat + `aios_*` RPC + weekly-brief
  numbers; run a 5-bot cohort through a full transaction cycle that **exercises both mixed-row
  directions** — a real creator applying to a bot campaign (real actor / synthetic parent) **and**
  a bot boosting a real creator's post (synthetic actor / real parent) — then re-snapshot. Founder
  metrics must be **byte-identical** (this is what proves the actor-OR-parent predicate, not just
  single-FK filtering) while the activity is visible in-product and on `/internal/simulation`.
- **Email-suppression proof:** run the 5-bot cycle; assert Resend received **zero** sends to
  `@synthetic.dragoncandy.test` (mock/inspect the send path).
- **Money-invariant proof:** boot assertion rejects `sk_live_`; the live-mode payout guard holds a
  synthetic settlement; test-mode bot↔bot and real→bot escrow→payout complete.
- **Teardown proof:** `purge_synthetic_data()` → 0 residue across corpus tables, `synthetic_users`
  empty, no synthetic auth users, org rows gone, storage clean, `row_counts_real == row_counts`.
- **AI-cap safety:** synthetic Donny spend never moves `donny_usage.current_stage`, stays under the
  daily ceiling.
- **Load proof (Phase 4):** reserved-headroom burst shows approach-to-ceiling in `sim_load_snapshots`
  with **no real-user connection starvation**; post-upgrade curves improve; captured in a report.
- **Standard gates:** `npm run build`, `npm run typecheck`, unit tests for the harness behavior
  engine + segregation SQL, Codex second review, and **`edge-function-reviewer` +
  `data-exposure-reviewer` before any edge-fn deploy** (the edits to `donny-cost-rollup`,
  `payment-events.ts`, `release-creator-payout`, `stripe-webhook`, and the email fns all qualify).

---

## 14. Risks

1. **A new `SECURITY DEFINER` stats RPC forgets the filter** → silent metric/moat leak (RLS won't
   catch it). *Mitigation:* the actor-OR-parent `is_synthetic()`/`is_synthetic_campaign()` idiom
   (§4.1) + the §4.3.1 export contract + code-review checklist.
2. **A rootless table gets an unstamped insert** → unrecoverable contamination. *Mitigation:*
   `BEFORE INSERT` trigger backstop; verify the `dragonshare_events` `actor_user_id`/`actor_org_id`
   resolution.
3. **Teardown order bug** re-orphans `analytics_events`. *Mitigation:* enforced order + residue
   assertion (incl. org rows).
4. **Cloud routines are English, not SQL** — a future prompt edit adds an unfiltered SELECT →
   synthetic KPIs/revenue leak to stakeholders + the Google Sheet. Highest-probability leak.
   *Mitigation:* explicit exclusion clause + a note in each routine file.
5. **[Prod-DoS] Deliberate load burst starves real users.** Saturating the shared 60-connection
   MICRO ceiling on prod can deny connections to real users, demos, and `/internal`. *Mitigation:*
   the §8 **reserved-headroom ceiling** (never exceed a fraction of the tier limit) + low-traffic
   windows; accept that this measures *approach-to-ceiling*, not a true outage. If a true
   saturation test is ever needed, run it off a clone, not shared prod.
6. **[Email reputation] Bounce storm degrades Resend sender reputation.** *Mitigation:* §4.5 email
   suppression for synthetic recipients; verified at the three send entry points.
7. **[Real↔bot entanglement] Real users transact with bots** (interactive by design): stuck flows
   or teardown removing a real user's bot-directed history. *Mitigation:* test-mode Connect so
   real→bot flows complete; the live-mode money guard; documented teardown cascade; purge before
   go-live.
8. **AI spend is real even when hidden from the cap.** *Mitigation:* sampling + hard daily ceiling
   + the synthetic cost view.
9. **Stripe misconfig = real charges.** *Mitigation:* the load-bearing boot assertion; harness env
   never holds a live key; purge-before-go-live.
10. **`platform_weight` double-duty** — a wrong real/synthetic split mis-informs scaling or KPIs.
    *Mitigation:* keep physical fields whole, split only counts into `*_real`; test both readouts.

---

## 15. Open Questions / Tunables (confirm at kickoff)

- **N** = 500; **split** ~65/35 creators/businesses — confirm.
- **Browser pool** size (10–25) and **daily transaction floor** (~100–150; min 20).
- **Donny AI fraction** (≤10% of campaign creations) + **daily synthetic-AI USD ceiling** (propose
  $3–5/day).
- **Reserved-headroom fraction** for concurrency (propose ≤ ⅔ of the tier connection limit).
- **`botInitiateTowardRealRate`** — how often (if ever) bots initiate toward real users vs only
  respond (default near-zero; §6).
- **Faker devDependency** vs curated pools for persona data (default: faker).
- Whether **Phase 4** ships in this plan or splits into its own (default: keep, but gate it last).
