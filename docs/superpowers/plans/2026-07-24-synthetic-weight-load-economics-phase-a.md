# Synthetic Weight Engine — Phase A (Load + Real Cost) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the live synthetic bot harness so we can drive real concurrent load against prod,
capture a performance-and-cost-per-tier curve, and read real synthetic expenses — with synthetic
activity kept out of every real KPI.

**Architecture:** Add a cross-tick **session pool** (refresh tokens, not re-mint) as the keystone;
bulk-**seed** a large depth population + a session-capable active cohort; a concurrent **load driver**
that reuses the pool and ramps to the saturation knee; a `capture_sim_load_snapshot` RPC writing the
already-existing `sim_load_snapshots`; and a `/internal/simulation` dashboard slice showing the curve
+ cost. All gated by the existing kill switch + boot gate.

**Tech Stack:** Node/tsx harness (`sim/`), Supabase (SECURITY DEFINER RPCs, service-role + per-bot
JWT), React `/internal`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-24-synthetic-weight-load-economics-design.md` (spec-review
approved). This plan implements **Phase A** (§3, §4). Phase B (§5, measured revenue) is a separate,
later plan gated on the §5b settlement fork.

**Ground rules for every task:** work on branch `feat/synthetic-weight-load-economics`; commit per
task; `npm run typecheck` + `npm run build` + `npm run test` must stay green; any new/changed
SECURITY DEFINER RPC goes through the **data-exposure-reviewer** subagent before it is applied to
prod; migrations are applied to prod **before** the harness code that depends on them (deploy
ordering); the kill switch (`SYNTHETIC_BOTS_ENABLED`) and test-Stripe boot gate are never weakened.

---

## File Structure

**New:**
- `sim/session-pool.ts` + `sim/session-pool.test.ts` — persist/refresh per-bot sessions to a
  gitignored file; the keystone.
- `sim/seed.ts` + `sim/seed.test.ts` — `bulk-seed` logic: depth cohort via RPC, active cohort via
  `mintBot`.
- `sim/load/driver.ts` + `sim/load/driver.test.ts` — concurrent ramped request generator.
- `supabase/migrations/20260724170000_sim_load_seed_rpcs.sql` — `seed_synthetic_cohort()` +
  `capture_sim_load_snapshot()` (both service-role SECURITY DEFINER).
- `docs/runbooks/synthetic-load-tier-ramp.md` — the founder-gated tier-ramp + findings-synthesis
  operating procedure.
- `docs/superpowers/load-findings/TEMPLATE.md` — the categorized Load Findings Report template
  (bugs / bottlenecks / improvements); per-run reports land beside it as `<date>.md`.

**Modified:**
- `sim/run.ts` — wire the session pool into `makeBotFor`; add `bulk-seed` + `load` subcommand
  handlers; extend `COMMANDS`.
- `sim/cli.ts` — only the usage string / `COMMANDS` list if it duplicates one (it imports `main`).
- `.gitignore` — ignore the session-pool file (`sim/.session-pool.json`) + the load-run findings
  artifact (`sim/.load-findings.json`).
- `.github/workflows/synthetic-weight.yml` — add `bulk-seed` + `load` to the `command` choice input.
- `src/pages/internal/InternalSimulation.tsx` (+ its hook) — render the load-snapshot curve + cost.

**Reuse (no change):** `sim/mint.ts`, `sim/session.ts`, `sim/clients.ts`, `sim/env.ts`,
`sim/personas.ts`, the safety-spine migration, `get_simulation_stats`.

---

## Task 1: Session pool module (the keystone)

**Files:**
- Create: `sim/session-pool.ts`, `sim/session-pool.test.ts`
- Reference: `sim/session.ts` (`mintBotSession` returns `{access_token, refresh_token, expires_in}`),
  `sim/clients.ts`

Persist each bot's session to a gitignored JSON file; on use, refresh an expired token (one call)
instead of re-minting (two calls + rate-limited `generate_link`). Pure token logic is unit-tested
against a fake fetch; file I/O is a thin wrapper.

- [ ] **Step 1: Write failing tests** (`sim/session-pool.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { isExpired, chooseRefreshOrMint, deriveExpiresAt } from "./session-pool";

describe("deriveExpiresAt", () => {
  it("is now + expires_in seconds (ms)", () => {
    expect(deriveExpiresAt(1000, 3600)).toBe(1000 + 3600 * 1000);
  });
});

describe("isExpired", () => {
  it("treats a token inside the skew window as expired", () => {
    // expires_at 1_000_000; 60s skew; now 60s before expiry ⇒ expired
    expect(isExpired({ expiresAt: 1_000_000 }, 940_000, 60_000)).toBe(true);
    expect(isExpired({ expiresAt: 1_000_000 }, 930_000, 60_000)).toBe(false);
  });
});

describe("chooseRefreshOrMint", () => {
  it("mints when absent, refreshes when present+expired, reuses when fresh", () => {
    expect(chooseRefreshOrMint(undefined, 0, 60_000).action).toBe("mint");
    expect(chooseRefreshOrMint({ expiresAt: 100 }, 100_000, 60_000).action).toBe("refresh");
    expect(chooseRefreshOrMint({ expiresAt: 10_000_000 }, 100_000, 60_000).action).toBe("reuse");
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npx vitest run sim/session-pool.test.ts` → FAIL (module
  not found).

- [ ] **Step 3: Implement `sim/session-pool.ts`**
  - Types: `interface PooledSession { access_token: string; refresh_token: string; expiresAt: number }`.
  - `deriveExpiresAt(nowMs, expiresInSec) => nowMs + expiresInSec*1000`.
  - `isExpired(s, nowMs, skewMs) => s.expiresAt - skewMs <= nowMs`.
  - `chooseRefreshOrMint(existing, nowMs, skewMs)` → `{action:"mint"|"refresh"|"reuse"}`.
  - `refreshSession(url, anonKey, refreshToken, retry?)`: POST
    `${url}/auth/v1/token?grant_type=refresh_token` with header `apikey: anonKey` + body
    `{refresh_token}`, wrapped in the existing `fetchWithRetry` (429/503). Returns a new
    `{access_token, refresh_token, expires_in}`; caller derives `expiresAt`.
  - `SessionPool` class: constructor `(filePath, {url, anonKey, serviceKey, skewMs=60_000})`;
    `load()`/`save()` (JSON file; `save` writes atomically; tolerate a missing file);
    `async getToken(email, nowMs)` → applies `chooseRefreshOrMint`, calling `mintBotSession`
    (from `session.ts`) or `refreshSession`, persisting the result; returns the access_token.
  - Never log a token.

- [ ] **Step 4: Run tests** — `npx vitest run sim/session-pool.test.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(sim): cross-tick session pool (refresh over re-mint)`.

## Task 2: Wire the pool into makeBotFor + gitignore

**Files:** Modify `sim/run.ts` (`makeBotFor`, `run.ts:80`), `.gitignore`

- [ ] **Step 1:** Add `sim/.session-pool.json` to `.gitignore`; commit that alone first.
- [ ] **Step 2:** In `makeBotFor`, replace the per-tick `mintBotSession` + `Map` cache with a
  `SessionPool` instance (path `sim/.session-pool.json`, url/anonKey/serviceKey from `process.env`).
  `botFor(userId)` → look up email → `pool.getToken(email, Date.now())` → `botClient(token)` (still
  cache the *client* per tick in a `Map`). Keep the "not in cohort" throw.
- [ ] **Step 3:** `npm run typecheck && npm run build` → green.
- [ ] **Step 4: Manual reuse check (documented, run at execution):** two `dry-run`s can't exercise it
  (no network); the real proof is a live re-tick showing 0 fresh mints — deferred to the first live
  run in the runbook (Task 8). Add a code comment pointing there.
- [ ] **Step 5: Commit** — `feat(sim): reuse pooled sessions across ticks in makeBotFor`.

## Task 3: seed + load-snapshot RPCs (migration)

**Files:** Create `supabase/migrations/20260724170000_sim_load_seed_rpcs.sql`
**Review gate:** data-exposure-reviewer on this migration BEFORE applying to prod.

- [ ] **Step 1: Write the migration.**
  - `seed_synthetic_cohort(p_n int, p_cohort text, p_creator_split numeric default 0.65)`
    RETURNS jsonb, `language plpgsql security definer set search_path = public`, **service_role
    only** (`revoke ... from public, anon, authenticated; grant ... to service_role`).
    - Loops `p_n` times; for each, `insert into auth.users (id, email, ..., raw_user_meta_data)`
      with a deterministic synthetic email `botseed_<cohort>_<i>@synthetic.dragoncandy.test`,
      `email_confirmed_at = now()`, and `raw_user_meta_data = jsonb_build_object('role', <creator|
      business_client by split>, 'full_name', ...)`. Set all NOT-NULL `auth.users` columns
      (`instance_id`, `aud='authenticated'`, `role='authenticated'`, `encrypted_password=''` or a
      dummy, timestamps).
    - Rely on the AFTER-INSERT `handle_new_user` to create `profiles` + role profile +
      `synthetic_users` (email matches `%@synthetic.dragoncandy.test`). The RPC does **not** re-insert
      those (avoids the unique-violation the spec-review flagged); if any belt-and-suspenders insert
      is added, it MUST be `on conflict do nothing`.
    - Idempotent on re-run: `insert into auth.users ... on conflict (id) do nothing` and skip existing
      emails. Return `{seeded, skipped}`.
    - Also `update profiles set email_verified = true where id = <seeded ids>` (bots need it; depth
      bots never log in but keep it consistent).
  - `capture_sim_load_snapshot(p_run_label text, p_error_rate numeric default null, p_notes jsonb
    default '{}')` RETURNS uuid, service_role only. Inserts into `sim_load_snapshots`:
    - `active_connections = (select count(*) from pg_stat_activity where state = 'active')`,
    - `max_connections = current_setting('max_connections')::int`,
    - `reserved_headroom = current_setting('superuser_reserved_connections')::int`,
    - `avg_query_ms = (select round(mean_exec_time::numeric, 2) from pg_stat_statements order by calls
      desc limit 1)` guarded so it is null if `pg_stat_statements` is absent (wrap in a
      `to_regclass('pg_stat_statements') is not null` check or exception block),
    - `error_rate = p_error_rate`, `notes = p_notes`, `run_label = p_run_label`.
- [ ] **Step 2:** data-exposure-reviewer pass on the migration; fix findings; re-run until PASS.
- [ ] **Step 3:** Apply to prod via `apply_migration` (MCP). Verify with a rollback-wrapped test call
  in `execute_sql`: seed p_n=2 in a transaction, assert 2 `synthetic_users` rows + FK-valid profiles,
  then ROLLBACK. Confirm `capture_sim_load_snapshot('probe')` inserts one row (then delete it).
- [ ] **Step 4: Commit** — `feat(db): seed_synthetic_cohort + capture_sim_load_snapshot RPCs`.

## Task 4: seed.ts + `bulk-seed` subcommand

**Files:** Create `sim/seed.ts`, `sim/seed.test.ts`; Modify `sim/run.ts` (add `bulk-seed`)

- [ ] **Step 1: Failing test** — `planSeed(n, {creators}, activeMax)` (pure) returns
  `{depthCount, activeCount}` where `activeCount = min(activeMax, n)` and `depthCount = n - activeCount`
  (or depth is separate — decide: depth is the big pool, active is minted separately). Test the split
  math + that active ≤ activeMax.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** `cmdBulkSeed(args)`: boot-gate; call `svc.rpc('seed_synthetic_cohort',
  {p_n: depthCount, p_cohort, p_creator_split})` for the depth pool; then mint the active cohort
  (`activeCount`) via the existing `generateCohort` + `mintBot` loop (session-capable). Fail loud if
  the RPC returns fewer than requested or any active mint fails (mirror `cmdMint`'s incomplete-cohort
  throw). Print `{depth_seeded, active_minted}`.
- [ ] **Step 4:** Run tests → PASS; `npm run typecheck && npm run build`.
- [ ] **Step 5: Commit** — `feat(sim): bulk-seed subcommand (depth RPC + active mint)`.

## Task 5: Load driver + `load` subcommand

**Files:** Create `sim/load/driver.ts`, `sim/load/driver.test.ts`; Modify `sim/run.ts` (add `load`)

The driver reuses the session pool and fires a configurable concurrency of realistic read-heavy
hot-endpoint calls, ramped in steps to the saturation knee, sampling `capture_sim_load_snapshot` per
step. Concurrency control + ramp logic + knee detection are pure and tested; the actual requests are
thin.

- [ ] **Step 1: Failing tests** for the pure pieces:
  - `rampSteps(start, max, factor)` → the ascending step list (e.g. `[50,200,500,1000,1500]`).
  - `runPool(concurrency, total, worker)` → a bounded-concurrency runner that never exceeds
    `concurrency` in flight (assert via a counter) and runs all `total`.
  - `isKnee(step, prevStep, thresholds)` → true when error rate or p95 latency crosses the degradation
    threshold vs the previous step.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement `sim/load/driver.ts`.**
  - `HOT_ACTIONS`: a weighted list (~90% read) of `(client) => Promise<void>` against real DAU
    endpoints — campaign browse (`from('campaigns').select(...).eq('status','published')`), feed
    (`from('dragonshare_posts')...`), profile view, messages list, a sampled write (apply/message).
    Each drawn from the session pool (a random active bot).
  - `runLoad({rampSteps, holdMs, sampleEveryMs, runLabel})`: for each step, run `runPool` at that
    concurrency for `holdMs`, measuring latency + errors; call `capture_sim_load_snapshot` on the
    sample timer; stop at the knee. Classify errors: 429/503/throttle = expected saturation (record
    the rate, continue); anything else = **breakage**.
  - **Findings collection (do NOT abort on the first breakage — §4f):** accumulate every breakage as
    a signature `{endpoint, status, error, count, firstSeenConcurrency}` across the whole run (mirrors
    `runDay`'s per-action isolation — the point of a QA run is to surface ALL the bugs, not just the
    first). At the end, write `sim/.load-findings.json` (the per-step curve + the breakage signatures
    + the sample summary) and print a findings summary. Set `process.exitCode = 1` if any breakage
    occurred (CI stays red) — but only after the batch is collected + written.
  - `cmdLoad(args)`: boot-gate; read the active cohort; run `runLoad`; print the per-step curve +
    findings summary.
- [ ] **Step 4:** Add a test asserting breakages are **collected across steps** (a fake worker that
  errors on N calls yields N-in-signatures and a written findings artifact, run not aborted). Run
  tests → PASS; `npm run typecheck && npm run build`.
- [ ] **Step 5:** Add `sim/.load-findings.json` to `.gitignore` (run artifact, not source).
- [ ] **Step 6: Commit** — `feat(sim): concurrent ramped load driver + findings collection`.

## Task 6: Dashboard slice — load curve + cost

**Files:** Modify `src/pages/internal/InternalSimulation.tsx` + its hook (mobile + desktop viewports)

- [ ] **Step 1:** Add a React Query hook reading the latest `sim_load_snapshots` rows (internal-gated
  select already exists) and the synthetic cost (`get_simulation_stats.synthetic_ai_spend_mtd_usd`,
  already present).
- [ ] **Step 2:** Render a per-tier/step table (concurrency, active connections vs max, avg query ms,
  error rate) + the synthetic cost figure. Use the light-app kit primitives? No — `/internal` is
  **dark**; follow the existing `InternalSimulation.tsx` dark ops-deck styling. Handle loading/error
  states.
- [ ] **Step 3:** `npm run build`; verify no `any`, error handling on the query.
- [ ] **Step 4: Commit** — `feat(internal): simulation dashboard — load curve + synthetic cost`.

## Task 7: Workflow dispatch inputs

**Files:** Modify `.github/workflows/synthetic-weight.yml`

- [ ] **Step 1:** Add `bulk-seed` and `load` to the `command` choice `options`. Keep `SIM_COMMAND`
  env-var passing (never interpolate inputs into the run script). Leave the daily schedule = `tick`.
- [ ] **Step 2:** Commit — `chore(ci): allow bulk-seed/load via workflow_dispatch`.

## Task 8: Tier-ramp runbook

**Files:** Create `docs/runbooks/synthetic-load-tier-ramp.md`

- [ ] **Step 1:** Write the founder-gated procedure: pin a low-traffic slot off the 14:00 cron; run
  `load` at the current tier; record knee + p95 + connection ceiling + the tier's live $/mo; upgrade
  prod compute one step (note the brief restart); re-run; repeat MICRO→…→LARGE until it holds target.
  Include: the first-live-run **session-reuse verification** (re-tick shows 0 fresh mints); the
  single-egress-IP caveat; how to read `sim_load_snapshots`; and the purge-after step
  (`purge_synthetic_data()` → assert zero residue + `row_counts_real == row_counts`).
- [ ] **Step 2:** Commit — `docs(runbook): synthetic-weight load tier-ramp`.

## Task 9: Load Findings report — template + synthesis procedure

**Files:** Create `docs/superpowers/load-findings/TEMPLATE.md`; extend `docs/runbooks/synthetic-load-tier-ramp.md`

The actionable "what to fix before 50K DAUs" deliverable (spec §4f). Mostly a documented synthesis
procedure the operator runs after each ramp; no heavy code beyond the harness artifact from Task 5.

- [ ] **Step 1:** Write `docs/superpowers/load-findings/TEMPLATE.md` with three categorized sections —
  **Bugs** (harness breakage signatures from `sim/.load-findings.json`), **Bottlenecks** (slowest +
  most-frequent `pg_stat_statements` queries; saturation concurrency + connection ceiling from
  `sim_load_snapshots`; `get_advisors` missing-index/unindexed-FK/RLS-perf findings), **Improvements**
  (tier recommendation from the cost/perf curve; caching/query-rewrite candidates; capacity knobs like
  the connection pooler / `max_connections`) — each finding with severity + a one-line fix hypothesis.
- [ ] **Step 2:** Add a "Findings synthesis" section to the runbook: after a ramp, gather the five
  sources — `sim/.load-findings.json`, `pg_stat_statements` (top by `total_exec_time` and by `calls`),
  Supabase `get_logs` (edge-fn + Postgres errors in the run window), `get_advisors`, and
  `sim_load_snapshots` — and fill the template into `docs/superpowers/load-findings/<date>.md`.
  Note: `pg_stat_statements` should be `pg_stat_statements_reset()` just before a ramp so its numbers
  reflect the run window. Optionally file the top findings to `/internal/findings` (AIOS).
- [ ] **Step 3:** Commit — `docs: load-findings report template + synthesis procedure`.

## Task 10: Final review + branch finish

- [ ] **Step 1:** Full `npm run typecheck && npm run build && npm run test` — green (trust the
  "N passed, 0 failed" line, not the exit code; nested-worktree e2e files fail pre-existing — see
  memory `project_vitest_preexisting_file_failures`).
- [ ] **Step 2:** Dispatch a final code-reviewer over the whole Phase-A diff.
- [ ] **Step 3:** **Codex second review** — `codex review --base main --title "synthetic weight
  Phase A"`; fix findings; re-run until clean.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch (incl. the `knowledge-sync` step:
  SHIPPED_LOG prepend, wiki ingest, §5 index line, Donny RAG sync after merge). Open the PR.

---

## Verification (end-to-end, after merge, founder-gated live run)

Follow the runbook: `bulk-seed` (small first, e.g. depth 200 + active 25) → confirm segregation
(every `aios_*` + `platform_weight.*_real` byte-identical; `get_simulation_stats` shows synthetic) →
`load` ramp → `sim_load_snapshots` shows the curve; observability stays responsive (knee, not outage)
→ scale seed/tier up per the runbook → capture the cost-per-tier curve → **synthesize the Load
Findings Report** (bugs from `sim/.load-findings.json` + bottlenecks from `pg_stat_statements` /
advisors / snapshots + tier & optimization improvements) into
`docs/superpowers/load-findings/<date>.md` — the "what to fix before 50K DAUs" deliverable → `purge`
to zero residue. Money/AI legs are Phase B — not exercised here.

## Notes / gotchas (from memory + spec)

- **MCP `execute_sql` returns only the LAST statement's result** — one statement per call; prove seed
  inserts with a rollback-wrapped transaction using a real FK id, not a types.ts read.
- **Migration timestamp** `20260724170000` — check no other concurrent worktree branch reuses it;
  renumber after any merge that lands an earlier same-day migration (`git grep` bare 14-digit names).
- **Shell cwd is the main checkout** — write to the explicit worktree path; run `npm`/`tsx` with the
  worktree cwd.
- **Deploy ordering:** apply the Task 3 migration to prod BEFORE merging Task 4/5 harness code.
- Never weaken the kill switch or the test-Stripe boot gate; the session-pool file is secret material.
