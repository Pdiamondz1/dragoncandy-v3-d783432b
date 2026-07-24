# Session — Synthetic Weight Engine: multi-IP load runner matrix (Slice 1)

Date: 2026-07-24
Branch: `feat/synthetic-load-runner-matrix` · PR #337
Continues: [[Synthetic Weight Engine]] Phase A (the ~312-concurrency single-runner egress wall this exists to break).

## Why

A single GitHub Actions runner drives the synthetic-load harness from ONE IP and caps at a
**client-side egress wall (~312 concurrency)** while prod's Postgres stays **~91% idle** (Phase A finding,
`docs/superpowers/load-findings/2026-07-24.md`). The **runner matrix** fans the SAME load driver across N
GH jobs — one runner IP each — so the *summed* offered concurrency pushes prod's DB toward its real
connection ceiling. The ramp knob becomes the **shard count** (each shard holds a fixed egress-safe
concurrency C on its own IP; N shards ≈ N×C offered; north star ~1M DAU ≈ 80 shards).

## What shipped (Task 3.2 + Phases 4–5; Phase 6 deferred)

- **Task 3.2 — `bulk-seed --with-content`** (+ `--campaigns 50`/`--posts 200`): a testable
  `seedContent(svc, args)` seam (returns null when off, fail-loud on rpc error) that calls the
  service-role `seed_synthetic_content` RPC after the depth+active seed.
- **Phase 4 — realistic DAU behavior mix** (`sim/load/actions-mix.ts`, `DAU_ACTIONS`, ~90:10 read:write):
  mobile feed + desktop grid, a media **HEAD** egress-proxy fetch, campaign browse/search, geo near-me,
  profile view; + 3 RLS-real writes — a **public-free DRAFT** campaign (`campaign_write`), a bot→bot
  `create-notification` to a synthetic peer (`notify_peer`), and a direct `donny_conversations`/
  `donny_messages` footprint (`donny_footprint`). Widened `HotAction.run → (client, ctx) => Promise<MediaResult|void>`
  (`ctx = {selfId, peerId}`, both drawn from the cohort); driver tallies per-step `mediaRequests`/`mediaBytes`.
- **Phase 5 — aggregation + surfacing:** `get_sim_load_matrix_summary(p_run_label)` RPC (per-shard latest
  `captured_at` sample = fullest cumulative total → SUM concurrency/requests/media, MAX p95 + DB peaks,
  latest `platform_weight.storage_bytes`); the dynamic `synthetic-load-matrix.yml` workflow (≥2 shards,
  env-var-only inputs, `synthetic-weight` environment gate, run-label suffixed with `github.run_id`); the
  `/internal/simulation` "Matrix run (summed)" card; the runbook §8 matrix section.
- **Phase 6 (realtime WebSocket leg) — DEFERRED** at its designed hard split-point (own connection quota
  separate from Postgres `max_connections` → own spec+plan). Phases 1–5 are a complete Slice-1 deliverable.

## Migrations (applied to prod 2026-07-24 under the careful gate; verified live)

- `20260724181500_sim_content_seed.sql` — `seed_synthetic_content(int,int,numeric)` (service-role only).
- `20260724182000_purge_synthetic_load_cohort.sql` — `purge_synthetic_load_cohort()` (service-role only,
  scoped teardown of `botla%`/`botseed_%` ONLY — spares the live `bot0##` 25) + a `CREATE OR REPLACE` of
  `purge_synthetic_data()` adding a `push_notifications` leaf-delete + residual (Task 3.3).
- `20260724183000_sim_load_matrix_summary.sql` — `get_sim_load_matrix_summary(text)` (**granted
  authenticated**, gated in-body on `is_internal_user()` since DEFINER bypasses the table RLS; anon/public revoked).

## Verified prod facts that shaped the writes (do NOT re-fabricate)

- **campaigns INSERT RLS = `with_check (user_id = auth.uid())`** — role-AGNOSTIC. Proven by a
  rollback-wrapped insert probe as a synthetic `content_creator` (SUCCEEDED). So the write mix needs no
  role routing; a creator-owned synthetic draft is harmless + teardown-cleaned.
- **`enforce_active_campaign_limit` fires ONLY on `status='published' AND group_id IS NULL`** → the write
  uses **`draft`** (limit-exempt → repeatable under soak, and invisible to real users' browse which filters `published`).
- **`create-notification`** takes any authenticated caller, needs `recipientId/type/category/title/body`,
  and **already suppresses outbound email to `is_synthetic` recipients** (+ `category:'content'` is
  email-off) → `notify_peer` to a synthetic peer never emails a real user.
- **`donny_conversations` INSERT RLS** = `auth.uid()=user_id AND surface!='internal'` → set `surface='web'`;
  `donny_messages.role` CHECK ∈ user/assistant/system/tool → `'user'`; `donny_messages.user_id` is a
  nullable NO-ACTION FK → **omit it** (message cascades via `conversation_id`).
- **FK cascade types (teardown-critical):** `campaigns.user_id`→profiles CASCADE; `donny_conversations.user_id`
  + `donny_messages.conversation_id` CASCADE; `push_notifications.user_id` CASCADE but **`actor_id` NO-ACTION**
  (must leaf-delete). So `purge_synthetic_load_cohort()` leaf-deletes `push_notifications.actor_id` +
  crew tables + telemetry, then cascades the users, then deletes the non-cascading synthetic org.

## Design decisions / gotchas

- **Writes are matrix-only.** The driver DEFAULT + the single-runner `load` path use the reads-only
  `DAU_READ_ACTIONS`; the ~10% write leg (`DAU_ACTIONS`) runs ONLY in matrix mode. **Why:** single-runner
  drives `readSessionCapableBots` (the LIVE `bot0##` cohort), and `purge_synthetic_load_cohort()` spares
  `bot0##` → writes there would leak residue only the full `purge_synthetic_data()` (which kills the live
  25) could clean. (Codex R2 P1.)
- **Media = HEAD + Content-Length proxy**, not a body GET — the assets are third-party CDN videos and a
  full-body GET at high concurrency would self-inflict the very egress wall the proxy measures.
- **Per-step FINAL snapshot.** In-flight sampling (required so `active_connections` reads the real load —
  Phase A Codex P1) left a single-wave step's latest snapshot at `count=0`, so the summary reported 0 for a
  short soak (`soak_ms=0` / soak < `sampleEveryMs`). Fix: emit a final per-step snapshot with the true
  cumulative totals (DB-side peaks are MAX-across-rows, so the low post-wave connection reading can't lower them). (Codex R2 P2.)
- **A matrix needs ≥2 shards** — `planLoad` routes `shards<=1` to the single-runner path (which the summary
  can't aggregate); the workflow rejects `shards<2`. (Codex R1.)
- **Unique run-label per dispatch** — the summary groups solely by `run_label` (latest row per shard), so a
  reused label let an earlier run's shards leak into a later smaller run's summary → the workflow suffixes
  the label with `github.run_id.run_attempt`. (Codex R1.)
- **Grant reconciliation:** the summary RPC's plan said "revoke authenticated," but the /internal dashboard
  reads `sim_load_snapshots` directly and must CALL the RPC → granted `authenticated` behind a mandatory
  in-body `is_internal_user()` guard instead (DEFINER bypasses the table RLS).
- **types.ts:** the summary isn't in generated types until the migration is applied + regenerated; the hook
  casts rpc through a minimal typed view meanwhile (remove post-regen).

## Reviews

- **data-exposure-reviewer: PASS** (zero issues — 3 definer migrations + RLS writes + workflow secrets).
- **Codex second review (3 rounds):** R1 (2×P2: run-label uniqueness + reject shards<2) fixed; R2 (**P1**:
  write mix leaking into single-runner live-cohort load; P2: short-soak zero-reporting) fixed TDD; R3 (1×P2
  "creators can't INSERT campaigns") **verified FALSE** via the rollback-wrapped RLS probe → dismissed.
- 153 sim tests · `npm run build` · `npm run typecheck` · eslint — all green.

## Still founder-gated / deferred

- 2-shard live smoke (`bulk-seed --with-content --active 50` → `gh workflow run … -f shards=2`), off the cron.
- Regenerate `src/integrations/supabase/types.ts`; sync Donny RAG after merge.
- Phase 6 realtime leg (own spec+plan).
