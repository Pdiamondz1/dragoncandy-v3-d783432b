# Synthetic Load — Multi-IP Runner Matrix (Slice 1 of the "Road to 1M DAU" decomposition)

**Goal.** Fan the synthetic load driver out across **N GitHub Actions runners (distinct egress IPs)** and
**sum** their concurrency, so we can push *past the single-runner egress wall* and actually pressure prod's
database toward the **~1,000-peak-concurrent band that brackets 50K DAU** — then sustain it as a bounded,
re-triggerable **soak** — to answer: *does the current compute tier hold 50K, and what do we optimize to hold
more per dollar?* **50K is the lower barometer, not the ceiling:** the driver is written **vehicle-agnostic**
and the matrix **ramps by shard count**, so the same code scales toward the **~16–20K concurrent of 1M DAU**
(≈ 80 shards) later without a rewrite. **"Realistic" means content-heavy** — DragonFeed video, campaigns,
content generation and shipping — **not a REST-read benchmark** (see §3a); the costs that dominate at DAU
scale are **storage + video egress + AI**, not Postgres.

**Scope boundary.** This spec is **Slice 1 only** — the load-*generation* capability. Two sibling slices are
explicitly **out of scope here** and tracked separately:
- **Slice 2 — "Road to 1M DAU" readiness + cost model** (a separate design doc, written next): what it takes
  (Supavisor pooler, read replicas, cache/CDN, compute tiers) and the **$/mo at the 50K / 250K / 1M rungs** +
  the revenue those DAUs imply. Analysis, no build.
- **Slice 3+ — actually building higher-scale infra**, staged, only as real demand approaches, guided by Slice 2.

**Founder-gated & prod-degrading** — same safety envelope as `docs/runbooks/synthetic-load-tier-ramp.md`
(kill switch, off the 14:00 UTC daily tick, knee-not-outage, segregation, teardown). Do not automate.

---

## 1. What is already built + what today proved

- **Single-runner harness is live and works end-to-end** (PR #335, merged to main): `sim/load/driver.ts`
  (ramp + knee detection + findings collection), `sim/run.ts` `cmdLoad` (drives load through
  `readSessionCapableBots`, which excludes the depth pool and targets the live `bot0##` cohort + any
  `botla…` active cohort), `sim/session-pool.ts` (cross-tick refresh-not-remint), the
  `capture_sim_load_snapshot(p_run_label, p_error_rate, p_notes)` RPC, and the `synthetic-weight.yml`
  workflow (daily tick + a single-runner `load` convenience dispatch).
- **First live ramp (2026-07-24, `docs/superpowers/load-findings/2026-07-24.md`)** proved the
  path but hit a **single-runner egress wall at ~312 concurrency**: p95 rose 268→716ms while the
  **prod DB stayed 91% idle** (peak **8 of 90** connections, ~0.5ms avg query, **0 429s** — the session
  pool worked). The knee was **client-side** (one IP / one Node process / socket + Cloudflare/PostgREST
  per-IP concurrency), exactly spec §4b of the load-economics design. **One runner physically cannot load
  the DB.** This spec is the fan-out that can.
- **Baseline:** prod `max_connections = 90`; `pg_stat_statements` + `uuid-ossp` in the `extensions` schema;
  the safety spine (`synthetic_users`, `is_synthetic*`, `SYNTHETIC_BOTS_ENABLED` kill switch,
  `purge_synthetic_data`, `platform_weight.*_real` split) unchanged.

## 2. Decisions locked in brainstorming

1. **Vehicle = GitHub Actions matrix now; driver vehicle-agnostic.** Cheapest, zero standing infra, proves 50K
   fastest, scales by shard count. The standing **VM fleet is deferred** (YAGNI at this rung) and belongs to
   Slice 2's roadmap for rungs needing > ~20 IPs. Nothing GitHub-specific lives in `sim/`.
2. **Ramp dimension = shard count.** Each shard holds a **fixed, egress-safe concurrency C (~200)** — *below*
   the single-runner ~312 wall — and we scale **S**. Summed offered load = **S × C**. The "knee" becomes a
   **whole-system** property (does the DB strain as S grows?), not per-process.
3. **Distinct bots per shard.** The per-IP 429 wall means each shard safely mints its **own ~25-bot slice from
   its own runner IP** (25 mints/IP regardless of S). Shard N owns bots `[N·25 … N·25+24]` — faithful
   "distinct real users," no same-bot-across-IPs sessions.
4. **Bounded, re-triggerable soak.** Each dispatch holds fixed S for a duration D (≤ ~5.5h/window, under the
   GH 6h job cap) with **mid-window token refresh**; "keep it there" = re-dispatch / schedule windows.
5. **No tier money in Slice 1.** Prove the **current** tier's headroom + harvest per-dollar optimizations;
   tier-stepping (and the willingness to buy tiers) is a Slice 2 concern.
6. **Cost guardrail.** A hard `max_shards` cap in the workflow prevents a runaway fleet / Actions-minute burn.

## 3. Architecture & scale model

One dynamic matrix workflow (`.github/workflows/synthetic-load-matrix.yml`, new — the existing
`synthetic-weight.yml` daily tick is **untouched**):
- A tiny **`setup` job** turns a `shards` dispatch input (e.g. `5`) into a JSON array (`[0,1,2,3,4]`) via
  `fromJSON`, output to the matrix. A **`max_shards` cap** (e.g. 10) is enforced in `setup` — a larger input
  fails the job loudly rather than spawning a runaway fleet.
- The **`load` job** fans that array into **N parallel matrix jobs — one shard per runner, one runner per
  egress IP**. Each shard runs the driver with plain params: `--shard <N>`, `--shards <S>`,
  `--concurrency <C>`, `--soak-ms <D>`, `--run-label matrix-<ts>`. Inputs pass through **env vars, never
  interpolated into the run script** (mirrors the existing workflow's injection-safe pattern). **Soak mode =
  a single-step ramp at fixed concurrency C held for duration D** (equivalent to `--ramp C` + a long
  `--hold-ms D`); `--concurrency`/`--soak-ms` are the explicit soak flags, distinct from the multi-step
  `--ramp start/max/factor` the single-runner *ceiling* test uses.
- **Vehicle-agnostic:** `sim/` receives shard identity + concurrency + duration as arguments and knows
  nothing about GitHub. The workflow YAML is the *only* throwaway piece; the identical driver later runs on a
  VM fleet for the 1M rungs.

## 3a. Representative load model — content, video, and AI (not a REST-read benchmark)

Realistic 50K-DAU traffic on DragonCandy is **content-heavy**: DragonFeed video consumption, campaign
browse/apply, content being **generated** (Donny) and **shipped** (posting/cross-scheduling). A pure REST-read
mix (today's single-runner run) on a users-only seed understates the load and — critically — misses the
**dominant scaling costs: storage + video egress (CDN)** and **AI generation**, which for a video platform
dwarf Postgres compute. Slice 1 makes the simulation representative **at the DB + storage layer** (cheap, no
real AI $); the AI-generation and CDN-egress **dollars** are Slice 2's cost model, where they dominate.

- **Content-heavy seed (extend the population).** Beyond user profiles, seed representative **campaigns**,
  **DragonShare video posts** (`dragonshare_posts` with real public `content_file_path` media), and
  **`file_uploads`** at DAU-proportions, so DragonFeed/browse/search hit real media and
  `platform_weight.storage_bytes` reflects a video platform. Today `seed_synthetic_cohort` seeds only users →
  a companion content-seed RPC (or extension) is needed, all `is_synthetic`-tagged + purgeable via the same
  prefix teardown.
- **Realistic bot identities + media.** Each bot gets a **profile picture / avatar**, and campaigns/feed posts
  get **thumbnail + sample video** media — so the app renders as a *populated, real-looking platform* and
  actually **serves** that media under load (the egress that matters), not empty placeholders. Source: a
  varied **pool of real avatar/image/video assets** in the public `profile-assets` / DragonShare buckets,
  referenced across bots/posts by deterministic assignment — realistic rendering + real egress **without**
  storing 50K distinct files. (Distinct-per-user storage *volume* at 50K/1M is a **Slice 2 cost-model
  parameter**, not a Slice 1 build; per `[[project_dragonshare_content_file_path_public_url]]`,
  `content_file_path` is already a public URL usable directly as an `<img>`/`<video>` src.)
- **DAU behavior mix (a realistic consumer session, not pure reads).** Each shard weights, per bot:
  **DragonFeed video/media fetches**; **campaign browse/search + geo "near-me"** (creators/feed by radius —
  bots seeded with varied lat/long, §4); **profile views**; a **mobile-vs-desktop split** (~70:30 mobile,
  which changes the endpoint/query mix — the mobile vertical feed vs the desktop grid); sampled **content
  writes** — **public-free campaigns** (`group_id IS NULL`, `fixed_price=0`: kept in browse *and* producing
  **no crew rows**) + posts / applications / messages, inserted `is_synthetic` (the DB+storage footprint of
  generation & shipping **without** a real Donny AI call). This leg deliberately does **NOT** use the crew-lane
  write path (`sim/behavior/actions.ts`): crew writes create `creator_group_members` / `crew_activity` rows
  whose NO-ACTION FKs to `profiles` **block** the raw `botla%` teardown cascade — the exact prod-purge rollback
  in `[[project_synthetic_weight_task8_teardown_fix]]` (only `purge_synthetic_data()` was leaf-fixed, not the
  runbook's raw delete). Public-free writes cascade clean. Then **notification fanout** — the leg calls the sanctioned
  `create-notification` path **bot→bot** (synthetic actor → a *synthetic* recipient, **never a real tester**),
  because a plain direct insert of a campaign/application/message fires **no** notification (there is no DB
  trigger on those tables — verified). NOTE: `push_notifications.actor_id → profiles` is a **NO-ACTION FK**
  (the same class as the crew trap), so teardown must **leaf-delete synthetic `push_notifications` before the
  `botla%` delete** (§7). And a sampled **Donny chat** session that **writes the
  `donny_conversations`/`donny_messages` rows directly and does NOT invoke the generating edge functions** (DB
  footprint only — the **real AI $ is modeled in Slice 2**). Read:write ~90:10; media fetches (GET/HEAD to
  Storage/CDN) are the **egress proxy**.
- **Realtime is a distinct load axis (its own ceiling).** Messaging/presence/typing run over **Supabase
  Realtime (WebSockets)**, not REST — so 50K DAU means tens of thousands of **concurrent persistent
  connections** + presence heartbeats + message-broadcast fanout, governed by Realtime's **own** concurrency/
  message quota, *separate from* the 90 DB connections. A dedicated **realtime sub-leg** has each shard's bots
  open and hold conversation/presence channels and exchange messages, with its concurrency recorded separately
  in the snapshot (a `realtime_connections` key in the `notes` jsonb). This axis often saturates *before* the
  DB and is invisible to a REST-only test — the heaviest of these additions, sequenced as its own phase in the
  implementation plan; if that phase proves larger than the rest of Slice 1, the plan **splits it into its own
  slice/spec**.
- **Storage/egress observability (new dimension).** Alongside DB connections/latency, the run records
  `platform_weight.storage_bytes` growth and a **media-egress proxy** (bytes/requests to Storage/CDN) — the
  scaling cost the DB-only view misses for a video app.
- **Real AI generation + real CDN-egress $ are OUT of Slice 1.** No real `donny-*` generate calls fire (they
  cost real AI budget and stress Anthropic/edge functions, not the DB tier this slice proves); serving real
  media *bytes* at 50K is a CDN concern. Both are the **dominant 1M-DAU costs** and are **modeled (not built)**
  in **Slice 2's cost model**; the actual capped-Donny / paid-leg *build* remains the parent load-economics
  spec's gated **Phase B** — not conflated with Slice 2. (An optional tiny sampled real-Donny leg under a hard
  synthetic-AI USD ceiling can be added later for ledger realism; not required for the capacity proof.)

## 4. Per-shard sessions & cohort

- **Seed once up front** via the existing `bulk-seed`: a large **depth pool** (`seed_synthetic_cohort`, never
  authenticates — populates browse/feed/search/dashboards so hot queries hit realistic row counts) **plus an
  active cohort sized `25 × max_shards`** (minted through `mint.ts` / `auth.admin.createUser`, session-capable)
  — plus the **content + media seed (§3a)**: campaigns, DragonShare video posts, `file_uploads`, per-bot
  avatars, and **varied geographic coordinates** (for near-me/geo queries), so the feed and profiles render
  real, not empty.
- **Shard-slice selection (new):** a new selector `readActiveLoadCohort(shard, shards)` returns the active
  bots this shard drives — it filters to the **`botla…` active cohort only** (EXCLUDING the live `bot0##`
  daily-tick cohort that `readSessionCapableBots` also returns), applies a **deterministic `ORDER BY email`**
  (PostgREST returns unspecified order otherwise → independent runners would get different orderings and
  **overlapping** slices, violating decision #3), then returns `[N·25 … N·25+24]`. Distinct users per shard,
  no overlap, no same-bot-across-IPs. The existing `readSessionCapableBots` (daily tick + single-runner
  `load`) is unchanged; each shard's session pool is ephemeral (fresh mint at job start, 25 mints from its own
  IP → 429-safe).
- **Soak refresh (new) — TWO parts, both required:** (1) the driver's hold loop **refreshes** pooled tokens
  (one refresh call) before the ~1h TTL; and critically (2) **`makeBotFor`'s per-userId client cache is made
  refresh-aware** — it must **rebuild the bot client when the pooled token rotates**. Today `makeBotFor`
  (`sim/run.ts`) caches the client for the whole run and never re-consults the pool after the first hit, so
  refreshing the pool alone leaves the cached client on the frozen (expired) token → the exact
  `401 JWT expired` trap the runbook §3 documents. Without part (2) a long hold still throws, and the driver
  misclassifies it as a breakage finding — the very failure this feature exists to prevent.

## 5. Aggregation & reporting

- Every shard writes `sim_load_snapshots` under a **shared `run_label` (`matrix-<ts>`)** with `shard`,
  offered `concurrency`, and client metrics (ok/throttle/breakage/p50/p95) in the `notes` jsonb.
- The **DB-side** columns (`active_connections`, `avg_query_ms`) are **global** (every shard samples the same
  database) → the summary takes the **peak** across shards. The **client-side** metrics are per-shard → the
  summary **sums** throughput/concurrency and **maxes** p95.
- New read RPC **`get_sim_load_matrix_summary(p_run_label)`** (service-role, SECURITY DEFINER, `search_path=
  public`, revoked from anon/authenticated) returns the one decision row: *at S×C offered concurrency, the DB
  peaked at X/90 connections, Y ms avg query, Z% aggregate error, over the window.* **Aggregation grain:** per
  shard, take its **peak-offered-concurrency step's latest sample**; **sum** those per-shard client metrics
  (throughput/concurrency/errors) and **max** the p95; the **DB-side reading = `max(active_connections)` and
  `max(avg_query_ms)` across all rows** of the run (every shard samples the same database).
- `src/pages/internal/InternalSimulation.tsx` renders the summed curve. Each shard uploads its
  `sim/.load-findings.json` as artifact `findings-shard-<N>` (fixing today's single-runner artifact-loss),
  merged into the Load Findings Report (`docs/superpowers/load-findings/<date>.md`).
- **Storage/egress leg (§3a):** the summary also carries `platform_weight.storage_bytes` growth + the
  media-egress proxy, so the 50K readout includes the **video-platform cost dimension**, not just DB
  connections.

## 6. Knee/stop & soak semantics

- **Whole-system knee:** as S is stepped up across dispatches, stop stepping when the shared DB reading crosses
  a threshold — `active_connections` approaching 90, `avg_query_ms` climbing, or aggregate error ≥ 10%.
  Individual shards still **fail loud on breakage** (non-throttle errors).
- **Success = the 50K band (S×C ≈ 1,000) held with the DB healthy** (well under 90 conns, low latency, ~0
  breakage) for the soak duration.
- **Graceful stop:** each shard's hold loop **re-checks `SYNTHETIC_BOTS_ENABLED` every snapshot cycle via a
  new `isEnabled()` dependency injected into `runLoad`** — which today holds no service client (it receives
  only `botFor`/`captureSnapshot`/`writeFindings`), so the new dep reads the flag through the service client.
  Flipping the switch off **drains all shards within a cycle** (no `gh run cancel` needed; cancel remains the
  blunt stop). This is new: the existing boot gate only checks at start.

## 7. Safety envelope (existing contracts + matrix additions)

- **Kill switch:** per-shard boot gate (existing) **+** the periodic in-soak re-check (new, §6).
- **Off-cron, founder-gated dispatch, knee-not-outage** (stop stepping S at the whole-system knee — never a
  DoS; observability must stay responsive).
- **Segregation unchanged:** all synthetic, `is_synthetic`-filtered; real KPIs byte-identical before/after each
  run (verified every run per the runbook).
- **Teardown:** prefix-match delete (`botseed_%` depth + `botla%` active), **NEVER `purge_synthetic_data()`**
  (kills the live 25 daily-tick cohort). The active cohort is just larger now (25×shards); same prefix, same
  clean cascade (depth/active users have no crew rows — the sampled-write leg is pinned to public-free
  campaigns for exactly this reason, §3a — see `[[project_synthetic_weight_task8_teardown_fix]]`).
  **Leaf-delete first (NO-ACTION FKs):** synthetic `push_notifications` (its `actor_id → profiles` is NO
  ACTION) must be deleted BEFORE the `botla%`/`botseed_%` `auth.users` delete — mirror the `20260724011000`
  crew leaf-delete fix; **both** the runbook raw teardown **and** `purge_synthetic_data` need this. (The
  content seed pins `dragonshare_posts.verified_by = NULL` (§8), so its NO-ACTION FK to `auth.users` needs no
  leaf-delete.)
- **Broadcast check (parent §5a):** confirm at kickoff no DB trigger broadcasts on public-campaign INSERT — a
  migration grep finds only *constraint* triggers on `campaigns` (low risk), but §3a's public-campaign volume
  makes the check explicit; the harness inserts campaigns directly, bypassing
  `send-campaign-publish-notifications`.
- **Cost guardrail (new):** `max_shards` cap in the workflow; Actions-minute cost scales with S×duration
  (cheap at the 50K rung — the reason the VM fleet is deferred to Slice 2).
- **Test-Stripe-only** boot assertion unchanged.

## 8. Files

**New:** `.github/workflows/synthetic-load-matrix.yml` (setup → dynamic matrix load job);
migration `<ts>_sim_load_matrix_rpcs.sql` (`get_sim_load_matrix_summary`, service-role only);
migration `<ts>_sim_content_seed.sql` (`seed_synthetic_content` — **public-free** campaigns + DragonShare video
posts + `file_uploads` + per-bot avatars/geo, `is_synthetic`-tagged, service-role only; **invoked via a new
`bulk-seed --with-content` step**; writes `profiles`/`creator_profiles` (avatar + lat/long), `campaigns`
(`group_id IS NULL`), `dragonshare_posts` (`verified_by` pinned **NULL** — its FK to `auth.users` is NO
ACTION), `file_uploads` — so `mint.ts` stays unchanged).
**Modified:** `sim/run.ts` (`cmdLoad`: new flags `--shard`/`--shards`/`--concurrency`/`--soak-ms`; new
`readActiveLoadCohort(shard,shards)` selector — `botla…`-only + deterministic `ORDER BY email`; **`makeBotFor`
made refresh-aware** — rebuild the cached client on token rotation); `sim/load/driver.ts` (fixed-concurrency
soak-hold with mid-window token refresh + an **`isEnabled()`-injected periodic kill-switch re-check** + the
§3a **behavior-mix weighting** (video/media fetch, geo near-me, mobile:desktop split, sampled content-write +
notification/Donny-footprint) and a distinct **realtime sub-leg** holding presence/conversation channels with
its own concurrency accounting);
`src/pages/internal/InternalSimulation.tsx` (summed matrix curve);
`docs/runbooks/synthetic-load-tier-ramp.md` (matrix section: dispatch, shard-count ramp, aggregation read,
larger-cohort teardown).
**Reuse (no change):** safety spine, `seed_synthetic_cohort`, `capture_sim_load_snapshot`, `mint.ts`,
`session-pool.ts`, `env.ts`, `synthetic-weight.yml`.

## 9. Verification

- **Unit** (fake-auth-server + pure-function, mirroring the existing `sim/` suite): shard-slice selection —
  assert `readActiveLoadCohort` **applies the deterministic `ORDER BY email` and filters to `botla…` only**,
  so slices are disjoint even from an unordered, mixed (`bot0##`+`botla`) input; soak-refresh — assert the
  **cached bot client is rebuilt on token rotation** (not merely the pool refreshed), **0 re-mints**;
  matrix-summary aggregation (sums client metrics, peaks the DB reading); `max_shards` cap rejects an
  over-limit input.
- **Live, founder-gated:** a **2-shard smoke** proving distinct egress IPs, summed concurrency, **no
  cross-shard 429**, byte-identical segregation, and clean teardown (residue 0, live 25 survive) — *before*
  any full ramp.
- **Load:** stepping S drives `sim_load_snapshots` toward the whole-system knee; `get_sim_load_matrix_summary`
  reconciles summed client throughput with the DB-side peak; observability stays responsive (knee, not outage).
- **Realtime leg:** the sub-leg opens/holds presence + conversation channels and exchanges messages under the
  Realtime quota; its concurrency is recorded separately (the WebSocket axis is **not** the 90 DB connections).
- **Gates:** `npm run build` / `typecheck` / `test`; **edge-function-reviewer + data-exposure-reviewer** on the
  new RPC + workflow (service-role, prod); **Codex** second review before the PR; the **`careful`** gate before
  the first prod matrix dispatch.

## 10. Open questions / risks

- **Single-DB observability under real load.** Once shards actually load the DB, `capture_sim_load_snapshot`
  itself competes for a connection; at the true knee the snapshot may degrade. Mitigated by knee-not-outage
  (we stop before saturation) — but note it as a measurement caveat.
- **PostgREST/pooler in front of the 90 connections.** The app's data API already reuses connections; the
  *effective* ceiling at scale is the pooler config, not raw `max_connections`. Quantifying that is a Slice 2
  question; Slice 1 just measures where degradation first appears at the current config.
- **Realtime is a separate ceiling.** Supabase Realtime (WebSockets) has its own concurrent-connection /
  message quota independent of the 90 DB connections; the realtime sub-leg can saturate *before* the DB, and
  its per-plan limit must be checked — a REST-only reading can look healthy while realtime is already maxed.
- **Actions-minute cost at higher rungs.** Fine at S≤10 (50K); at S≈80 (1M) GH minutes become significant —
  the concrete trigger to migrate to the VM fleet (Slice 2).
- **GH runner concurrency limits.** The account's max concurrent runners caps S per dispatch; verify the plan's
  limit before assuming a given S is reachable in one window.
- **Same-second mint thundering herd.** All shards mint at job start; each is a distinct IP (25/IP) so no per-IP
  429, but confirm no *global* GoTrue rate limit bites at S×25 near-simultaneous mints; stagger if needed.
- **The dominant 1M-DAU costs are video egress (CDN) + AI generation, not Postgres.** A healthy DB knee at 50K
  does **not** mean "1M DAU is affordable" — the money question at scale is storage/CDN egress + AI $, which is
  **Slice 2's cost model**. Do not let a green DB reading read as a cost green-light.
