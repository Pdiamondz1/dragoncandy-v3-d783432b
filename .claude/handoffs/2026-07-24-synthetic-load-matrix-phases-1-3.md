# Handoff: Synthetic Load Runner Matrix — Phases 1-2 shipped, Phase 3 migrations committed

## Session Metadata
- Date: 2026-07-24
- Project: C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\synthetic-weight-engine
- Branch: feat/synthetic-load-runner-matrix
- Continues from: `.claude/handoffs/2026-07-24-160538-synthetic-load-runner-matrix.md` (spec+plan resume point)
- Memories: [[project_synthetic_load_matrix_progress]] (read FIRST), [[project_synthetic_weight_task8_teardown_fix]], [[project_synthetic_weight_phase_a_load_run]]

## What shipped this session (all committed on the branch, NOT pushed)

**Plan review (2 passes → Approved):** folded the media-egress proxy (spec §3a/§5, was missing) + fixed the
matrix-summary aggregation grain (latest-captured_at per shard, not max-concurrency) into the plan.

**Phase 1 (TDD, committed):**
- `sliceActiveCohort` + `readActiveLoadCohort` (`sim/mint.ts`) — botla-only, ORDER BY email, disjoint 25-bot
  shard slice; excludes live bot0##; []-guards out-of-range shard.
- Refresh-aware `makeBotFor` (`sim/run.ts`, now exported) — consults the token-getter every call, rebuilds the
  bot client only on token rotation (soak-safe); getter injectable (default = real SessionPool).
- Matrix flags `--shard/--shards/--concurrency/--soak-ms` (Args + parseArgs, safe defaults).

**Phase 2 (TDD, committed):**
- `runLoad` optional `isEnabled?()` kill-switch re-check + `stoppedByKillSwitch` (`sim/load/driver.ts`) —
  graceful drain at each snapshot sample; default always-enabled (single-runner byte-unchanged).
- `cmdLoad` matrix mode: pure `planLoad(args)` + injectable `CmdLoadDeps` (all default to real). Matrix branch
  uses `readActiveLoadCohort`, a single fixed-C soak ramp `[concurrency]` held `soakMs`, `isEnabled` reading
  SYNTHETIC_BOTS_ENABLED, and stamps `notes.shard` on every snapshot. Updated failloud mocks for the 2 new
  ./mint + ./env exports.

**Phase 3 (migrations written + committed, NOT applied — founder-gated):**
- `supabase/migrations/20260724181500_sim_content_seed.sql` — `seed_synthetic_content(campaigns,posts,split)`.
- `supabase/migrations/20260724182000_purge_synthetic_load_cohort.sql` — scoped teardown RPC + push_notifications
  fold into `purge_synthetic_data()`.
- Designed against **fully verified prod schema** (see the migration header comments + [[project_synthetic_load_matrix_progress]]).

**Verification state:** `node_modules/.bin/vitest run sim/` = **135 passed**; `tsc -p sim/tsconfig.json` clean;
eslint clean on changed files. Migrations NOT yet exercised on prod (needs apply = founder gate).

## Immediate next steps (in order)

1. **Task 3.2 — `bulk-seed --with-content`** (`sim/run.ts`, TDD): add `withContent` bool + `--campaigns`/`--posts`
   flags to Args/parseArgs; in `cmdBulkSeed`, after the depth+active seed, when `withContent` call
   `svc.rpc("seed_synthetic_content", {p_campaigns, p_posts, p_creator_split})` (fail-loud like the existing
   seed). Consider the same `CmdLoadDeps`-style DI used for cmdLoad if you want a no-DB test; else test the flag
   parsing + extract a tiny helper.
2. **Phase 4** — `sim/load/actions-mix.ts` (~90:10 read:write mix) + widen `HotAction.run` to
   `Promise<{bytes?:number}|void>`; media GET action returns `{bytes}`; driver tallies `notes.media_requests`
   (count non-void-object returns — an `isMedia` flag, NOT bytes>0) + `notes.media_bytes`. Wire driver default.
   bot→bot `create-notification` (synthetic recipient); donny-footprint = direct donny_conversations/messages.
3. **Phase 5** — `get_sim_load_matrix_summary(p_run_label)` RPC (per shard = latest-captured_at row; SUM client
   metrics + media_*, MAX p95, MAX db-side, latest platform_weight.storage_bytes); `.github/workflows/synthetic-load-matrix.yml`
   (setup→dynamic matrix, `max_shards` cap, env-var-only injection); `InternalSimulation.tsx` summed curve;
   runbook matrix section (seed `25×max_shards`; teardown = `purge_synthetic_load_cohort()`, NOT the old raw delete).
4. **Phase 6** — realtime sub-leg (HARD split-point: extract to its own spec+plan if it outgrows 1-5).
5. **Phase 7 gates** — vitest sim/ + `npm run build`/`typecheck`/`test`; **edge-function-reviewer +
   data-exposure-reviewer** on the 2 migrations + workflow; **Codex** `codex review --base main`; **careful**
   gate → **apply BOTH migrations to prod** (rollback-wrapped verify first: seed a botseed probe cohort → seed
   content → assert public-free + is_synthetic + no crew rows → `purge_synthetic_load_cohort()` → residuals 0 +
   live 25 intact); then the **founder-gated 2-shard live smoke**; then knowledge-sync.

## Gotchas / decisions carried

- **Founder-gated boundary:** prod `apply_migration` (both migrations) + any live ramp. Nothing applied yet.
- **Teardown scoping is safety-critical:** the matrix uses `purge_synthetic_load_cohort()` (botla%/botseed_%
  only) — NEVER `purge_synthetic_data()` (kills the live 25). Prod currently has exactly 25 bot0## users, 0
  botla/botseed (clean).
- **No creator lat/lng** — seed `creator_profiles.location` (text); near-me geocodes client-side.
- **dragonshare_posts needs `target_org_id`** → the seed creates ONE synthetic org (owned by a synthetic load
  business bot); it does NOT cascade on user delete → the teardown deletes it explicitly.
- **Migration timestamps** (18:15/18:20) must be collision-checked vs concurrent worktrees before merge
  (`git grep` the 14-digit prefix — [[project_migration_timestamp_collision_concurrent_worktrees]]).
- MCP `execute_sql` returns only the LAST statement's result; one statement per call; rollback-wrap prod probes.

## Environment
- Supabase MCP (prod zocahiffooqdybdhguqv), `gh` CLI, the `synthetic-weight` GH Environment (SIM_* secrets).
- Working directory is the `synthetic-weight-engine` worktree; run vitest/tsc/eslint from there
  (`node_modules/.bin/...`). Note: the session's Bash cwd may need `cd` into this worktree.
