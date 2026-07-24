# Synthetic Load — Multi-IP Runner Matrix (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fan the synthetic load driver across N GitHub Actions runners (distinct egress IPs), summing concurrency to push the prod DB toward the ~1,000-concurrent 50K-DAU band and hold it as a bounded soak — with a realistic content/video/avatar load model and correct teardown.

**Architecture:** A dynamic GH Actions matrix (`setup`→`load`) runs the existing `sim/` driver per shard at a fixed egress-safe concurrency; the ramp knob is shard count. Each shard drives a deterministic, disjoint `botla…` slice from its own IP, refreshes tokens mid-soak, and writes shard-labeled `sim_load_snapshots`; a summary RPC aggregates the run. The driver stays vehicle-agnostic (nothing GitHub-specific in `sim/`). Realtime (WebSocket) load is a hard split-point phase.

**Tech Stack:** Node/tsx (`sim/`), Vitest, Supabase Postgres (SECURITY DEFINER RPCs, service-role), GitHub Actions, React (`InternalSimulation.tsx`).

**Spec:** `docs/superpowers/specs/2026-07-24-synthetic-load-runner-matrix-design.md`. **Branch/worktree:** `feat/synthetic-load-runner-matrix` in `.claude/worktrees/synthetic-weight-engine` (already created).

---

## Scope check

One plan, six buildable phases + a gates phase. **Phase 6 (realtime sub-leg) is a hard split-point:** if, during planning execution, its work exceeds Phases 1–5 combined, STOP and spin it into its own spec+plan (`…-runner-matrix-realtime.md`) rather than bloating this one. Phases 1–5 already produce a working, testable REST/content/media matrix on their own.

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `sim/mint.ts` | Modify | add `readActiveLoadCohort(admin, shard, shards)` — `botla…`-only, `ORDER BY email`, disjoint 25-bot slice |
| `sim/run.ts` | Modify | refresh-aware `makeBotFor`; new flags `--shard/--shards/--concurrency/--soak-ms`; `--with-content` on bulk-seed; matrix/soak wiring in `cmdLoad` |
| `sim/load/driver.ts` | Modify | `isEnabled()` kill-switch re-check in `runLoad`; behavior-mix `HOT_ACTIONS`; **media-egress bytes/requests tally into `notes`**; (Phase 6) realtime sub-leg |
| `sim/load/actions-mix.ts` | Create | the realistic DAU `HotAction[]` (feed read + **real media GET/HEAD egress fetch**, geo near-me, mobile/desktop, public-free content writes, notification, Donny-footprint) |
| `supabase/migrations/<ts>_sim_load_matrix_rpcs.sql` | Create | `get_sim_load_matrix_summary(p_run_label)` service-role RPC |
| `supabase/migrations/<ts>_sim_content_seed.sql` | Create | `seed_synthetic_content(...)` — public-free campaigns + video posts + file_uploads + avatars/geo |
| `.github/workflows/synthetic-load-matrix.yml` | Create | `setup`→dynamic-matrix `load` job (`max_shards` cap) |
| `src/pages/internal/InternalSimulation.tsx` | Modify | render the summed matrix curve |
| `docs/runbooks/synthetic-load-tier-ramp.md` | Modify | matrix section (dispatch, shard-count ramp, aggregation read, larger-cohort teardown) |
| `sim/*.test.ts` (co-located) | Create/Modify | unit tests per task (mirror existing fake-auth-server + pure-function suite) |

**Reuse unchanged:** safety spine, `seed_synthetic_cohort`, `capture_sim_load_snapshot`, `session-pool.ts`, `env.ts`, `personas.ts`, `synthetic-weight.yml`.

**Migration numbering:** the three `<ts>_*.sql` files must be timestamped AFTER the latest existing migration (`20260724170000`) and checked for a concurrent-worktree collision + disjoint objects before merge (per [[project_migration_timestamp_collision_concurrent_worktrees]]) — `git grep` the bare 14-digit prefix across worktrees (the Grep tool hides bare digit runs), and renumber ours after any already-merged sibling.

---

## Phase 1 — Deterministic shard slice + refresh-aware sessions + flags

### Task 1.1: `readActiveLoadCohort` — deterministic, `botla…`-only, disjoint slice

**Files:** Modify `sim/mint.ts`; Test `sim/mint.test.ts` (extend).

- [ ] **Step 1: Write the failing test.** In `sim/mint.test.ts`, test the pure slicing over a mocked `admin` whose `.from().select().like().order()` resolves an UNORDERED, MIXED (`bot0##` + `botla…`) row set. Assert: (a) `bot0##` rows are excluded; (b) shard 0 and shard 1 return disjoint 25-bot slices; (c) ordering is applied so the same input → same slice regardless of returned row order.

```ts
// pure slicer extracted so it is testable without a client:
import { sliceActiveCohort } from "./mint";
test("sliceActiveCohort: botla-only, ordered, disjoint 25-bot slices", () => {
  const rows = shuffle([
    ...range(50).map((i) => ({ id: `u${i}`, email: `botla1_${i + 1}@synthetic.dragoncandy.test`, role: "content_creator" })),
    ...range(25).map((i) => ({ id: `live${i}`, email: `bot0${i + 1}@synthetic.dragoncandy.test`, role: "content_creator" })),
  ]);
  const s0 = sliceActiveCohort(rows, 0, 2);
  const s1 = sliceActiveCohort(rows, 1, 2);
  expect(s0).toHaveLength(25);
  expect(s1).toHaveLength(25);
  expect(s0.every((b) => b.email.startsWith("botla"))).toBe(true);   // no bot0##
  expect(intersect(ids(s0), ids(s1))).toHaveLength(0);               // disjoint
  expect(sliceActiveCohort(shuffle(rows), 0, 2)).toEqual(s0);        // order-independent
});
```

- [ ] **Step 2: Run test — verify it fails** (`sliceActiveCohort` not exported).
  Run: `cd .claude/worktrees/synthetic-weight-engine && node_modules/.bin/vitest run sim/mint.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `sim/mint.ts` add a PURE slicer + the DB wrapper. The slicer filters `botla%`, sorts by email (lexicographic determinism is sufficient — numeric order is not required, only stable disjoint slices), and returns the fixed 25-bot window `[shard*25, shard*25+25)`.

```ts
const ACTIVE_COHORT_PREFIX = "botla";
const PER_SHARD = 25;

/** Pure: botla-only, ORDER BY email, this shard's disjoint 25-bot window. */
export function sliceActiveCohort(rows: { id: string; email: string; role: string }[], shard: number, shards: number): BotRef[] {
  const ordered = rows
    .filter((r) => (r.email ?? "").startsWith(ACTIVE_COHORT_PREFIX))
    .sort((a, b) => a.email.localeCompare(b.email));
  const start = shard * PER_SHARD;
  return ordered.slice(start, start + PER_SHARD).map((r) => ({
    userId: r.id, email: r.email, role: (r.role as Role) ?? "content_creator",
    personaKey: null as PersonaKey | null, cohort: null as string | null,  // BotRef requires cohort (types.ts:12)
  }));
}

/** DB read for a matrix shard: fetch the active (botla) cohort and return THIS shard's slice. */
export async function readActiveLoadCohort(admin: SupabaseClient, shard: number, shards: number): Promise<BotRef[]> {
  const { data, error } = await admin
    .from("profiles").select("id, email, role")
    .like("email", `${ACTIVE_COHORT_PREFIX}%${SYNTHETIC_DOMAIN}`).order("email", { ascending: true });
  if (error) throw new Error(`readActiveLoadCohort: ${error.message}`);
  return sliceActiveCohort((data ?? []) as { id: string; email: string; role: string }[], shard, shards);
}
```

- [ ] **Step 4: Run test — verify PASS.** Same vitest command. Expected: PASS.
- [ ] **Step 5: Commit.** `git add sim/mint.ts sim/mint.test.ts && git commit -m "feat(sim): readActiveLoadCohort — deterministic botla-only shard slice"`

### Task 1.2: refresh-aware `makeBotFor`

**Files:** Modify `sim/run.ts`; Test `sim/run.test.ts` (extend).

- [ ] **Step 1: Failing test.** Assert that when the injected pool returns a ROTATED token for the same userId (simulating a mid-soak refresh), `makeBotFor`'s returned factory yields a NEW client bound to the new token, and yields the SAME client while the token is unchanged (0 rebuilds). (Refactor `makeBotFor` to accept an injectable token-getter so the test needs no network — mirror `SessionPool`'s injection style.)

- [ ] **Step 2: Run — FAIL** (current `makeBotFor` caches the client forever).
- [ ] **Step 3: Implement.** Replace the per-userId client cache with a `{token, client}` cache; call `pool.getToken(email, userId, Date.now())` every invocation (cheap `reuse` path = no network) and rebuild the client only when the token changed. **Keep the token-getter INJECTABLE with a default to the real `SessionPool`** so both existing call sites — `cmdTick` (`run.ts:254`) and `cmdLoad` (`run.ts:304`), which call `makeBotFor(bots)` — compile unchanged (the test injects a fake getter; production passes none):

```ts
const cache = new Map<string, { token: string; client: SupabaseClient }>();
return async (userId: string): Promise<SupabaseClient> => {
  const email = emailById.get(userId);
  if (!email) throw new Error(`no session: ${userId} is not in the cohort`);
  const token = await pool.getToken(email, userId, Date.now());
  const hit = cache.get(userId);
  if (hit && hit.token === token) return hit.client;   // still-fresh token → reuse client
  const client = botClient(token);                     // token rotated (refresh) → rebuild
  cache.set(userId, { token, client });
  return client;
};
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `-m "fix(sim): makeBotFor refresh-aware — rebuild client on token rotation (soak-safe)"`

### Task 1.3: matrix flags

**Files:** Modify `sim/run.ts` (`Args`, `parseArgs`, usage string); Test `sim/run.test.ts`.

- [ ] **Step 1: Failing test** — `parseArgs(["load","--shard","2","--shards","5","--concurrency","200","--soak-ms","1800000"])` returns `{shard:2, shards:5, concurrency:200, soakMs:1_800_000}` with sane defaults (`shard:0, shards:1, concurrency:0, soakMs:0`) when absent.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — add `shard/shards/concurrency/soakMs` to `Args`; parse via the existing `safeInt`; extend the usage string; keep all existing defaults.
- [ ] **Step 4: Run — PASS.**  **Step 5: Commit** `-m "feat(sim): matrix flags --shard/--shards/--concurrency/--soak-ms"`

---

## Phase 2 — Soak hold + kill-switch re-check + cmdLoad matrix wiring

### Task 2.1: `isEnabled()` re-check in `runLoad`

**Files:** Modify `sim/load/driver.ts` (`RunLoadDeps`, `LoadResult`, the step loop); Test `sim/load/driver.test.ts`.

- [ ] **Step 1: Failing test** — inject `isEnabled` returning `false` after the first snapshot sample; assert `runLoad` stops early and `result.stoppedByKillSwitch === true` (findings still written, no throw).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — add optional `isEnabled?: () => Promise<boolean>` to `RunLoadDeps` and `stoppedByKillSwitch: boolean` to `LoadResult`; inside each step's snapshot-sample tick, if `isEnabled` resolves `false`, break the ramp gracefully (record the flag; still fold breakages + `writeFindings`). Default `isEnabled = async () => true`.
- [ ] **Step 4: Run — PASS.**  **Step 5: Commit** `-m "feat(sim): runLoad honors an injected isEnabled() kill-switch re-check"`

### Task 2.2: `cmdLoad` matrix/soak mode

**Files:** Modify `sim/run.ts` (`cmdLoad`); Test `sim/run.test.ts`.

- [ ] **Step 1: Failing test** — with `--shards>1`, `cmdLoad` uses `readActiveLoadCohort(shard,shards)` (not `readSessionCapableBots`), builds a single-step ramp `[concurrency]` held for `soakMs`, injects an `isEnabled()` reading `SYNTHETIC_BOTS_ENABLED` via the service client, and stamps `notes.shard` + `notes.concurrency` on every snapshot. (Inject the reads for the test.)
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Branch in `cmdLoad`: when `args.shards > 1`, `activeBots = await readActiveLoadCohort(svc, args.shard, args.shards)` and `ramp = [args.concurrency]`, `holdMs = args.soakMs`; pass `isEnabled: () => readKillSwitch(svc as unknown as MinimalSupabaseClient).then(Boolean)` (reuse `env.ts`'s `readKillSwitch`; **add `readKillSwitch` + `MinimalSupabaseClient` to the `./env` import**, and use the `as unknown as MinimalSupabaseClient` cast that `bootGate` (`run.ts:59-66`) already uses to dodge the TS "excessively deep" error) and thread `args.shard` + `args.concurrency` into the `captureSnapshot` `notes`. Single-runner mode (`shards<=1`) is unchanged.
- [ ] **Step 4: Run — PASS.**  **Step 5: Commit** `-m "feat(sim): cmdLoad matrix mode — shard slice + fixed-C soak + kill-switch"`

---

## Phase 3 — Content + media seed (public-free, teardown-safe)

### Task 3.1: `seed_synthetic_content` migration

**Files:** Create `supabase/migrations/<ts>_sim_content_seed.sql`.

- [ ] **Step 1: Verify columns FIRST** (do not fabricate). Via MCP `list_tables` / `docs/DATABASE_SCHEMA.md`, confirm the exact columns for: `campaigns` (owner id col, `title`, `status`, `group_id`, `fixed_price`, and how synthetic-ness is derived — expected via `is_synthetic_campaign(owner)`, NOT a stamp column), `dragonshare_posts` (`creator_id`, `content_file_path`, `platform`, `status`), `file_uploads` (owner + path), `profiles` avatar column, and `creator_profiles` lat/long columns. Record findings as a comment block atop the migration.
- [ ] **Step 2: Write the RPC** `seed_synthetic_content(p_campaigns int, p_posts int, p_creator_split numeric default 0.65)` (service-role, SECURITY DEFINER, `search_path=public`, revoked from anon/authenticated). It: (a) sets `avatar` + geo (varied lat/long) on a sample of existing synthetic bots (`botseed_%`/`botla%`); (b) inserts `p_campaigns` **public-free** campaigns (`group_id IS NULL`, `fixed_price=0`, owner = a synthetic **business** bot → synthetic by ownership, NO crew rows); (c) inserts `p_posts` `dragonshare_posts` owned by synthetic **creator** bots with `content_file_path` drawn from a small pool of public sample-video URLs, **`verified_by` pinned NULL** (its FK to `auth.users` is NO ACTION — a synthetic value would block teardown); (d) inserts matching `file_uploads`. Returns `jsonb {campaigns, posts, avatars, geo}`. Mirror `seed_synthetic_cohort`'s deterministic-id + `ON CONFLICT DO NOTHING` idempotency so re-runs skip.
- [ ] **Step 3: Verify on prod, rollback-wrapped** (MCP `execute_sql`, ONE statement per call — [[reference_mcp_execute_sql_last_result_only]]): `begin; select seed_synthetic_content(2,2,0.5); <assert public-free campaigns + posts + is_synthetic_campaign() true + NO creator_group_members/crew_activity rows>; rollback;`
- [ ] **Step 4: `apply_migration`** to prod (this is prod DDL — run the `careful` gate first).  **Step 5: Commit.**

### Task 3.2: `bulk-seed --with-content`

**Files:** Modify `sim/run.ts` (`cmdBulkSeed`, `Args`, `parseArgs`); Test `sim/run.test.ts`.

- [ ] **Step 1: Failing test** — `--with-content` makes `cmdBulkSeed` call `seed_synthetic_content` after the depth+active seed; absent, it does not. **Step 2: FAIL.**
- [ ] **Step 3: Implement** the flag + the extra RPC call (fail-loud on error, like the existing seed).  **Step 4: PASS.**  **Step 5: Commit.**

### Task 3.3: teardown leaf-delete for the NO-ACTION `push_notifications.actor_id` (safety-critical)

**Files:** Create `supabase/migrations/<ts>_purge_synthetic_notifications_leaf.sql`; Modify `docs/runbooks/synthetic-load-tier-ramp.md` §7.

> The notification leg (Phase 4) creates `push_notifications` rows with a synthetic `actor_id`; `actor_id → profiles` is a **NO-ACTION FK** that blocks the `auth.users→profiles` cascade — the exact class that rolled back a prod purge (fixed for crews in `20260724011000`). Both teardown paths must leaf-delete it FIRST.

- [ ] **Step 1** Migration: extend `purge_synthetic_data()` to `delete from push_notifications where is_synthetic(actor_id)` (or actor is a synthetic user) **before** the `auth.users` delete, and add its residual to the report — mirror `20260724011000`. Verify rollback-wrapped on prod (ONE statement per MCP call), then `apply_migration` (careful gate).
- [ ] **Step 2** Runbook: the raw matrix teardown gains `delete from push_notifications where is_synthetic(actor_id);` before the `botla%`/`botseed_%` `auth.users` deletes.  **Step 3** Commit.

---

## Phase 4 — Realistic DAU behavior mix + media-egress proxy

**Files:** Create `sim/load/actions-mix.ts`; Modify `sim/load/driver.ts` (default `HOT_ACTIONS` → import the mix; **media-egress tally**); Test `sim/load/actions-mix.test.ts`, `sim/load/driver.test.ts`.

### Task 4.1: the behavior mix

- [ ] **Step 1: Failing test** — `pickWeighted` over the mix yields ~90:10 read:write and includes each named action (DragonFeed feed read + a real **media GET/HEAD fetch** of a sampled public `content_file_path` (Task 4.2), campaign browse/search, geo near-me, profile view, mobile-feed vs desktop-grid variants, public-free content write, **bot→bot notification** (via `create-notification`, synthetic recipient), Donny-chat-footprint write). Assert the write actions create **public-free** campaigns (`group_id NULL`), never touch crew tables, and the notification recipient is always a *synthetic* bot (never a real user).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** the `HotAction[]` in `actions-mix.ts` (each `run(client)` hits a real hot endpoint / performs a public-free `is_synthetic` write via the caller's own JWT — RLS-real). Weights sum to a ~90:10 read:write split. The **notification action calls `create-notification` bot→bot** (a plain insert fires no notification — there is no trigger on those tables; recipient MUST be another synthetic bot so no real tester is spammed) — this creates `push_notifications` with a synthetic `actor_id`, cleaned by Task 3.3's teardown leaf-delete. The Donny-footprint action inserts `donny_conversations`/`donny_messages` rows directly — **no** `donny-*` edge call. Wire `driver.ts` to default to this mix.
- [ ] **Step 4: PASS.**  **Step 5: Commit** `-m "feat(sim): realistic DAU behavior mix (video/geo/mobile/content-write/notify/donny-footprint)"`

### Task 4.2: media-egress proxy (spec §3a/§5 — the Slice-1 observability dimension the DB-only view misses)

> Real CDN-egress **dollars** are Slice 2; the Slice-1 deliverable is the client-side **egress proxy** — request count + transferred bytes of real media GET/HEAD fetches. (`platform_weight.storage_bytes` *growth* is ~0 by design under the asset-reuse model (§3a — bots reference a small pool of existing public assets, not 50K distinct files), so the client-side egress tally — not storage growth — is the meaningful proxy; `storage_bytes` is still surfaced as a point reading in Task 5.1.)

- [ ] **Step 1: Failing test** (`driver.test.ts`) — a `HotAction` whose `run` resolves `{ bytes: N }` makes `runLoad` accumulate `notes.media_requests` (count of media calls) and `notes.media_bytes` (Σ bytes) into the sampled snapshot; a `void`-returning action contributes 0 to both.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — (a) widen `HotAction.run` to `Promise<{ bytes?: number } | void>` (fully additive — existing read actions return `void`); (b) the media action does a real `fetch(url, { method: "GET" })` of a sampled public content URL and returns `{ bytes }` from `Content-Length` (or the read body length); (c) `runOneTask` reads `res?.bytes ?? 0`; (d) add per-step `mediaRequests`/`mediaBytes` accumulators in `runLoad`, written into the snapshot `notes` alongside the existing keys. A media-fetch failure classifies as breakage/throttle exactly like a query error (the egress path is under test too).
- [ ] **Step 4: PASS.**  **Step 5: Commit** `-m "feat(sim): media-egress proxy — real media fetch + per-step bytes/requests tally"`

---

## Phase 5 — Matrix aggregation + workflow + dashboard + runbook

### Task 5.1: `get_sim_load_matrix_summary` RPC

**Files:** Create `supabase/migrations/<ts>_sim_load_matrix_rpcs.sql`; verify via MCP.

- [ ] **Step 1** Write the RPC (service-role, SECURITY DEFINER, revoked anon/authenticated). For `p_run_label`, per `notes->>'shard'` pick that shard's **fullest sample = the row with the latest `captured_at`** — NOT max-concurrency: in single-fixed-C soak mode every sample of a shard shares one `concurrency` value (so max-concurrency can't disambiguate), and `notes.count/ok/throttled/breakage` are **cumulative within the step** (`driver.ts` `seen = latencies.length`), so the latest `captured_at` row holds that shard's fullest running total. (`sim_load_snapshots.captured_at` exists — safety spine.) Then **sum** those shards' `concurrency`/`count`/`ok`/`breakage`/`throttled` + `(notes->>'media_requests')::bigint` + `(notes->>'media_bytes')::bigint`, and **max** `(notes->>'p95_ms')::numeric`; DB-side = `max(active_connections)`, `max(avg_query_ms)`, `max(max_connections)` across ALL rows of the label; plus `storage_bytes` = the latest `public.platform_weight.storage_bytes` point reading (spec §5 observability — ~0 growth by design, Task 4.2). Return one jsonb row `{shards, offered_concurrency, requests, ok, breakage, throttled, p95_ms, media_requests, media_bytes, storage_bytes, db_active_conn_peak, db_avg_query_ms_peak, max_connections}`.
- [ ] **Step 2** Verify on prod rollback-wrapped with two synthetic shard rows (ONE statement per MCP call). **Step 3** `apply_migration` (careful gate). **Step 4** Commit.

### Task 5.2: dynamic-matrix workflow

**Files:** Create `.github/workflows/synthetic-load-matrix.yml`.

- [ ] **Step 1** Write it: `workflow_dispatch` inputs `shards` (default `5`), `concurrency` (default `200`), `soak_ms` (default `1800000`), `run_label`. A `setup` job enforces a **`max_shards` cap** (e.g. 10 — fail loud if exceeded) and emits `outputs.matrix` = `fromJSON('[0,1,…,shards-1]')`. A `load` job `strategy.matrix.shard: ${{ fromJSON(needs.setup.outputs.matrix) }}`, `environment: synthetic-weight`, runs `node_modules/.bin/tsx sim/cli.ts load --shard "$SIM_SHARD" --shards "$SIM_SHARDS" --concurrency "$SIM_CONCURRENCY" --soak-ms "$SIM_SOAK_MS" --run-label "$SIM_RUN_LABEL"` with all inputs via **env vars only** (never string-interpolated — mirror `synthetic-weight.yml`). Upload `sim/.load-findings.json` as `findings-shard-${{ matrix.shard }}` (`actions/upload-artifact`).
- [ ] **Step 2** `npx tsx`/`actionlint` sanity (or `gh workflow view` after commit).  **Step 3** Commit. (Do NOT dispatch yet — gates first.)

### Task 5.3: dashboard summed curve

**Files:** Modify `src/pages/internal/InternalSimulation.tsx`.

- [ ] **Step 1** Add a React Query hook calling `get_sim_load_matrix_summary` for the latest `matrix-*` label; render the summed offered-concurrency vs DB-peak curve beside the existing single-runner view, **plus the media-egress proxy (`media_requests`/`media_bytes`) and the `storage_bytes` reading** (spec §5 — the video-platform cost dimension). Light theme / existing `/internal` dark shell conventions.  **Step 2** `npm run build`.  **Step 3** Commit.

### Task 5.4: runbook matrix section

**Files:** Modify `docs/runbooks/synthetic-load-tier-ramp.md`.

- [ ] **Step 1** Add: `bulk-seed --with-content` seeding at **`25×max_shards`** active (so any shard count up to the workflow cap has a non-empty slice — **raising shard count later requires re-seeding**; a bigger dispatch over a smaller seed drives empty shard slices, per spec §4); the `gh workflow run synthetic-load-matrix.yml -f shards=… -f concurrency=…` dispatch; stepping shard count; the `get_sim_load_matrix_summary` read; and the larger-cohort teardown (**synthetic `push_notifications` leaf-delete first**, then the same `botla%`/`botseed_%` prefix delete — **never** `purge_synthetic_data()`; Task 3.3).  **Step 2** Commit.

---

## Phase 6 — Realtime (WebSocket) sub-leg  ⟨HARD SPLIT-POINT⟩

> If this phase's estimate exceeds Phases 1–5 combined, STOP and extract it to its own spec+plan.

**Files:** Create `sim/load/realtime-leg.ts`; Modify `sim/run.ts` (`cmdLoad` opt-in via a `--realtime` flag), `sim/load/driver.ts` (record `notes.realtime_connections`); Test `sim/load/realtime-leg.test.ts`.

- [ ] **Step 1: Failing test** — the leg opens/holds P presence+conversation channels for the soak duration and exchanges messages, reporting a `realtimeConnections` count; a channel error is classified (throttle vs breakage) like the REST leg. Inject a fake realtime client.
- [ ] **Step 2: FAIL.**  **Step 3: Implement** using `supabase-js` realtime channels over each shard's bot sessions; hold + heartbeat + sampled message send; surface concurrency into `notes.realtime_connections`.  **Step 4: PASS.**  **Step 5: Commit.**
- [ ] **Step 6: Verify the Realtime plan quota** (docs) and record it in the runbook — the WebSocket ceiling is separate from `max_connections`.

---

## Phase 7 — Gates (before any full prod ramp)

- [ ] **Unit + build:** `node_modules/.bin/vitest run sim/` (all new tests green), then `npm run build`, `npm run typecheck`, `npm run test` (trust "N passed, 0 failed" per [[project_vitest_preexisting_file_failures]]).
- [ ] **Reviewers:** dispatch **`edge-function-reviewer`** + **`data-exposure-reviewer`** on both new migrations (`seed_synthetic_content`, `get_sim_load_matrix_summary`) and the new workflow. Resolve every ISSUE.
- [ ] **Codex second review:** `codex review --base main --title "synthetic load runner matrix"` from the worktree; fix + re-run until clean.
- [ ] **`careful` gate + 2-shard live smoke** (founder-gated, off the 14:00 cron): `bulk-seed --with-content --active 50` (2×25), then `gh workflow run synthetic-load-matrix.yml -f shards=2 -f concurrency=50`. Assert: distinct egress IPs, summed concurrency in `get_sim_load_matrix_summary`, **no cross-shard 429**, byte-identical real-KPI segregation, and clean teardown (**leaf-delete synthetic `push_notifications` first**, then `botla%`/`botseed_%` delete → residue 0, live 25 survive). Only after this passes is a full shard-count ramp authorized.
- [ ] **Knowledge sync** on branch finish (`knowledge-sync` skill): wiki source + SHIPPED_LOG + core-doc refresh + Donny RAG.

---

## Plan review + execution

After this plan is written, dispatch a `plan-document-reviewer` (spec + plan paths, not session history); fix + re-dispatch until approved (max 3). Then offer the execution choice (subagent-driven vs inline).
