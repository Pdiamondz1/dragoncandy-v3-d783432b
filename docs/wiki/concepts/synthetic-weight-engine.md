---
title: Synthetic Weight Engine
type: concept
created: 2026-07-23
updated: 2026-07-24
sources: [2026-07-23-synthetic-weight-engine-phase-0.md, 2026-07-23-synthetic-weight-engine-phase-1.md, 2026-07-24-synthetic-weight-load-economics-phase-a.md]
tags: [synthetic, bots, load-testing, segregation, safety-spine, aios, metrics, teardown]
---
# Synthetic Weight Engine

A system for minting synthetic ("bot") users across business + creator roles that behave like live
daily-active users making marketplace transactions — to add **liveness/optics**, prove **load/
performance**, and surface **QA bugs**. Cohort size is a tunable `N` (default 500); the real load
variable is **concurrency**, not headcount (Supabase MICRO caps ~60 connections, so scale is proven
by pressuring connections under burst, not by transaction count).

It runs on **production**, so its defining constraint is **segregation completeness**: every row a bot
writes must be tagged and excluded from every founder metric and the data-flywheel moat (Donny's
training corpus). One missed surface = permanent contamination. That safety spine is **Phase 0** and
gates everything else. Phase 0 shipped 2026-07-23 (`feat/synthetic-weight-engine`); **Phase 1** (the
private-crew behavior engine, below) followed on `feat/synthetic-weight-phase-1`. The kill switch is
**OFF** and there are **0 bots**, so both phases are present but inert.

## Architecture — the safety spine

Tagging is done at the **DB layer** so the harness cannot "forget" it:

- **Email is the source of truth.** Every bot is minted with `bot…@synthetic.dragoncandy.test`. The
  existing `handle_new_user` trigger is extended to auto-register any such signup into
  `public.synthetic_users` (registry: `user_id` PK → `auth.users` ON DELETE CASCADE, `cohort`,
  `persona`).
- **Helpers** (SECURITY DEFINER, **service-role only**): `is_synthetic(uuid)` (in-registry),
  `is_synthetic_campaign(uuid)` (campaign owner), `is_synthetic_org(uuid)` (org owner via
  `org_members.role='owner'`).
- **Denormalized `is_synthetic boolean`** (nullable) on the 5 rootless/telemetry tables that can't be
  traced to a single user FK — `payment_events`, `analytics_events`, `dragonshare_events`,
  `pricing_funnel_events`, `donny_cost_ledger` — stamped by `BEFORE INSERT` triggers. This is the
  column a future LoRA export keys on.
- **Exclusion — the two-sided actor-OR-parent predicate.** A row is excluded from a founder metric iff
  a synthetic actor **OR** a synthetic parent/counterparty is involved — never a single FK. Applied
  in `aios_platform_stats` / `aios_revenue_stats` / `aios_cost_stats`, `capture_platform_weight`'s
  `row_counts_real`, and the edge-fn `donny-cost-rollup`. Compounds the same discipline as
  [[Service-Role Data Exposure]] (server-side re-assertion of the intended scope).
- **Kill switch** `SYNTHETIC_BOTS_ENABLED` (feature_flags `name`/`is_enabled`, default false,
  **fail-closed** — the harness refuses to run unless it reads back exactly `true`; mirrors the DRE
  two-switch launch, see [[Dragon Rewards Engine (DRE)]]).
- **Money guard** (`release-creator-payout` + pure `_shared/synthetic-guard.ts`): never settle real
  money to/from a synthetic user; refuses live-mode settlement if **either** the creator or the
  campaign owner is synthetic; a `synthetic_users` read error in live mode fails **closed**. Bots use
  test-mode Stripe only (see [[Test-Mode Stripe UX]]).
- **Email suppression** to bot addresses in `send-notification-email` / `send-welcome-email` /
  `create-notification` (the in-app row is still written; only the outbound Resend leg is suppressed,
  backstopped by the sender's own suffix guard — see [[Notification delivery choke point]]).
- **SHOW side:** `get_simulation_stats()` (internal-gated) + the `/internal/simulation` founder
  dashboard is the ONE surface that intentionally shows synthetic. `platform_weight`'s **physical**
  fields (`db_bytes`/`storage_bytes`) and count **totals** deliberately include synthetic (bots use
  real disk/rows/connections — that's the load-proof); the parallel `*_real` columns carry the
  synthetic-excluded growth view, and `/internal/weight` shows the total with a "real" subcount.
- **Teardown:** `purge_synthetic_data()` (service-role only, leaf-first) deletes the rootless ledgers
  **before** `auth.users` (so `ON DELETE SET NULL` links aren't lost) and explicitly deletes the
  **non-cascading** synthetic org rows (`organizations`/`org_units` have no `auth.users` FK — ownership
  is only via `org_members.role='owner'`).

## The Phase 0 proof (segregation + teardown)

Validated on a 5-bot round-trip run **rollback-wrapped** against prod (persists nothing), under
`REPEATABLE READ` so concurrent real activity can't cause a false mismatch: mint 5 bots (2 business
w/ auto-orgs + 3 creators) → mixed real↔bot activity → the real `aios_*` RPCs are **byte-identical**
before/after (minus `generated_at`) → `get_simulation_stats` shows the cohort → `purge_synthetic_data()`
returns **every residual = 0** → ROLLBACK. Reproducible any time the spine changes. Enablers:
`set_config('request.jwt.claim.sub', <admin uuid>, true)` fakes `auth.uid()` so the internal-gated RPCs
run (see [[Testing auth.uid() RPCs and RLS on prod]]); `auth.users` has exactly one insert trigger
(`handle_new_user`, pure SQL, no external call) so a rollback-wrapped mint fires no webhook/email.

## Phase 1 — the private-crew behavior engine

The first live-cohort engine, entirely in the `sim/` harness — **no DB migrations, no edge-function
changes** (it only *uses* the Phase 0 spine + existing crew/content/review RPCs). It mints a real
N=25 cohort (≈65% creators / 35% Hoboken restaurants) and drives the full **free-rails** funnel
**inside private crews** so bots only ever interact with bots.

- **Isolation is structural.** Crew campaigns (`group_id` set) are visible only to member bots via
  the `campaigns` SELECT RLS and are never broadcast — real users literally can't see or apply. The
  chosen lane (over a public-marketplace lane) needs **zero new metric-exclusion surfaces**; the pure
  planner has a hard invariant + test that it never creates a public (`group_id IS NULL`) campaign.
- **Every marketplace write is RLS-real, as the bot** (a per-bot JWT minted via the `staging-login`
  magiclink→verify pattern, adapted to prod synthetic users). Service-role is used ONLY for minting,
  `email_verified`, cohort reads, and teardown. The content funnel uses **direct RLS writes**, not the
  service-role-only `transition_content_status` RPC.
- **Funnel** (one stage advanced per tick, so a fresh cohort drains over several ticks and a steady
  cohort keeps flowing): crew → invite → accept → post free crew campaign → apply →
  hire (one atomic `accept_application_with_collaboration` RPC) → upload (metadata-only `file_uploads`,
  no storage object) → submit → **dual-party completion** (both parties request; the 2nd flips to
  `completed`; crew campaigns skip payout) → review → repeat. `record_crew_activity` is RPC-only (no
  `create-notification` leg) so **a bot never triggers an outbound email**.
- **Teardown holds for crews** (the gap Phase 0's non-crew proof left): `purge_synthetic_data()`
  leaves zero residue even with a crew campaign present — the `campaigns.group_id → creator_groups`
  RESTRICT does not bite because the campaign cascades (via `user_id → profiles`) before its crew
  (verified rollback-wrapped on prod). See [[Content Delivery State Machine]] for the funnel it drives.
- **Go-live is two deliberate switches, never a merge.** Merging leaves prod byte-unchanged (harness +
  a dormant `workflow_dispatch`-only workflow; kill switch OFF). Task 8 (founder-gated live smoke:
  flip `SYNTHETIC_BOTS_ENABLED` on → `mint --n 5` → `tick`s → assert `aios_*` metrics unchanged +
  `get_simulation_stats` shows the cohort → `purge` → zero residue) is parked for the founder's
  `SIM_*` secrets + kill-switch authorization; enabling the daily cron is the second switch.

### Phase 1 gotchas learned

- **`file_uploads` needs `bucket_name`/`filename`/`original_filename`/`mime_type`** (all NOT NULL, no
  default) beyond `file_path`/`file_size`/`uploaded_by` — the Codex second review caught the missing
  four (every `uploadDeliverable` would 23502 and wedge the funnel). A multi-statement `execute_sql`
  schema check had silently returned only its last result set, hiding this (see
  [[MCP execute_sql returns only the LAST statement's result]]).
- **GitHub Actions script-injection:** workflow inputs must pass through `env:` vars, never be
  interpolated into a `run:` shell that holds secrets (Codex P1).
- **`hire` is one atomic RPC** — `accept_application_with_collaboration` itself sets the app
  `accepted` + creates the collab `ON CONFLICT DO NOTHING` + accepts an already-`accepted` app, so a
  manual pre-accept is redundant and only adds a non-atomic wedge window.

## Known issues / gotchas

- **`CREATE OR REPLACE` of a shared trigger fn silently reverts later migrations.** The plan said
  "reproduce `handle_new_user` from `20260427220001`", but two later migrations had changed it
  (`account_scope='internal'` guard for [[AIOS Stakeholder Invites]]; `ON CONFLICT DO UPDATE`
  re-signup refresh). The first spine migration reverted both on prod. **Always diff a shared function
  against its CURRENT prod definition (`pg_get_functiondef`), never an old migration file.** Fixed by
  corrective migration `20260723132000`.
- **Apply actor-OR-parent to EVERY party of a multi-party table.** Two rounds of Codex review caught
  single-party predicates: the payout guard (creator only → creator + campaign owner) and the
  `messages` count (`sender_id` only → sender + recipient). `dragonshare_boosts` correctly checks all
  three of its parties. When counting or gating a table with more than one participant, enumerate them
  all.
- **Codex earned four fixes across three rounds** — the mandatory second reviewer is high-value on a
  segregation guarantee where a single missed surface breaks the moat.
- **Physical vs growth counts are different questions.** `platform_weight` deliberately keeps
  synthetic-inclusive totals (scaling: real disk/rows) AND `*_real` (growth). Don't "fix" a scaling
  surface to `*_real` — it would undercount real load.
- **MCP hand-bundle vs CLI for edge-fn deploys.** MCP `deploy_edge_function` hand-bundles are
  transcription-risky for large HTML email templates (`send-notification-email` is 1063 lines); prefer
  `supabase functions deploy <name> --project-ref … --no-verify-jwt` from the worktree (auto-bundles
  from disk). Always preserve each function's existing `verify_jwt`.

## Phase 1 live smoke (Task 8) — ran on prod 2026-07-24, PASSED (one teardown fix)

The founder-authorized live smoke ran the full cycle on prod: flip `SYNTHETIC_BOTS_ENABLED`→true →
baseline snapshot → `mint --n 5` → ~10 `tick`s (full crew funnel, **0 failures**, 2 collaborations
completed+approved and mutually reviewed) → isolation proof → `purge` → switch off.

**Isolation held end-to-end.** Every real corpus count (`WHERE NOT is_synthetic(...)`) was
byte-identical before/after — campaigns 25, apps 22, collabs 16, files 27, reviews 12, crews 2, users
41 — while the totals grew by exactly the synthetic rows; zero real-user notifications/messages;
`get_simulation_stats()` showed the 5-bot cohort (2 hoboken_restaurant + 2 luxury + 1 genz). Phase 0's
segregation works.

**The teardown bug the smoke caught (its whole purpose).** `purge_synthetic_data()` relied on
`delete auth.users → profiles CASCADE`, but two Phase 1 crew tables have **NO ACTION** FKs to
`profiles` that block that cascade: `creator_group_members.invited_by` and
`crew_activity.actor_id`/`participant_id`. The first real purge failed on
`creator_group_members_invited_by_fkey` and rolled back (transactional — no half-delete). Fix
(migration `20260724011000_purge_synthetic_crew_leaf_delete`): leaf-delete synthetic `crew_activity` +
`creator_group_members` rows BEFORE the cascade, and add both to the fail-loud residual report. Every
other bot-touched table (campaigns/apps/collabs/file_uploads/project_reviews/creator_groups) is
`ON DELETE CASCADE` and clears automatically — confirmed via `pg_constraint.confdeltype`. **Lesson:
"verified by reasoning" ≠ "verified by running"** — Phase 0/1 reasoned that the ONE crew FK it
considered (`campaigns.group_id` RESTRICT) wouldn't bite, but never considered the crew
membership/activity FKs; only running the real purge on real crew rows surfaced them, and the fail-loud
purge (throws on any non-zero residual) made the gap loud instead of silent residue. See
[[Testing auth.uid() RPCs and RLS on prod]] for the aios_*/get_simulation_stats internal-auth-gated
snapshot technique the proof used.

## Phase 1 go-live — N=25 cohort + daily cron (Task 8 second switch), 2026-07-24

After the smoke passed, both go-live switches were thrown: `SYNTHETIC_BOTS_ENABLED` on (now permanent),
a **persistent 25-bot cohort** minted on prod, the 5 `SIM_*` secrets set in a new **protected
`synthetic-weight` GitHub Environment** (no required reviewers = unattended; holds the prod
service-role key, the harness's inherent exposure surface — founder-approved), and the daily
`0 14 * * *` cron enabled to drive **one tick/day**.

**The scaling finding the N=25 run caught.** The per-bot session model mints a fresh magiclink→verify
session per acting bot **each tick** (`makeBotFor` caches only within a tick). Running ~5 ticks
back-to-back from one IP (~125 session mints in minutes) trips Supabase's **per-IP auth `verify` rate
limit → 429**; the fail-loud tick surfaced it loudly. **The daily cron is a different profile** — one
tick/day from a **fresh GitHub-runner IP** (~25 mints) — and was validated live: a `workflow_dispatch`
tick from the runner cleanly drove the apply stage (0→27 applications, 0 failures) that had 429'd
locally. So: **keep it to one run/day** (the workflow comments say so). **Shipped hardening:**
`mintBotSession` now retries 429/503 with exponential backoff (honoring `Retry-After`; `fetchWithRetry`
in `sim/session.ts`), so a transient/borderline limit no longer red-fails a run — a sustained
hard-window exhaustion still fails loud after the retries (by design). The deeper fix for higher
frequency / larger N remains **cross-tick session reuse** (persist each bot's refresh token instead of
re-minting every tick) — deferred. To pause the whole engine:
flip `SYNTHETIC_BOTS_ENABLED` off (every run then fail-closes at boot) and/or re-comment the schedule;
teardown is `purge_synthetic_data()` (now crew-safe).

## Phase A — load proof & economics (2026-07-24, `feat/synthetic-weight-load-economics`)

Phase A turns the engine from *liveness/QA* (Phase 1) into a **load-proof + economics** engine
without weakening any Phase 0 invariant. Harness + one migration + a `/internal/simulation` dashboard
slice; prod stays byte-unchanged behind the kill switch, and the actual ramps are **founder-gated
operator runs** (a runbook), not part of the merge. Raw source:
`docs/wiki/raw/sessions/2026-07-24-synthetic-weight-load-economics-phase-a.md`.

**Framing:** the ask was "50,000-bot DAUs quickly"; the reframe that drove the design is **load =
concurrency, not headcount** (50K DAU ≈ ~800–1,000 peak concurrent → reproduce request VOLUME via a
reusable session pool + burst driver, not 50K standing sessions). With the user declaring real users
are testers too, Phase A runs **single-track on prod** and targets the saturation **knee** (measurable
degradation), never a true outage — so the observability RPCs stay responsive enough to record the
samples the curve needs (reversing Phase 0's "clone-only saturation" mitigation, owned explicitly).

- **Cross-tick session pool** (`sim/session-pool.ts`) — the keystone Phase 1 marked "deferred."
  Persists each bot's session to a gitignored `sim/.session-pool.json` and **refreshes** (1 call) or
  **reuses** (0 calls) instead of re-minting (2 calls) each tick — lifting the per-IP auth 429 wall.
  GoTrue rotates the refresh token on use → a **per-bot single-flight** guard collapses concurrent
  `getToken`s into one mint/refresh; `save()` is synchronous (temp-write→rename) so saves can't
  interleave. Sessions are **bound to `userId`**: after a purge + re-mint the same email maps to a new
  auth user, so an email-only cache would reuse the deleted user's JWT (empty/failed RLS) — a
  userId-mismatch is a cache MISS → fresh mint.
- **Two-lane bulk-seed** (`sim/seed.ts` + `seed_synthetic_cohort` RPC) — a **DEPTH pool**
  (`botseed_<cohort>_<i>`, bulk-inserted by the service-role RPC, **never authenticates** — just DB
  weight so listings look populated; idempotent via `extensions.uuid_generate_v5` +
  `on conflict do nothing`) and an **ACTIVE cohort** (`botla<seed>_<i>`, minted, session-capable).
  The distinct `botla` namespace is load-bearing: `generateCohort` emits index-based `bot001…`
  regardless of cohort label and the **live daily cohort already occupies `bot001…bot025`**, so
  reusing it would duplicate-email. The three namespaces (`botseed_`/`botla`/`bot0##`) are disjoint.
- **Ramped load driver** (`sim/load/driver.ts`) — reuses pooled sessions (pre-warmed serially),
  ramps concurrency in geometric steps via a bounded worker pool, and **stops at the knee** (error-rate
  OR relative-p95 degradation). **Collects ALL breakage signatures** (never abort-on-first) →
  `sim/.load-findings.json`, exitCode set after writing. `classifyError` scores 429/503/53300 as
  **throttle** (expected saturation), everything else as **breakage** (a real defect under load).
  `parseRamp` **fails loud** on any malformed spec (no silent one-step ramp). `load` drives **only
  session-capable bots** — `readSessionCapableBots` (`sim/mint.ts`) reads them by email pattern
  (`@synthetic…` AND NOT `botseed_%`), skipping the heavy crew/campaign graph.
- **Two service-role RPCs** — migration `20260724170000_sim_load_seed_rpcs.sql` (applied to prod):
  `seed_synthetic_cohort` (depth insert; email domain hardcoded so `handle_new_user` always tags;
  role only `content_creator`/`business_client` — cannot mint a privileged user) and
  `capture_sim_load_snapshot` (reads `pg_stat_activity`/`pg_stat_statements` via cross-schema
  `to_regclass`; degrades `avg_query_ms` to NULL if the extension is absent; `regclass` not user
  input → no injection). Both DEFINER, `service_role`-only. Snapshot capture runs **concurrently with
  the in-flight wave** (`Promise.all`) — a snapshot taken after the wave drained would see only the
  snapshot RPC, not the concurrency, so `active_connections/max_connections` (the curve's primary
  signal) would read artificially low.
- **`/internal/simulation` slice** — a `useSimLoadSnapshots` React-Query hook feeds a dark-ops-deck
  **load-curve table** (active/max conns · avg query · error rate); a **MODELED revenue** block
  (`computeModeledRevenue`: `synthetic_campaigns × $250 × 10% free-tier take`) styled deliberately
  distinct (dashed + `MODELED` badge + inline assumptions) so it can never read as real revenue.
  **Measured** revenue + capped Donny AI are **Phase B** (separate gated plan).
- **Runbook + findings template** — `docs/runbooks/synthetic-load-tier-ramp.md` (founder-gated ramp;
  §7 teardown warns **not** to use `purge_synthetic_data()` — it wipes the live 25-bot cohort — and
  deletes by the by-construction-safe prefixes `botseed_%`/`botla%_%`, disjoint from the live
  `bot0##`) + `docs/superpowers/load-findings/TEMPLATE.md` (the "what to fix before 50K DAUs" report).

### Phase A — the Codex gauntlet (8 real issues over 7 rounds, all fixed + regression-tested)

The mandatory second reviewer caught, in order: `load` driving the depth pool (per-IP 429); a
silent one-step ramp on a typo; the heavy `readCohort` running before the depth filter (oversized
`.in()` at 50K); comma-ramp silently dropping invalid tokens; the `creator_directory` action
selecting non-existent columns (`full_name`/`role` vs the view's `creator_name`) → a FALSE breakage
every run; the daily `tick` dragging in the depth pool after a bulk-seed; the DB snapshot captured
**after** the wave drained (artificially-low connection curve); and a stale pooled JWT reused after a
purge+re-mint. Each was a LEAD **verified against the code** (R3 against the real prod view schema via
`information_schema.columns`) before fixing — see [[Verify a reviewer's claim before accepting OR
dismissing]] and [[MCP execute_sql returns only the LAST statement's result]]. R7 was clean.

## See Also
- [[Service-Role Data Exposure]] — the same "re-assert the intended scope server-side" discipline.
- [[AIOS runtime spend source of truth]] — `donny_cost_ledger` / the 15% AI cap the synthetic
  exclusion protects.
- [[Testing auth.uid() RPCs and RLS on prod]] — the rollback + `set_config` technique the proof uses.
- [[AIOS Stakeholder Invites]] — the `account_scope='internal'` guard the corrective migration restored.
