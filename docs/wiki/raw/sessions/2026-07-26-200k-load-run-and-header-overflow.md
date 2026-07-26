# Session — the 200K-band load run + the 16 KB header wall (2026-07-26)

**Branch/PRs:** `fix/sim-preflight-header-overflow` → **PR #345** (merged `d2a5b040`, 12:26 UTC).
Migration `20260725140000` applied to prod (recorded `20260726024318`). Live runs:
`30190712757` (Slice-2 validation), `30202071632` (cap discovery + the 200K band).
**Continues:** `raw/sessions/2026-07-25-credible-200k-load-matrix-slice2.md` (the Slice-2 build),
`raw/sessions/2026-07-24-synthetic-load-runner-matrix.md` (Slice 1).

This is the session where Slice 2 stopped being *built* and became *run*. Three things
happened: the migration went to prod, the Slice-2 code got its first live exercise, and a
four-times-repeated seed failure that looked exactly like a network outage turned out to be
our own code hitting a Node transport limit.

## 1. Migration applied, then the validation run

`20260725140000_sim_load_matrix_overlap_summary.sql` was applied under the careful gate and
verified through the **deployed** function, not just the file: both embedded fixtures were
replayed against prod — the OVERLAP case returned `offered=400 / honest=400 / shards=2 /
requests=220 / media_errors=3 / media_ms_p95=120`, and the STAGGER case returned
`offered=400 / honest=200 / shards=1`, i.e. the exact inflation the migration exists to
prevent. Both fixtures were run inside a `DO` block ending in `RAISE`, which surfaces the
result *and* rolls the inserted rows back (MCP `execute_sql` returns only the last
statement's result, so a plain multi-statement script would have shown nothing) — confirmed
afterwards by `sim_load_snapshots` carrying zero leaked fixture rows.

The first live exercise (`30190712757`, label `matrix-slice2-val-20260726`, 2 shards ×
C=200 × 120 s) then came back **fully green — all four jobs succeeded**, which the Slice-1
runs never did: they always went red on dead-GCS media 403s. Slice 2's real 206-GET egress
removed that failure mode entirely. `offered=400 == honest_peak=400` over 2 genuinely
overlapping shards (so honest == naive, as it should be when shards really do overlap — the
honest-*below*-naive stagger case had already been proven by fixture); 25,400 requests,
25,400 ok, **0 breakage, 0 throttled**; **302 MB pulled out of prod Storage across 3,785
media requests with 0 media errors**; media p95 1,070 ms; DB 22/90 connections at 7.91 ms.

## 2. Four dead dispatches, and a wrong theory held for two hours

Scaling to the 20-shard cap-discovery run failed four consecutive times (runs
`30196778188`, `30197540464`, `30197606182`, `30197827512`, roughly 09:37–10:11 UTC). Every
one died in the **seed** job, within about a second of `tsx` starting, on the same line:

```
[bulk-seed] active-namespace pre-flight query failed: TypeError: fetch failed
```

`npm ci` in the same job succeeded, so the runner clearly had general egress. `botla` was 0
every time — nothing was seeded, prod stayed clean. My MCP calls reached Supabase fine
throughout.

The obvious reading was a network/IP problem between GitHub runners and Supabase, and that
is what I pursued: checked Supabase network restrictions (off, all IPs allowed), checked
network bans (zero), checked Supabase status (all systems operational; the only recent
incident, an Auth one on 07-25, was resolved). All negative, and a fourth retry failed
identically — persistent, not a blip. The written-down next step was "wait and retry, or add
an `err.cause` log to see ENOTFOUND vs ECONNRESET."

**The discriminator that killed the theory was already in the log.** `cmdBulkSeed` runs
`bootGate` — which performs a real Supabase query (`readKillSwitch`) — *before* the
pre-flight. We were seeing the pre-flight error, not the fail-closed boot error. Supabase
had therefore been reachable milliseconds earlier **in the same process**. That single
ordering fact makes "the runner can't reach Supabase" impossible, and it was observable
from the first failure.

## 3. Root cause: an unbounded `.in()` overflows undici's 16 KB header limit

`.in()` serialises every value into the URL query string, and PostgREST echoes the request
URI back in the **`Content-Location` response header**. At 500 emails that header is ~21 KB,
which blows Node/undici's 16 KB `maxHeaderSize` → `UND_ERR_HEADERS_OVERFLOW`. Because it is
a transport-layer failure it is **not** a `PostgrestError`, so it never reaches the `error`
branch that would have named it — it surfaces as the opaque `TypeError: fetch failed`, which
reads exactly like a network fault.

Reproduced against prod REST with the real key, same process:

| emails | URL chars | result |
|-|-|-|
| 50 | 2,124 | HTTP 200 (the 2-shard seed that passed) |
| 250 | 10,475 | HTTP 200 |
| 400 | 16,775 | `UND_ERR_HEADERS_OVERFLOW` |
| 500 | 20,975 | `UND_ERR_HEADERS_OVERFLOW` (the 20-shard seed) |

**Why it was latent until this exact run:** Slice 1's `MAX_SHARDS = 10` capped the cohort at
25×10 = 250 emails, just under the wall. Slice 2 raised it to 20 → 500 → the first dispatch
that *could* hit it did, deterministically.

**PR #345** chunks at 100 ids/request at both call sites:

- `sim/seed.ts` `assertActiveNamespaceFree` — the confirmed break.
- `sim/mint.ts` `selectIn` — **latent, and worse**: `readCohort` passes every session-capable
  bot id to `synthetic_users` / `creator_groups` / `campaigns`, so the live 25 + a 20-shard
  500-bot `botla` cohort = 525 UUIDs = 20,590 chars. That would have broken the **daily
  `tick` cron** had a matrix cohort ever been left seeded.

Ordering and fail-loud semantics are unchanged: the pre-flight still throws on the first
batch containing an existing email, and `selectIn` still throws on the first `PostgrestError`.
The tests assert the real constraint — that the built PostgREST URL stays under 16 KB — rather
than asserting the chunk size, and that chunking loses no coverage. Codex passed on the first
round. Verified on prod: chunked = 5 batches, max 4,283 chars, 899 ms, while a single-shot
call still throws in the same process.

## 4. The 200K-band run

Run `30202071632`, label `matrix-cap-20260726e-30202071632.1`, 20 shards × C=200 × 120 s
soak, seed on. First dispatch after the fix. **The seed job passed** — the four prior attempts
had died there in under 35 s — and all 500 `botla` bots minted **from one runner IP**, so the
per-IP 429 backoff holds at 4× the previous 125-bot maximum. All 20 load jobs green.

Every figure below was re-derived directly from `sim_load_snapshots` for this session (the
run's own summary was read off `/internal`; these are an independent replication, including
re-implementing the event sweep in SQL):

| Metric | Value |
|-|-|
| Offered concurrency (naive Σ) | 4,000 |
| **`honest_peak_concurrency`** | **4,000** |
| **`max_concurrent_shards`** | **20** |
| Requests / ok | 31,000 / 31,000 |
| Breakage / throttled | **0 / 0** |
| Media requests / bytes / errors | 4,669 / **369,515,017 B (≈369 MB)** / **0** |
| Media p95 peak | 975 ms |
| Overall p95 | **18,427 ms** |
| **DB connections peak** | **27 / 90** |
| DB avg query time peak | 11.40 ms |
| Window | 12:29:34 → 12:32:49 UTC (114 snapshots) |

**Cap discovery answered:** honest peak equals naive offered *and* `max_concurrent_shards`
= 20, so GitHub ran all twenty shards genuinely simultaneously — no queuing, no stagger
inflation, and the concurrent-runner cap is **≥ 20** (not discovered from above; 20 is our
`MAX_SHARDS`, not GitHub's ceiling).

**The headline:** at ~4,000 offered concurrency — the 200K-DAU band on the same
80-shards-for-1M model that framed the 50K run — prod's Postgres sat at **27 of 90
connections (~70% idle) with an 11.40 ms average query time**. The database is not the
constraint at 200K.

**The knee moved decisively to the client.** Overall p95 went 1,935 ms (at 400 concurrency)
→ **18,427 ms** (at 4,000). This is Slice 2's predicted effect: real 206-GET egress lowers
the per-shard knee well below Slice 1's HEAD-only ~312, so C=200/shard is now past it.
Note that **the runbook's step-1 knee probe was skipped** — the sequence went validation →
straight to 20 shards at the old C=200. The 18 s p95 is the cost of that shortcut, not a
prod capacity signal; a cleaner 200K profile is more shards at lower per-shard C, which
`MAX_SHARDS=20` currently caps.

**Teardown:** `purge_synthetic_load_cohort()` → 500 purged, every `residual_*` = 0, live
`bot0##` = 25 and the 2,000-profile marketplace cohort untouched, registry back to 2,025
(re-verified in this session: `botla` = 0).

## Gotchas worth keeping

- **A `DO` block that ends in `RAISE` rolls back everything in it, including work you meant
  to keep.** Running `purge_synthetic_load_cohort()` inside the same rollback-wrapped
  fixture pattern silently undid the purge — 500 bots were still present afterwards. The
  `RAISE` trick is for read-only assertions only; a real mutation runs as a plain
  `select purge_synthetic_load_cohort();`.
- **`TypeError: fetch failed` from supabase-js is not necessarily a network fault** — see
  [[Supabase .in() Header Overflow]].
- **DB peak windows differ by aggregation.** `db_active_conn_peak` in the summary RPC is
  `max(active_connections)` over **all** snapshot rows (27 here); a latest-row-per-shard
  aggregation gives 24. Read the RPC body before replicating its numbers.
- Dispatching now works in-session: `Bash(gh workflow run:*)` is allowlisted in the main
  checkout's `.claude/settings.local.json`.

## Known issues / open

- `MAX_SHARDS = 20` caps a lower-C, better-latency 200K profile; raising it is the next lever
  if a cleaner latency number is wanted. DB headroom says the tier is ample either way.
- The pre-scale advisor list from Phase A (~231 `multiple_permissive_policies`, ~158
  `auth_rls_initplan` on hot tables) is still untouched — latent at 27 connections.
- Phase 6 (the realtime WebSocket leg) remains deferred to its own spec.
- The app has 89 `.in()` call sites across 39 files. Most are bounded by a user's own small
  collections, but **none have been audited** against the 16 KB ceiling.
