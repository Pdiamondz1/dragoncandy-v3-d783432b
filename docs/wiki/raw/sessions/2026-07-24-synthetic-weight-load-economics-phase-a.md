# Session — Synthetic Weight Engine: Phase A (load proof & economics)

**Date:** 2026-07-24
**Branch:** `feat/synthetic-weight-load-economics` (PR pending)
**Spec:** `docs/superpowers/specs/2026-07-24-synthetic-weight-load-economics-design.md`
**Plan:** `docs/superpowers/plans/2026-07-24-synthetic-weight-load-economics-phase-a.md`
**Builds on:** [[Synthetic Weight Engine]] Phase 0 (safety spine) + Phase 1 (private-crew behavior engine).

## What shipped

Phase A turns the synthetic harness from a *liveness/QA* engine (Phase 1) into a **load-proof +
economics** engine, without weakening any Phase 0 safety invariant. It is harness + one migration +
a dashboard slice — the actual load ramps are **founder-gated operator runs** (a runbook), not part
of the merge. All new code lives under `sim/` plus a `/internal/simulation` dashboard slice; prod
stays byte-unchanged behind the `SYNTHETIC_BOTS_ENABLED` kill switch.

**Framing the founder set (captured for the record):** the ask was "50,000-bot DAUs quickly." The
reframe that drove the design: **load = concurrency, not headcount.** 50K DAU ≈ ~800–1,000 peak
*concurrent* requests; you reproduce request VOLUME with a reusable session pool + a burst driver,
not 50K standing sessions. The user relaxed isolation ("don't worry about the real users, they're
testers too"), so Phase A runs **single-track on prod** (ramp prod compute, purge after) and
deliberately targets the saturation **knee** (measurable degradation), never a true outage — so the
observability RPCs stay responsive enough to record the very samples the curve needs.

### 1. Cross-tick session pool (`sim/session-pool.ts`) — the keystone

Phase 1's `docs/wiki` page flagged "cross-tick session reuse … deferred" as the deeper fix for the
per-IP auth 429 wall. Phase A delivers it. Instead of re-minting a magiclink→verify session per bot
per tick (2 auth calls each, the rate-limited path), the pool persists each bot's session to a
gitignored `sim/.session-pool.json` and, when near expiry, **refreshes** (1 call) or **reuses** (0
calls). Pure token logic (`deriveExpiresAt`/`isExpired`/`chooseRefreshOrMint`) is unit-tested; the
network calls (`mintBotSession`/`refreshSession`) are injectable.

- **GoTrue rotates the refresh token on every refresh**, so a concurrent double-refresh 400s
  "already used" → a **per-bot single-flight** guard (`Map<email, Promise>`) collapses concurrent
  `getToken` calls for one bot into one underlying mint/refresh. `save()` is fully synchronous
  (mkdir→write-temp→rename, no await between snapshot and write) so two saves can't interleave.
- **Sessions are bound to `userId` (Codex round 6).** The pool is keyed by email, but after a local
  purge + re-mint the same email maps to a NEW auth user id; an email-only cache would hand back the
  deleted user's still-unexpired JWT → subsequent actions run as `auth.uid()` of a deleted user
  (empty/failed RLS). Each `PooledSession` now carries `userId`; a cached entry whose userId no
  longer matches is a cache MISS → fresh mint. `isPooledSession` requires `userId`, so a pre-upgrade
  cache file is dropped on load (clean re-mint).

### 2. Two-lane bulk-seed (`sim/seed.ts` + `seed_synthetic_cohort` RPC)

`bulk-seed --n <TOTAL> --active <ACTIVE>` splits a synthetic population into two structurally
disjoint lanes:

- **DEPTH pool** — bulk `auth.users` INSERT via the new service-role `seed_synthetic_cohort` RPC;
  these users **never authenticate** (they exist only to make listings/browse look populated). Email
  `botseed_<cohort>_<i>@synthetic.dragoncandy.test`; the RPC relies on the Phase-0 `handle_new_user`
  trigger to tag them into `synthetic_users`; deterministic id via
  `extensions.uuid_generate_v5(namespace, email)` + `on conflict (id) do nothing` = idempotent.
- **ACTIVE cohort** — minted one-by-one via `mintBot` (session-capable). Distinct namespace
  `botla<seed>_<i>@…` — because `generateCohort` emits index-based `bot001…` regardless of cohort
  label and the **live daily cohort already occupies `bot001…bot025`**, reusing that scheme would
  duplicate-email. `assertActiveNamespaceFree` pre-flights the active namespace (bulk-seed is
  one-shot; purge before re-seeding). The three namespaces (`botseed_`/`botla`/`bot0##`) are disjoint
  by 4th char.

### 3. Ramped load driver (`sim/load/driver.ts`) + findings

`load --ramp start/max/factor --hold-ms N --run-label L` reuses the pooled sessions (pre-warmed
serially first), ramps concurrency in geometric steps via a bounded fixed-worker pool, holds each
step, and **stops at the saturation knee** (sustained error-rate OR relative p95 degradation with an
absolute floor) — never a full DoS. It **collects ALL breakage signatures** (does not abort on the
first) into `sim/.load-findings.json` and sets `process.exitCode` after writing (not a throw).
`classifyError` scores 429/503/53300/rate-limit wording as **throttle** (saturation, expected) and
everything else as **breakage** (a real defect surfaced under load).

- `HOT_ACTIONS` are ~90% reads against public/own-RLS surfaces (published campaigns, verified
  DragonShare posts, the creator directory, own conversations, own pending-invite RPC). Writes
  deferred.
- `load` drives **only session-capable bots** — `readSessionCapableBots` (see §5) excludes the
  depth pool at the DB.

### 4. Two service-role RPCs — migration `20260724170000_sim_load_seed_rpcs.sql` (applied to prod)

Both `SECURITY DEFINER`, `set search_path = public`, revoked from public/anon/authenticated, granted
`service_role` only:
- `seed_synthetic_cohort(p_n, p_cohort, p_creator_split)` → `{seeded, skipped}` (depth-pool bulk
  insert; email domain hardcoded so `handle_new_user` always tags; only ever role
  `content_creator`/`business_client` — cannot mint a privileged/non-synthetic user).
- `capture_sim_load_snapshot(p_run_label, p_error_rate, p_notes)` → reads `pg_stat_activity` +
  `pg_stat_statements` (resolved cross-schema via `to_regclass`; degrades `avg_query_ms` to NULL if
  the extension is absent; the dynamic query uses a `regclass`, not user input → no injection).

### 5. `/internal/simulation` dashboard slice + observability

- New `useSimLoadSnapshots` hook (React Query, internal-gated `sim_load_snapshots` SELECT,
  newest-first) → a **load-curve table** (run · captured · active/max conns · avg query · error rate,
  `dc-pink`-tinted at/above the 10% knee) on the dark ops-deck page. Own loading/error/empty states.
- **Modeled revenue** block (`src/lib/internal/modeledRevenue.ts`): `computeModeledRevenue` — a pure
  projection, `GMV = synthetic_campaigns × $250 assumed × 10% free-tier take-rate`. Styled
  deliberately distinct (dashed border + `MODELED` badge + inline assumptions) so it can NEVER be
  mistaken for measured revenue (Phase B).
- `readSessionCapableBots` (`sim/mint.ts`) — the lightweight cohort read `load` (and now `tick`) use:
  fetches only session-capable bot refs by email pattern (`@synthetic…` AND NOT `botseed_%`),
  skipping the heavy crew/campaign graph that `readCohort` reconstructs.

### 6. Runbook + findings template

- `docs/runbooks/synthetic-load-tier-ramp.md` — the founder-gated ramp procedure (pre-flight →
  seed → ramp → read → step-the-tier → synthesize → **teardown**). §7 teardown critically warns: do
  NOT run `purge_synthetic_data()` (it wipes the **live** 25-bot cohort); delete by the by-construction
  safe prefixes `botseed_%` / `botla%_%` (disjoint from the live `bot0##`) and snapshot labels.
- `docs/superpowers/load-findings/TEMPLATE.md` — the "what to fix before 50K DAUs" report (bugs from
  the findings JSON + bottlenecks from `pg_stat_statements`/advisors/snapshots + tier/optimization
  improvements).

## Phase A gotchas / decisions

- **Modeled revenue only.** Phase A surfaces a clearly-labeled MODELED projection; **measured**
  revenue (real test-mode PaymentIntent settlement) + capped Donny AI spend are **Phase B**, a
  separate gated plan (spec §5b: R1 Playwright vs R2 programmatic PaymentIntent, decided at the A/B
  boundary).
- **Knee, not outage** — this reverses Phase 0's "clone-only saturation" mitigation, owned
  explicitly because the user declared real users are testers too.
- **Single-egress-IP caveat** — one runner = one IP, subject to per-IP auth/PostgREST/Cloudflare
  limits, so a single-runner "ceiling" may reflect a client-side limit, not the DB's; fan out across
  a runner matrix and sum for the real ceiling. The GH-workflow `load` option is a convenience smoke,
  runbook/local-first is the real test.
- **`purge_synthetic_data()` is a footgun for load cleanup** — it wipes the live cohort. Teardown is
  by namespace prefix.

## The Codex second-review gauntlet (8 real issues over 7 rounds — all fixed + regression-tested)

The mandatory independent reviewer earned its keep on this branch:
- **R1 P1** — `load` drove the entire `synthetic_users` set incl. the depth pool → would mint a
  session per non-authenticating depth user (per-IP 429 wall). Fixed: filter to session-capable.
- **R1 P3** — `parseRamp` accepted a malformed spec and silently degraded to a `[50]` one-step ramp;
  now fails loud.
- **R2 P1** — the R1 filter ran *after* the heavy `readCohort` (oversized `.in()` over 50K rows
  before load starts); added `readSessionCapableBots` (DB-filtered, graph-free).
- **R2 P2** — comma-form `parseRamp` silently dropped invalid tokens (`50,150O` → `[50]`); now fails
  loud on any invalid token.
- **R3 P2** — the `creator_directory` hot action selected `full_name`/`role`, but
  `public_creator_profiles` exposes `creator_name` and no `role` → every run logged a FALSE breakage.
  Fixed to real columns (verified on prod); other hot actions' columns re-verified clean.
- **R4 P1** — after a `bulk-seed`, the daily `tick`'s `readCohort` would drag in the depth pool
  (mint sessions for thousands that never authenticate, breaking the live cron). Restructured
  `readCohort` to derive from `readSessionCapableBots`.
- **R5 P1** — the DB snapshot was captured AFTER `await runPool` drained the wave, so
  `pg_stat_activity` saw only the snapshot RPC, not the concurrency → the `active_connections` curve
  (the core deliverable) read artificially low. Now the wave and snapshot run concurrently
  (`Promise.all`); a gate-based test proves the snapshot fires before any wave task completes.
- **R6 P2** — the session pool reused a stale JWT after a purge + re-mint (email-keyed). Bound
  sessions to `userId`.
- **R7 — clean.**

**Lesson reinforced:** every finding was a LEAD verified against the code (and, for R3, against the
real prod view schema via `information_schema.columns`) before fixing — never blindly implemented.
See [[Verify a reviewer's claim before accepting OR dismissing]] and [[MCP execute_sql returns only
the LAST statement's result]].

## Files

- New: `sim/session-pool.ts`(+test), `sim/seed.ts`(+test), `sim/load/driver.ts`(+test),
  `src/hooks/internal/useSimLoadSnapshots.ts`, `src/lib/internal/modeledRevenue.ts`(+test),
  `supabase/migrations/20260724170000_sim_load_seed_rpcs.sql`,
  `docs/runbooks/synthetic-load-tier-ramp.md`, `docs/superpowers/load-findings/TEMPLATE.md`.
- Modified: `sim/run.ts`, `sim/mint.ts`(+test), `sim/session.ts`, `.github/workflows/synthetic-weight.yml`,
  `src/pages/internal/InternalSimulation.tsx`, `src/integrations/supabase/types.ts` (additive).
- Verify gates: full suite 1220 tests / 0 failed; app + `sim/` typecheck; build; eslint; Codex clean;
  data-exposure-reviewer PASS. Live ramps remain founder-gated (runbook).
