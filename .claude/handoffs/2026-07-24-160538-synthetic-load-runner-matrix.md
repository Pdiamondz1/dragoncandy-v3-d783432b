# Handoff: Synthetic Load — first live ramp + Slice 1 (runner matrix) spec & plan

## Session Metadata
- Created: 2026-07-24 16:05:38
- Project: C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\synthetic-weight-engine
- Branch: feat/synthetic-load-runner-matrix
- Session duration: long (single session: ran a live prod load ramp + full brainstorm→spec→plan)

### Recent Commits (for context)
  - fe4be1c7 docs(load): 3rd-pass review — teardown-safe notification + content legs; add impl plan
  - 99ee2b28 docs(load): 2nd-pass review — pin sampled writes public-free (teardown-safe)
  - 74a24f51 docs(load): expand runner-matrix spec — reviewer fixes + realistic load model
  - c8d441f0 docs(load): runner-matrix design spec + first single-runner load-findings
  - 16583f27 Synthetic Weight Engine — Phase A: load proof & economics (#335, the merged base)

## Handoff Chain

- **Continues from**: None as a handoff doc. Context lives in project memories:
  `project_synthetic_weight_task8_teardown_fix` (Phase 1 go-live + the crew teardown FK fix) and
  `project_synthetic_weight_phase_a_load_run` (this session's load-run finding). Read both first.
- **Supersedes**: None. (The scaffold's auto-link to the content-engine handoff is spurious — unrelated work.)

## Current State Summary

Two things happened this session. **(1)** Executed the **first live single-runner load ramp** on prod per
`docs/runbooks/synthetic-load-tier-ramp.md` — it proved the harness works end-to-end but revealed a
**single-runner egress wall at ~312 concurrency while the prod DB stayed 91% idle** (peak 8/90 connections,
~0.5ms avg query, 0 429s). Delivered the Load Findings Report and torn down clean (real KPIs byte-identical,
live 25-bot cohort preserved). **(2)** The founder then escalated the ambition to **1M DAU**; we decomposed
that into slices and took **Slice 1 — the multi-IP GitHub Actions runner matrix** — all the way through
brainstorm → spec (3 review passes, all real fixes) → a full 7-phase TDD implementation plan. Everything is
**committed on `feat/synthetic-load-runner-matrix`; nothing pushed/PR'd.** Paused here by founder choice to
resume implementation fresh.

## Codebase Understanding

### Architecture Overview
- The synthetic harness lives in `sim/` (tsx/Node): `personas.ts`, `mint.ts`, `session.ts` +
  `session-pool.ts` (cross-tick refresh-not-remint — the keystone), `clients.ts`, `env.ts` (fail-closed boot
  gate: test-Stripe keys + `SYNTHETIC_BOTS_ENABLED` DB flag), `behavior/graph.ts` + `behavior/actions.ts`
  (crew-lane writes), `load/driver.ts` (ramp + knee + findings), `run.ts` (subcommand handlers), `cli.ts`.
- Safety spine (migration `20260723131000`): `synthetic_users` registry, `is_synthetic*()`,
  `SYNTHETIC_BOTS_ENABLED` kill switch, `purge_synthetic_data()`, `platform_weight.*_real` split,
  `sim_load_snapshots`, `capture_sim_load_snapshot`, `seed_synthetic_cohort`.
- The matrix (Slice 1) = a NEW workflow (`synthetic-load-matrix.yml`, setup→dynamic matrix) driving the same
  vehicle-agnostic `sim/` driver on N runners; ramp knob = shard count; each shard holds a fixed egress-safe
  ~200 concurrency; summed by `get_sim_load_matrix_summary`.

### Critical Files
| File | Purpose | Relevance |
|------|---------|-----------|
| `docs/superpowers/specs/2026-07-24-synthetic-load-runner-matrix-design.md` | Slice 1 spec (3 review passes) | THE design; read fully before building |
| `docs/superpowers/plans/2026-07-24-synthetic-load-runner-matrix.md` | 7-phase TDD plan | The build steps; start here |
| `docs/superpowers/load-findings/2026-07-24.md` | First live ramp's findings report | Why the matrix exists |
| `docs/superpowers/specs/2026-07-24-synthetic-weight-load-economics-design.md` | Parent Phase-A spec | §4b anticipates the matrix; Phase B = capped-Donny/paid (NOT this slice) |
| `docs/runbooks/synthetic-load-tier-ramp.md` | Operating runbook | Extended by the matrix section (plan Task 5.4) |
| `sim/run.ts`, `sim/load/driver.ts`, `sim/mint.ts`, `sim/session-pool.ts`, `sim/seed.ts` | Harness code the plan modifies | Signatures confirmed this session |
| migration `20260724011000_purge_synthetic_crew_leaf_delete.sql` | The crew NO-ACTION-FK teardown fix | The PATTERN to mirror for push_notifications |

### Key Patterns Discovered
- `sim/load/driver.ts` `runLoad` already injects `deps.actions ?? HOT_ACTIONS` → the clean seam for the
  behavior-mix (Phase 4).
- `SessionPool.getToken(email,userId,now)` already does reuse/refresh/mint → refresh-aware `makeBotFor`
  (Phase 1 Task 1.2) just calls it every time and rebuilds the client only when the token rotates.
- `readSessionCapableBots` returns BOTH `bot0##` (live daily cohort) AND `botla…` (active cohort), with NO
  `ORDER BY` → the matrix needs a NEW `readActiveLoadCohort` that filters `botla…`-only + `ORDER BY email`.
- MCP `execute_sql` returns only the LAST statement's result → ONE statement per call; rollback-wrap prod probes.

## Work Completed

### Tasks Finished
- [x] First live single-runner load ramp (GH run 30116019066) — the egress-wall finding.
- [x] Load Findings Report `docs/superpowers/load-findings/2026-07-24.md`.
- [x] Clean teardown (5,000 depth seed + 8 snapshots removed; real KPIs restored; live 25 survived).
- [x] Slice 1 spec — 3 independent review passes, all issues fixed.
- [x] Slice 1 7-phase TDD implementation plan.
- [x] Two project memories written (`project_synthetic_weight_phase_a_load_run`, updated MEMORY.md index).

### Files Modified (all committed on the branch)
| File | Changes | Rationale |
|------|---------|-----------|
| `docs/superpowers/specs/2026-07-24-synthetic-load-runner-matrix-design.md` | New | Slice 1 design |
| `docs/superpowers/plans/2026-07-24-synthetic-load-runner-matrix.md` | New | Implementation plan |
| `docs/superpowers/load-findings/2026-07-24.md` | New | Findings report |

### Decisions Made
| Decision | Options | Rationale |
|----------|---------|-----------|
| GH Actions matrix now, VM fleet deferred | matrix / VM fleet / hybrid | Cheapest, scales by shard count; VM fleet = Slice 2/3 |
| Ramp by SHARD COUNT (each shard fixed ~200 C) | ramp per-shard to knee / scale shards | Single runner caps at ~312 egress; scale IPs not per-shard C |
| Distinct `botla` bots per shard (25/shard) | share live 25 / distinct slice | Faithful distinct users; per-IP 429-safe |
| Sampled writes = PUBLIC-FREE campaigns | crew-lane / public-free | Crew writes hit NO-ACTION-FK teardown trap; public-free = no crew rows |
| No tier money in Slice 1 | prove current tier / buy tiers | Prove headroom + optimize; tiers = Slice 2 cost model |

## Pending Work

### Immediate Next Steps
1. **Run the plan-document-reviewer** on `docs/superpowers/plans/2026-07-24-synthetic-load-runner-matrix.md`
   (skill `writing-plans` references `plan-document-reviewer-prompt.md`); fix + re-dispatch until approved.
2. **Begin Phase 1** (subagent-driven, per `superpowers:subagent-driven-development`): Task 1.1
   `readActiveLoadCohort` (deterministic `botla`-only slice) → 1.2 refresh-aware `makeBotFor` → 1.3 matrix flags.
3. Proceed through Phases 2–5 (REST/content/media matrix), then **Phase 6 (realtime) is a HARD SPLIT-POINT**
   — if it exceeds Phases 1–5 combined, extract to its own spec+plan.
4. **Gates before any full prod ramp** (plan Phase 7): unit+build, edge-function-reviewer +
   data-exposure-reviewer on the 2 new RPCs + workflow, Codex, `careful`, then a founder-gated **2-shard live
   smoke** (distinct IPs, summed concurrency, no cross-shard 429, byte-identical segregation, clean teardown).

### Blockers/Open Questions
- [ ] Content-seed exact columns (campaigns owner col, dragonshare_posts, profiles avatar, creator_profiles
      lat/long) must be **verified against prod schema FIRST** (plan Task 3.1 Step 1) — do not fabricate.
- [ ] GH runner concurrency limit on the account caps shards-per-dispatch — verify before assuming a shard count.
- [ ] Supabase Realtime plan quota (WebSocket) — a separate ceiling; confirm before the realtime phase.

### Deferred Items
- **Slice 2 — "Road to 1M DAU" readiness + cost model** (pooler/replicas/cache/CDN/tiers + $/mo at
  50K/250K/1M + revenue). NOT written yet; the founder wants it. It only MODELS the AI/CDN $ — the capped-Donny
  BUILD stays the parent spec's Phase B.
- Slice 3+ (actually building higher-scale infra) — later, staged, guided by Slice 2.

## Context for Resuming Agent

### Important Context
- **This is founder-gated, prod-degrading work.** Every live ramp touches prod and degrades the app for the
  ~30 real testers during the saturation window; run OFF the 14:00 UTC daily `tick` cron; use the `careful`
  gate before the first prod matrix dispatch.
- **50K is the LOWER barometer; 1M DAU is the north star.** The matrix is designed to scale toward the ~80-IP
  1M fleet by shard count without a `sim/` rewrite (only the workflow YAML changes).
- **The load model must stay REALISTIC** (founder's explicit steer): content-heavy seed (campaigns + video
  posts + file_uploads), avatar'd + geo'd bots, a DAU behavior mix (DragonFeed video fetch, geo near-me,
  mobile:desktop, public-free content writes, **bot→bot** notifications, Donny-chat DB footprint), a distinct
  **realtime/WebSocket** sub-leg, and storage/egress observability. Real AI-generation + CDN-egress **dollars**
  are the dominant DAU-scale costs and are MODELED in Slice 2, not fired in the capacity proof.

### Assumptions Made
- The prod DB is `max_connections = 90`; `pg_stat_statements` + `uuid-ossp` in the `extensions` schema.
- The live 25-bot cohort (`bot0##`) + daily 14:00 UTC cron stay untouched by all matrix work.
- `campaigns_group_free` CHECK allows `group_id IS NULL` + `fixed_price=0` (public-free) — verified this session.

### Potential Gotchas
- **TEARDOWN NO-ACTION-FK TRAPS (safety-critical).** The raw `botla%`/`botseed_%` `auth.users` delete is
  BLOCKED by NO-ACTION FKs to profiles/auth.users. Known offenders: crew tables (fixed in `20260724011000`),
  **`push_notifications.actor_id → profiles`** (plan Task 3.3 leaf-deletes it + adds to `purge_synthetic_data`),
  and **`dragonshare_posts.verified_by → auth.users`** (content seed pins it NULL). Before ANY new synthetic
  write, check `pg_constraint.confdeltype IN ('a','r')` FKs to profiles/auth.users and either NULL them or
  leaf-delete them in teardown.
- **A plain insert of a campaign/application/message fires NO notification** — DragonCandy notifications come
  from edge fns/RPCs, not DB triggers on those tables. The notification leg must explicitly call
  `create-notification` bot→bot (synthetic recipient — never spam a real tester).
- **The pre-scale optimization target** (from the load-findings advisors): ~231 `multiple_permissive_policies`
  + ~158 `auth_rls_initplan` on the hot tables (`campaigns`, `dragonshare_posts`, `public_creator_profiles`,
  `conversations`) — these are how you buy DB headroom WITHOUT tier money.
- A single home/runner IP measures egress, not the DB (the whole reason for the matrix). Don't run a "ceiling"
  ramp from one machine and call it a DB result.

### The load run mechanics (repeatable)
- Seed depth: `select seed_synthetic_cohort(N,'load',0.65)` (idempotent; emails `botseed_load_<i>@…`).
- Reset stats before a ramp: `select extensions.pg_stat_statements_reset()`.
- Dispatch single-runner smoke: `gh workflow run 319252096 -f command=load` (workflow `synthetic-weight.yml`).
- Read curve: `select … from sim_load_snapshots where run_label='load'` + the GH run log `[load]` lines.
- Teardown: prefix delete `botseed_%`/`botla%` + `sim_load_snapshots` — NEVER `purge_synthetic_data()` (kills
  the live 25).

## Environment State
### Tools/Services Used
- Supabase MCP (prod `zocahiffooqdybdhguqv`, service-role via `execute_sql`), `gh` CLI (authed, Pdiamondz1),
  the `synthetic-weight` GH Environment (holds the `SIM_*` secrets incl. prod service-role key).
### Active Processes
- A background `plan`-adjacent reviewer may still be finishing; none load-bearing. No live prod load running.
- Prod is CLEAN: 0 synthetic load residue, live 25 cohort intact, `SYNTHETIC_BOTS_ENABLED` on.
### Environment Variables (names only)
- `SIM_SUPABASE_URL`, `SIM_SUPABASE_ANON_KEY`, `SIM_SUPABASE_SECRET_KEY`, `SIM_STRIPE_SECRET_KEY`,
  `SIM_STRIPE_PUBLISHABLE_KEY` (GH `synthetic-weight` Environment). Local runs need these + a service-role key.

## Related Resources
- Spec: `docs/superpowers/specs/2026-07-24-synthetic-load-runner-matrix-design.md`
- Plan: `docs/superpowers/plans/2026-07-24-synthetic-load-runner-matrix.md`
- Findings: `docs/superpowers/load-findings/2026-07-24.md`
- Parent spec: `docs/superpowers/specs/2026-07-24-synthetic-weight-load-economics-design.md`
- Runbook: `docs/runbooks/synthetic-load-tier-ramp.md`
- Memories: `project_synthetic_weight_phase_a_load_run`, `project_synthetic_weight_task8_teardown_fix`

---

**Security Reminder**: no secrets in this doc (env var NAMES only).
