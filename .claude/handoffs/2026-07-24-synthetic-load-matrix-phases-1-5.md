# Handoff: Synthetic Load Runner Matrix — Phases 1–5 complete, Phase 6 deferred, at the founder gate

## Session Metadata
- Date: 2026-07-24
- Project: C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\synthetic-weight-engine
- Branch: feat/synthetic-load-runner-matrix
- Continues: `.claude/handoffs/2026-07-24-synthetic-load-matrix-phases-1-3.md`
- Memories: [[project_synthetic_load_matrix_progress]] (read FIRST), [[project_synthetic_weight_task8_teardown_fix]], [[project_synthetic_weight_phase_a_load_run]], [[feedback_verify_incoming_review_claims]]

## What shipped this session (all committed on the branch, NOT pushed, NOTHING applied to prod)

**Task 3.2 (df58ca3d, TDD):** `bulk-seed --with-content` + `--campaigns 50`/`--posts 200` + a testable
`seedContent(svc, args)` seam (null when off, fail-loud on rpc error) wired into cmdBulkSeed.

**Phase 4 (0c0b8421 + bc693145, TDD, all prod-verified):** `sim/load/actions-mix.ts` = the driver's
default `DAU_ACTIONS` (~90:10 read:write): dragonfeed_feed/grid, media_fetch (HEAD egress proxy),
campaign_browse/search, geo_near_me, profile_view + 3 RLS-real writes (campaign_write DRAFT,
notify_peer bot→bot, donny_footprint). Widened `HotAction.run → (client, ctx) => Promise<MediaResult|void>`
(`ctx={selfId,peerId}`); driver tallies `mediaRequests`/`mediaBytes` (isMedia = non-void object) into
StepMetrics + snapshot notes. driver dropped inline HOT_ACTIONS/throwOnError → imports DAU_ACTIONS
(one-way; no cycle). See [[project_synthetic_load_matrix_progress]] for the full list of verified prod
facts (campaigns INSERT role-agnostic, draft-exempt limit trigger, create-notification synthetic-email
suppression, donny/notify FK cascade types).

**Phase 5 (40b055c3/fa09556b/5e0da371/185094f2):**
- 5.1 `20260724183000_sim_load_matrix_summary.sql` — `get_sim_load_matrix_summary(text)`. SECURITY
  DEFINER, granted **authenticated** + in-body `is_internal_user()` guard, revoke anon/public (the
  dashboard must call it; DEFINER bypasses the table RLS). NOT applied.
- 5.2 `.github/workflows/synthetic-load-matrix.yml` — setup (validate shards **2..MAX_SHARDS=10**,
  emit matrix) → load (one shard/runner IP, parallel, `environment: synthetic-weight`, env-var-only,
  lockfile-pinned tsx). Run-label suffixed with `github.run_id.run_attempt` for per-dispatch uniqueness.
- 5.3 `useSimLoadMatrixSummary.ts` + `InternalSimulation.tsx` "Matrix run (summed)" section.
- 5.4 runbook §8 (matrix) + §7 amend (prefer `purge_synthetic_load_cohort()`, leaf-delete synthetic
  push_notifications first — Task 3.3).

**Phase 6 DEFERRED at the split-point** (realtime WebSocket leg — own connection quota + own spec+plan).

## Gate status (Phase 7)
- **Automated: GREEN** — 152 sim tests, tsc(sim), app typecheck, eslint, `npm run build`. (Skipped the
  full `npm run test` per [[project_vitest_preexisting_file_failures]] — nested-worktree e2e noise;
  changes are isolated to sim/ + 2 additive frontend files.)
- **data-exposure-reviewer: PASS, zero issues** (traced all 3 definer migrations + the RLS-real writes
  + the workflow secret handling; confirmed the is_internal_user guard, botla/botseed scoping, own-row
  writes, synthetic-only notify recipient, env-var-only inputs).
- **Codex round 1: 2 P2 → FIXED (b7a11295)** — matrix run-label uniqueness (github.run_id suffix) +
  reject shards<2 in the workflow.
- **Codex round 2: 1 P1 + 1 P2 → FIXED (a61f2505, TDD)** — **P1**: the driver default (full write mix)
  made single-runner `load` write as the LIVE bot0## cohort (readSessionCapableBots) → residue the
  scoped teardown spares. Fix: driver default + single-runner = reads-only `DAU_READ_ACTIONS`; writes
  (`DAU_ACTIONS`) run ONLY in matrix mode. **P2**: in-flight sampling left a single-wave step's latest
  snapshot at count=0 → summary reported 0 for a short soak; fix: a final per-step snapshot with true totals.
- **Codex round 3: 1 P2 → VERIFIED FALSE, dismissed (6e06afdc, evidence comment).** Claimed creator
  bots can't INSERT campaigns (business-only RLS) → false breakage. A rollback-wrapped insert probe as
  a synthetic content_creator under RLS **succeeded** — the policy is `with_check (user_id=auth.uid())`,
  role-agnostic. No fix (would add needless role routing); did NOT re-run a 4th time to chase a confirmed
  false positive. **Codex pass COMPLETE — all real findings resolved.**

## STATUS: branch PUSHED, PR #337 OPEN (migrations already live on prod). Smoke deferred per founder.

## Next steps (in order) — FOUNDER-GATED boundary
0. **PR #337** open (https://github.com/Pdiamondz1/dragoncandy-v3-d783432b/pull/337). Merge is the founder's
   call. After merge: refresh local main (post-merge RAG hook fires), regenerate `types.ts`, run knowledge-sync.
1. ~~Codex re-review clean~~ — DONE (R1/R2 fixed, R3 false-positive dismissed).
2. ~~`careful` gate → apply the 3 migrations to prod~~ — **DONE 2026-07-24.** All 3 applied + verified live:
   grants correct (summary→authenticated+is_internal_user guard, seed/purge→service-role only), guards
   fire (summary `42501 internal only`; seed `no synthetic business bot`), purge no-op clean,
   `get_advisors` clean (only the expected mitigated authenticated-definer WARN on the summary RPC).
   `purge_synthetic_data` overwrite was diffed = strict additive superset. **Still pending:** regenerate
   `src/integrations/supabase/types.ts` (summary hook uses a documented cast until then) — optional, post-merge.
3. **Founder-gated 2-shard live smoke** (off the 14:00 cron; needs the branch PUSHED so GH can dispatch
   the workflow with `--ref feat/synthetic-load-runner-matrix`): `bulk-seed --with-content --active 50`,
   then `gh workflow run synthetic-load-matrix.yml -f shards=2 -f concurrency=50`. Assert: distinct
   egress IPs, summed concurrency in `get_sim_load_matrix_summary`, NO cross-shard 429, byte-identical
   real-KPI segregation, clean teardown via `purge_synthetic_load_cohort()` (residuals 0, live 25 survive).
4. **Merge** (collision-check migration ts 181500/182000/183000 vs concurrent worktrees first — Grep
   hides bare 14-digit numbers, use `git grep`).
5. **knowledge-sync** on branch finish (wiki source + SHIPPED_LOG + core-doc refresh + Donny RAG).

## Gotchas carried
- **Founder-gated:** prod `apply_migration` (3 migrations) + the live ramp. Nothing applied yet.
- **Teardown:** matrix uses `purge_synthetic_load_cohort()` (botla%/botseed_% only) — NEVER
  `purge_synthetic_data()` (kills the live 25). All Phase-4 write residue is teardown-clean (verified:
  campaigns/donny CASCADE, push_notifications.user_id CASCADE + actor_id leaf-deleted).
- **types.ts:** `get_sim_load_matrix_summary` isn't in the generated types until applied+regenerated;
  `useSimLoadMatrixSummary` casts rpc through a minimal typed view meanwhile (remove the cast post-regen).
- **A matrix needs ≥2 shards** (single-runner is the `load` command / synthetic-weight.yml).
