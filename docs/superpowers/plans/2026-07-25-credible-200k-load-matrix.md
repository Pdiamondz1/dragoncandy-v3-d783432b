# Credible 200K-DAU Load Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the synthetic load matrix drive real, bounded storage egress and report a summed concurrency that can't be inflated by staggered shards, then scale it to the ~200K-DAU band.

**Architecture:** Five code tasks on the existing merged matrix (Slice 1), then a founder-gated live execution sequence. Tasks 1–2 add real Range-capped GET egress + media latency through the existing `HotAction`/`MediaResult`/driver seam. Task 3 replaces the summary RPC's naive per-shard sum with a bin-width-independent event-sweep. Task 4 surfaces the new figures on `/internal`. Task 5 lifts the shard ceiling + updates the runbook. The live probe→cap→200K→verify→teardown run is documented as the execution section (run after merge, at the careful gate).

**Tech Stack:** TypeScript (strict) + Vitest for `sim/`; Supabase Postgres (SECURITY DEFINER RPC + migration); React + React Query for `/internal`; GitHub Actions matrix workflow.

**Spec:** `docs/superpowers/specs/2026-07-25-credible-200k-load-matrix-design.md` (reviewer-approved).

## Global Constraints

Every task implicitly includes these (copied from the spec):

- **Synthetic-only, `botla`-scoped.** All load drives the isolated `botla…` cohort the scoped teardown (`purge_synthetic_load_cohort()`) cleans. Never the live `bot0##` 25.
- **Single-runner path stays byte-unchanged.** The driver default remains `DAU_READ_ACTIONS` (reads only); writes are matrix-only. Do not alter single-runner behavior.
- **Media errors are NOT breakages.** A media fetch failure (our storage 5xx/403/timeout) returns `{ ok:false }`, is tallied apart from breakage, and never trips the DB-saturation knee.
- **Bounded egress.** `media_fetch` GET is Range-capped (default 256 KiB = 262144 bytes); the egress run uses a short ~2-min soak (override the 30-min `soak_ms` default).
- **Summary RPC security posture unchanged:** SECURITY DEFINER, `set search_path = public`, in-body `is_internal_user()` guard, `revoke … from anon, public`, `grant … to authenticated`. Run `get_advisors` after apply.
- **Migration timestamp** strictly after `20260724183000` AND after the marketplace migrations `20260725130000`; collision-check with `git grep` (bare 14-digit numbers are hidden by the Grep tool — use `git grep -n 20260725140000` across worktrees) before locking it.
- **No `types.ts` regen** — the hook keeps its hand-typed `rpc` cast; extend the hand-written `SimLoadMatrixSummary` interface instead.
- **Prod apply is founder-gated** (careful skill). Task 3 delivers the migration FILE + verification query only; applying to prod happens in the Execution section with a founder go.
- **Run tests from the worktree** (`C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/synthetic-load-matrix-200k`) with the specific file (the full suite has pre-existing e2e file failures — trust "N passed, 0 failed" for the named file).

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `sim/load/driver.ts` | `MediaResult.ms`; collect media latency per step; write `media_ms_p50/p95` to snapshot notes; `StepMetrics.mediaMsP50/P95`; `TaskOutcome.mediaMs` | 1 |
| `sim/load/driver.test.ts` | Media-latency tally test | 1 |
| `sim/load/actions-mix.ts` | `media_fetch` = Range-capped GET of real public storage; latency inside the fetch; real default URL pool; `rangeCapBytes`/`now` options | 2 |
| `sim/load/actions-mix.test.ts` | Rewrite the 3 media_fetch tests (HEAD→GET+Range+ms) | 2 |
| `supabase/migrations/20260725140000_sim_load_matrix_overlap_summary.sql` | Event-sweep honest peak + `max_concurrent_shards` + `media_errors` + `media_ms_p95_peak`; keep naive `offered_concurrency` | 3 |
| `src/hooks/internal/useSimLoadMatrixSummary.ts` | Extend `SimLoadMatrixSummary` with the 4 new fields | 4 |
| `src/pages/internal/InternalSimulation.tsx` | `MatrixSummaryCard`: honest-peak/overlap/media-error/media-latency StatCards | 4 |
| `.github/workflows/synthetic-load-matrix.yml` | `MAX_SHARDS: "10"` → `"20"` | 5 |
| `docs/runbooks/synthetic-load-tier-ramp.md` | Matrix section: real egress, probe→cap→200K sequence, honest-peak read | 5 |

---

## Task 1: Media latency in the driver

**Files:**
- Modify: `sim/load/driver.ts` (`MediaResult`, `StepMetrics`, `TaskOutcome`, `runOneTask`, the step loop's tally + both snapshot-notes objects)
- Test: `sim/load/driver.test.ts`

**Interfaces:**
- Produces: `MediaResult.ms?: number` (fetch-only latency, set by `media_fetch` in Task 2); snapshot notes gain `media_ms_p50` / `media_ms_p95`; `StepMetrics.mediaMsP50?` / `mediaMsP95?`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test** — append to `sim/load/driver.test.ts` inside the existing `describe("runLoad — media-egress proxy tally …")` block (reuse its `baseDeps()`/`captured` harness):

```ts
  it("tallies media latency (p95) from the action's ms into StepMetrics + snapshot notes", async () => {
    captured.length = 0;
    // Every task returns ms:42 → p50 and p95 are both 42.
    const media: HotAction = { name: "media_fetch", weight: 1, run: async () => ({ bytes: 1000, ok: true, ms: 42 }) };
    const result = await runLoad({ ...baseDeps(), actions: [media] });
    expect(result.steps[0].metrics.mediaMsP95).toBe(42);
    expect(result.steps[0].metrics.mediaMsP50).toBe(42);
    // The LAST captured snapshot (final per-step) carries the media latency for the aggregation RPC.
    expect(captured.at(-1)?.media_ms_p95).toBe(42);
  });

  it("a read action (no ms) leaves media latency at 0", async () => {
    captured.length = 0;
    const read: HotAction = { name: "campaign_browse", weight: 1, run: async () => {} };
    const result = await runLoad({ ...baseDeps(), actions: [read] });
    expect(result.steps[0].metrics.mediaMsP95).toBe(0);
    expect(captured.at(-1)?.media_ms_p95).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/load/driver.test.ts`
Expected: FAIL — `mediaMsP95` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Implement** — four edits in `sim/load/driver.ts`:

(a) Add `ms` to `MediaResult` (after the `ok?` field, ~line 308):

```ts
  /** Fetch-only latency (ms) measured INSIDE the media action — the egress signal. Distinct from the
   *  driver's per-task `ms`, which also includes the `botFor` client lookup the media action skips. */
  ms?: number;
```

(b) Add media-latency fields to `StepMetrics` (after `mediaErrors?`, ~line 148):

```ts
  /** Media request latency (fetch-only) percentiles this step — the egress-saturation signal. */
  mediaMsP50?: number;
  mediaMsP95?: number;
```

(c) In `TaskOutcome` add `mediaMs` (after `mediaError`, ~line 409), and set it in `runOneTask` (~line 449-455):

```ts
  /** Fetch-only latency (ms) reported by a media action (0 for reads / a media action without ms). */
  mediaMs: number;
```

In `runOneTask`, in the `try` return add the extraction + field:

```ts
    const isMedia = typeof res === "object" && res !== null;
    const bytes = isMedia && typeof (res as MediaResult).bytes === "number" ? (res as MediaResult).bytes! : 0;
    const mediaError = isMedia && (res as MediaResult).ok === false;
    const mediaMs = isMedia && typeof (res as MediaResult).ms === "number" ? (res as MediaResult).ms! : 0;
    return { ok: true, ms: now() - startedAt, endpoint: action.name, kind: "ok", status: null, error: "", isMedia, bytes, mediaError, mediaMs };
```

And in the `catch` return add `mediaMs: 0` (alongside `isMedia: false, bytes: 0, mediaError: false`).

(d) In the step loop of `runLoad`: declare a latency array next to `mediaErr` (~line 488):

```ts
    const mediaLatencies: number[] = []; // fetch-only media latencies this step (for p50/p95)
```

Collect it in the outcomes fold (next to `if (o.mediaError) mediaErr += 1;`, ~line 534):

```ts
      if (o.isMedia && o.mediaMs > 0) mediaLatencies.push(o.mediaMs);
```

Add the two keys to the **in-flight sample** notes object (~line 519-522, next to `media_errors`):

```ts
              media_errors: mediaErr,
              media_ms_p50: percentile(mediaLatencies, 50),
              media_ms_p95: percentile(mediaLatencies, 95),
```

Add the two fields to the `StepMetrics` literal (~line 564-566, after `mediaErrors: mediaErr,`):

```ts
      mediaMsP50: percentile(mediaLatencies, 50),
      mediaMsP95: percentile(mediaLatencies, 95),
```

Add the two keys to the **final per-step snapshot** notes object (~line 580-584, after `media_errors: mediaErr,`):

```ts
      media_errors: mediaErr,
      media_ms_p50: metrics.mediaMsP50,
      media_ms_p95: metrics.mediaMsP95,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/load/driver.test.ts`
Expected: PASS (all prior driver tests still green — the new fields are additive/optional).

- [ ] **Step 5: Commit**

```bash
git add sim/load/driver.ts sim/load/driver.test.ts
git commit -m "feat(sim): media latency (p50/p95) tally in the load driver"
```

---

## Task 2: Real Range-capped GET egress in media_fetch

**Files:**
- Modify: `sim/load/actions-mix.ts` (`BuildMixOptions`, `media_fetch`, `SAMPLE_MEDIA_URLS`)
- Test: `sim/load/actions-mix.test.ts` (rewrite the 3 existing `media_fetch` tests)

**Interfaces:**
- Consumes: `MediaResult.ms` (Task 1).
- Produces: `media_fetch` returns `{ bytes, ok, ms }` from a real Range-capped GET; `buildHotActions({ mediaUrls, fetchImpl, rangeCapBytes, now })`.

- [ ] **Step 1: Source the real media pool (prod query, not code yet).** Run via Supabase MCP `execute_sql` (`project_id: "zocahiffooqdybdhguqv"`), ONE statement:

```sql
select bucket_id, name
from storage.objects
where bucket_id in ('dragonshare-content','help-screenshots')
order by bucket_id, name
limit 24;
```

Build public URLs as `https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/<bucket_id>/<name>` (URL-encode spaces). Verify 4–8 of them return 200/206 to a Range GET (`curl -sI -H 'Range: bytes=0-1023' <url>` or a quick fetch). Keep the reachable ones — prefer `dragonshare-content` (real serving path); fall back to `help-screenshots`. These become the new `SAMPLE_MEDIA_URLS` in Step 3.

- [ ] **Step 2: Write the failing tests** — replace the three existing `media_fetch` tests (currently asserting HEAD + `{ bytes, ok }`, `actions-mix.test.ts:110-132`) with:

```ts
  it("media_fetch does a Range-capped GET of a real object and returns { bytes, ok, ms }", async () => {
    let method: string | undefined;
    let range: string | undefined;
    const body = new Uint8Array(1234);
    const fetchImpl = (async (_url: string, o?: { method?: string; headers?: Record<string, string> }) => {
      method = o?.method;
      range = o?.headers?.Range;
      return { ok: true, status: 206, arrayBuffer: async () => body.buffer };
    }) as unknown as typeof fetch;
    const now = (() => { const seq = [100, 142]; let i = 0; return () => seq[i++]; })(); // t0=100, end=142 → ms=42
    const media = buildHotActions({ mediaUrls: ["http://cdn/vid.mp4"], fetchImpl, now }).find((a) => a.name === "media_fetch")!;
    const res = await media.run({} as SupabaseClient, ctx);
    expect(method).toBe("GET");
    expect(range).toBe("bytes=0-262143"); // default 256 KiB cap
    expect(res).toEqual({ bytes: 1234, ok: true, ms: 42 });
  });

  it("media_fetch honors a custom rangeCapBytes", async () => {
    let range: string | undefined;
    const fetchImpl = (async (_url: string, o?: { headers?: Record<string, string> }) => {
      range = o?.headers?.Range;
      return { ok: true, status: 206, arrayBuffer: async () => new ArrayBuffer(10) };
    }) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x"], fetchImpl, rangeCapBytes: 1024 }).find((a) => a.name === "media_fetch")!;
    await media.run({} as SupabaseClient, ctx);
    expect(range).toBe("bytes=0-1023");
  });

  it("media_fetch does NOT throw on a non-2xx response — returns { bytes:0, ok:false } with ms", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    const res = await media.run({} as SupabaseClient, ctx);
    expect(res.bytes).toBe(0);
    expect(res.ok).toBe(false);
    expect(typeof res.ms).toBe("number");
  });

  it("media_fetch does NOT throw on a network error — returns { bytes:0, ok:false } with ms", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    const res = await media.run({} as SupabaseClient, ctx);
    expect(res).toMatchObject({ bytes: 0, ok: false });
    expect(typeof res.ms).toBe("number");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run sim/load/actions-mix.test.ts`
Expected: FAIL — current `media_fetch` sends HEAD (no Range, no `arrayBuffer`, no `ms`).

- [ ] **Step 4: Implement** — three edits in `sim/load/actions-mix.ts`:

(a) Extend `BuildMixOptions` (~line 64):

```ts
export interface BuildMixOptions {
  /** Media pool for media_fetch (default SAMPLE_MEDIA_URLS). */
  mediaUrls?: string[];
  /** Injectable fetch for offline tests (default: global fetch). */
  fetchImpl?: typeof fetch;
  /** Hard per-request egress cap in bytes via a Range header (default 256 KiB). */
  rangeCapBytes?: number;
  /** Injectable clock for deterministic latency in tests (default Date.now). */
  now?: () => number;
}
```

(b) In `buildHotActions`, read the new options (~line 76):

```ts
  const mediaUrls = opts.mediaUrls?.length ? opts.mediaUrls : SAMPLE_MEDIA_URLS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const rangeCapBytes = opts.rangeCapBytes ?? 262144; // 256 KiB
  const now = opts.now ?? Date.now;
```

(c) Replace the `media_fetch` action (currently `actions-mix.ts:108-127`) with:

```ts
    {
      // Real storage-egress: a Range-capped GET of a public DragonCandy Storage object (Slice 2).
      // Exercises the true serving path (DNS→TLS→Supabase Storage→S3) with a hard byte cap so cost is
      // computable. Returns { bytes, ok, ms }; a non-2xx / network error is a media ERROR, never a throw.
      name: "media_fetch",
      weight: 15,
      run: async (): Promise<MediaResult> => {
        const url = pick(mediaUrls);
        const t0 = now();
        try {
          const res = await fetchImpl(url, { method: "GET", headers: { Range: `bytes=0-${rangeCapBytes - 1}` } });
          // 200 and 206 (Partial Content) are both res.ok (200–299). 403/404/416/5xx → media error.
          if (!res.ok) return { bytes: 0, ok: false, ms: now() - t0 };
          const buf = await res.arrayBuffer();
          return { bytes: buf.byteLength, ok: true, ms: now() - t0 };
        } catch {
          return { bytes: 0, ok: false, ms: now() - t0 };
        }
      },
    },
```

(d) Replace the `SAMPLE_MEDIA_URLS` array body (`actions-mix.ts:40-45`) with the reachable URLs from Step 1 and update its doc comment (drop the stale GCS/403 note; state these are real public DragonCandy Storage objects, GET-able with Range). Keep the `export const SAMPLE_MEDIA_URLS: string[]` name.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run sim/load/actions-mix.test.ts`
Expected: PASS (the other actions-mix tests — read mix, writes — unchanged).

- [ ] **Step 6: Commit**

```bash
git add sim/load/actions-mix.ts sim/load/actions-mix.test.ts
git commit -m "feat(sim): media_fetch does real Range-capped GET egress of public storage"
```

---

## Task 3: Overlap-honest matrix summary RPC

**Files:**
- Create: `supabase/migrations/20260725140000_sim_load_matrix_overlap_summary.sql` (collision-check the timestamp first — see Global Constraints)

**Interfaces:**
- Produces: `get_sim_load_matrix_summary(text)` returns the existing keys PLUS `honest_peak_concurrency`, `max_concurrent_shards`, `media_errors`, `media_ms_p95_peak`.

> No vitest for SQL in this repo (mirrors Slice 1's `20260724183000`). The "test" is the rollback-wrapped verification query embedded in the migration and run at the founder-gated apply (Execution section). The implementer writes the migration + the verification block; it is NOT applied to prod in this task.

- [ ] **Step 1: Collision-check the timestamp**

```bash
git -C "C:/GIT/dragoncandy-v3-d783432b" grep -n "20260725140000" || echo "free"
```
Expected: `free` (if it prints a hit, bump to `20260725140001` and re-check).

- [ ] **Step 2: Write the migration** — create the file with a `create or replace` that keeps every current output and adds the four new keys via an event-sweep. Body:

```sql
-- Overlap-honest matrix summary (Slice 2). Replaces the naive per-shard sum's blind spot: staggered/
-- queued shards (GitHub runner cap) no longer inflate offered concurrency. Adds an EVENT-SWEEP honest
-- peak (max over time of summed per-shard concurrency among shards actually overlapping) + the media
-- egress signals (errors, p95 latency). Naive offered_concurrency is kept so the gap is visible.
-- Security posture unchanged from 20260724183000: SECURITY DEFINER + in-body is_internal_user() +
-- revoke anon/public, grant authenticated. Apply is founder-gated (careful). Read-only.
create or replace function public.get_sim_load_matrix_summary(p_run_label text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_internal_user() then
    raise exception 'get_sim_load_matrix_summary: internal access required' using errcode = '42501';
  end if;

  with snap as (
    select * from public.sim_load_snapshots where run_label = p_run_label
  ),
  per_shard as (
    select distinct on (notes->>'shard')
      notes->>'shard'                                  as shard,
      coalesce((notes->>'concurrency')::bigint, 0)     as concurrency,
      coalesce((notes->>'count')::bigint, 0)           as requests,
      coalesce((notes->>'ok')::bigint, 0)              as ok,
      coalesce((notes->>'breakage')::bigint, 0)        as breakage,
      coalesce((notes->>'throttled')::bigint, 0)       as throttled,
      coalesce((notes->>'media_requests')::bigint, 0)  as media_requests,
      coalesce((notes->>'media_bytes')::bigint, 0)     as media_bytes,
      coalesce((notes->>'media_errors')::bigint, 0)    as media_errors,
      coalesce((notes->>'p95_ms')::numeric, 0)         as p95_ms,
      coalesce((notes->>'media_ms_p95')::numeric, 0)   as media_ms_p95
    from snap
    where notes ? 'shard'
    order by notes->>'shard', captured_at desc
  ),
  -- Each shard's active interval + its fixed-C concurrency.
  shard_iv as (
    select notes->>'shard'                                as shard,
           min(captured_at)                               as t0,
           max(captured_at)                               as t1,
           max(coalesce((notes->>'concurrency')::bigint, 0)) as c
    from snap
    where notes ? 'shard'
    group by notes->>'shard'
  ),
  -- Sweep at every snapshot instant (each shard's t0 is itself an instant, so the true max-overlap
  -- instant is always evaluated — the peak is exact, no bin-width parameter).
  instants as (
    select distinct captured_at as t from snap where notes ? 'shard'
  ),
  per_instant as (
    select i.t, sum(s.c) as conc_sum, count(*) as shards_active
    from instants i
    join shard_iv s on i.t >= s.t0 and i.t <= s.t1
    group by i.t
  )
  select jsonb_build_object(
    'run_label',               p_run_label,
    'shards',                  (select count(*) from per_shard),
    'offered_concurrency',     coalesce((select sum(concurrency) from per_shard), 0),   -- naive Σ (kept)
    'honest_peak_concurrency', coalesce((select max(conc_sum) from per_instant), 0),    -- overlap-honest
    'max_concurrent_shards',   coalesce((select max(shards_active) from per_instant), 0),
    'requests',                coalesce((select sum(requests) from per_shard), 0),
    'ok',                      coalesce((select sum(ok) from per_shard), 0),
    'breakage',                coalesce((select sum(breakage) from per_shard), 0),
    'throttled',               coalesce((select sum(throttled) from per_shard), 0),
    'media_requests',          coalesce((select sum(media_requests) from per_shard), 0),
    'media_bytes',             coalesce((select sum(media_bytes) from per_shard), 0),
    'media_errors',            coalesce((select sum(media_errors) from per_shard), 0),
    'media_ms_p95_peak',       coalesce((select max(media_ms_p95) from per_shard), 0),
    'p95_ms',                  coalesce((select max(p95_ms) from per_shard), 0),
    'db_active_conn_peak',     coalesce((select max(active_connections) from snap), 0),
    'db_avg_query_ms_peak',    coalesce((select max(avg_query_ms) from snap), 0),
    'max_connections',         coalesce((select max(max_connections) from snap), 0),
    'storage_bytes',           (select storage_bytes from public.platform_weight order by captured_at desc limit 1)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_sim_load_matrix_summary(text) from anon, public;
grant  execute on function public.get_sim_load_matrix_summary(text) to authenticated;
```

- [ ] **Step 3: Embed the verification block** (as a trailing SQL comment in the migration, mirroring `20260724183000`). Two rollback-wrapped fixtures — overlapping (honest == naive) and staggered (honest < naive):

```sql
-- ===== VERIFICATION (coordinator runs at the careful gate — NOT applied by this migration) =====
-- One statement per MCP execute_sql call. OVERLAP case (honest == naive):
--   begin;
--     insert into sim_load_snapshots (run_label, captured_at, active_connections, max_connections, avg_query_ms, error_rate, notes) values
--       ('m-ovl','2026-07-25 10:00:00+00',40,90,1.0,0,'{"shard":0,"concurrency":200,"count":50,"ok":50,"throttled":0,"breakage":0,"media_requests":5,"media_bytes":2000,"media_errors":0,"media_ms_p95":80,"p95_ms":100}'),
--       ('m-ovl','2026-07-25 10:00:05+00',45,90,1.1,0,'{"shard":0,"concurrency":200,"count":100,"ok":100,"throttled":0,"breakage":0,"media_requests":10,"media_bytes":4000,"media_errors":1,"media_ms_p95":90,"p95_ms":110}'),
--       ('m-ovl','2026-07-25 10:00:00+00',50,90,1.2,0,'{"shard":1,"concurrency":200,"count":60,"ok":60,"throttled":0,"breakage":0,"media_requests":6,"media_bytes":2500,"media_errors":0,"media_ms_p95":85,"p95_ms":120}'),
--       ('m-ovl','2026-07-25 10:00:05+00',55,90,1.3,0,'{"shard":1,"concurrency":200,"count":120,"ok":118,"throttled":2,"breakage":0,"media_requests":12,"media_bytes":5000,"media_errors":2,"media_ms_p95":95,"p95_ms":130}');
--     select set_config('request.jwt.claim.sub', (select user_id::text from internal_users limit 1), true);
--     set local role authenticated;
--     select public.get_sim_load_matrix_summary('m-ovl');
--       -- expect offered_concurrency=400, honest_peak_concurrency=400, max_concurrent_shards=2,
--       --        requests=220, media_requests=22, media_errors=3, media_ms_p95_peak=95.
--   rollback;
-- STAGGER case (honest < naive — the bug this migration fixes):
--   begin;
--     insert into sim_load_snapshots (run_label, captured_at, active_connections, max_connections, avg_query_ms, error_rate, notes) values
--       ('m-stg','2026-07-25 11:00:00+00',40,90,1.0,0,'{"shard":0,"concurrency":200,"count":100,"ok":100,"throttled":0,"breakage":0,"media_requests":10,"media_bytes":4000,"media_errors":0,"media_ms_p95":80,"p95_ms":100}'),
--       ('m-stg','2026-07-25 11:59:00+00',45,90,1.1,0,'{"shard":1,"concurrency":200,"count":100,"ok":100,"throttled":0,"breakage":0,"media_requests":10,"media_bytes":4000,"media_errors":0,"media_ms_p95":90,"p95_ms":110}');
--     select set_config('request.jwt.claim.sub', (select user_id::text from internal_users limit 1), true);
--     set local role authenticated;
--     select public.get_sim_load_matrix_summary('m-stg');
--       -- expect offered_concurrency=400 (naive) BUT honest_peak_concurrency=200, max_concurrent_shards=1
--       --        (shard 0 only at 11:00:00, shard 1 only at 11:59:00 — never simultaneous).
--   rollback;
```

- [ ] **Step 4: Static check** — confirm the file is syntactically consistent with `20260724183000` (same header/guard/grant shape) by reading both. There is no local SQL runner; correctness is proven by the verification block at apply time (Execution section).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260725140000_sim_load_matrix_overlap_summary.sql
git commit -m "feat(sim): overlap-honest matrix summary (event-sweep peak + media egress signals)"
```

---

## Task 4: Surface honest peak + media egress on /internal

**Files:**
- Modify: `src/hooks/internal/useSimLoadMatrixSummary.ts` (interface only)
- Modify: `src/pages/internal/InternalSimulation.tsx` (`MatrixSummaryCard` StatCards)

**Interfaces:**
- Consumes: the four new RPC keys from Task 3.

> UI task — verified by `npm run typecheck` + `npm run build` (matches Slice 1's UI task, which carried no unit test). The hand-typed `rpc` cast stays; only the interface + JSX change.

- [ ] **Step 1: Extend the interface** — in `useSimLoadMatrixSummary.ts`, add to `SimLoadMatrixSummary` (after `offered_concurrency`, and near `media_*`):

```ts
  /** Overlap-honest peak: max over time of summed concurrency among shards actually running at once. */
  honest_peak_concurrency: number;
  /** Most shards observed running simultaneously (bounds the honest peak; reveals the GitHub runner cap). */
  max_concurrent_shards: number;
  media_errors: number;
  /** Peak media (fetch-only) p95 latency across shards — the egress-saturation signal. */
  media_ms_p95_peak: number;
```

- [ ] **Step 2: Add StatCards** — in `InternalSimulation.tsx` `MatrixSummaryCard`, change the "Offered concurrency" card's `sub` to flag it as the naive sum, and add four cards inside the grid (`InternalSimulation.tsx:69-95`):

```tsx
        <StatCard
          label="Honest peak concurrency"
          value={data.honest_peak_concurrency}
          sub={`${data.max_concurrent_shards} shards overlapped`}
          accent="pink"
        />
        <StatCard
          label="Offered concurrency"
          value={data.offered_concurrency}
          sub={`naive Σ across ${data.shards} shards`}
        />
```

(replace the existing "Offered concurrency" card with these two — honest first), and after the media cards add:

```tsx
        <StatCard label="Media errors" value={data.media_errors} sub="egress failures (not breakage)" />
        <StatCard label="Media p95 latency" value={fmtMs(data.media_ms_p95_peak)} sub="peak across shards" />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: PASS (no `any`, all new fields typed).

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/internal/useSimLoadMatrixSummary.ts src/pages/internal/InternalSimulation.tsx
git commit -m "feat(internal): show honest peak concurrency + media egress signals on the matrix card"
```

---

## Task 5: Lift the shard ceiling + runbook

**Files:**
- Modify: `.github/workflows/synthetic-load-matrix.yml` (`MAX_SHARDS`)
- Modify: `docs/runbooks/synthetic-load-tier-ramp.md` (matrix section)

- [ ] **Step 1: Raise MAX_SHARDS** — in `.github/workflows/synthetic-load-matrix.yml`, change `env.MAX_SHARDS` (line 52):

```yaml
env:
  MAX_SHARDS: "20"
```

- [ ] **Step 2: Update the runbook matrix section** — in `docs/runbooks/synthetic-load-tier-ramp.md`, add/adjust the matrix subsection to document: (a) media_fetch now does real Range-capped GET egress of `dragonshare-content`/`help-screenshots` (real egress cost — bounded by the 256 KiB cap + short soak); (b) the credible-200K sequence — **probe the per-shard knee with a single-runner `load --ramp` (real media fires), then a full-`MAX_SHARDS` dispatch to read `max_concurrent_shards` (the runner cap), then the 200K run at `~16 × C` with `soak_ms=120000`**; (c) read `honest_peak_concurrency` + `max_concurrent_shards` (not the naive `offered_concurrency`) from `get_sim_load_matrix_summary`; (d) `MAX_SHARDS` is now 20. Keep the existing teardown line (`purge_synthetic_load_cohort()`).

- [ ] **Step 3: Verify the workflow still parses** — confirm the YAML is well-formed (indentation unchanged; only the quoted value changed). No runner dispatch here.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/synthetic-load-matrix.yml docs/runbooks/synthetic-load-tier-ramp.md
git commit -m "chore(sim): MAX_SHARDS 10->20 + runbook for the credible-200K egress run"
```

---

## Execution (founder-gated, after merge — NOT part of the task loop)

Run only after all tasks merge to `main` and the migration is applied. Each prod step is a `careful`-gated action; quote the exact command and wait for a founder go.

1. **Apply the migration** (careful gate): `mcp apply_migration` for `20260725140000_sim_load_matrix_overlap_summary.sql`; run BOTH verification fixtures (overlap → honest==naive==400; stagger → honest=200, naive=400); `get_advisors` clean (only the expected mitigated authenticated-definer WARN). No-op on real data (read-only RPC).
2. **Probe the per-shard knee with real media** — single-runner: `gh workflow run synthetic-weight.yml` (or the `load` command) with `--ramp` (e.g. `50/400/1.6`); read the curve for the concurrency where media p95 latency / media error rate / transport breakage knees. Record `C_knee`; use `C = C_knee` shaded down one step (single-runner omits the ~10% write leg).
3. **Discover the runner cap** — dispatch `synthetic-load-matrix.yml` with `shards=20`, a SHORT `soak_ms` (e.g. 120000), `seed=true`; read `max_concurrent_shards` from the summary — that is the GitHub concurrent-runner cap.
4. **The 200K run** — dispatch `shards = min(16, cap)`, `concurrency = C` (from step 2), `soak_ms=120000`, `run_label=matrix-200k`. Compute + record worst-case egress up front (`≤ requests × 256 KiB`).
5. **Verify + report** — read `honest_peak_concurrency` (target ~4,000, or the cap-limited ceiling), `db_active_conn_peak`/`db_avg_query_ms_peak` (headroom), `media_ms_p95_peak` + `media_errors` (egress ceiling); confirm segregation (real KPIs byte-identical); teardown `purge_synthetic_load_cohort()` residual-verified to zero, live `bot0##` 25 intact. If the cap forced sub-4,000, document the credible ceiling + the path past it (paid plan / self-hosted runners).

---

## Self-Review

**Spec coverage:** §4a real egress → Tasks 1–2; §4b overlap-honest summation → Task 3 (+ UI Task 4); §4c scale → Task 5 (`MAX_SHARDS`) + Execution; §4d execution sequence → Execution section; §5 component table → all five tasks map 1:1; §6 error handling (media error ≠ breakage) → preserved in Task 2 (`ok:false`, no throw) + Task 1 (`mediaError` untouched); §7 testing → driver + actions-mix vitest, migration verification block, typecheck/build for UI; SC #1 (media latency/errors first-class) → Tasks 1+3+4; SC #2 (overlap-honest, staggered-fixture proof) → Task 3 stagger verification; SC #3–5 → Execution. No gaps.

**Placeholder scan:** every code step carries real code; the only deferred concretion is the media-URL list (Task 2 Step 1 sources it from a named prod query) and the migration timestamp (Task 3 Step 1 collision-checks `20260725140000`) — both are explicit procedures, not "TBD".

**Type consistency:** `MediaResult.ms` (Task 1) is produced by `media_fetch` (Task 2) and read in `runOneTask` (Task 1); snapshot notes `media_ms_p95` (Task 1) is aggregated by the RPC's `media_ms_p95_peak` (Task 3) and typed as `media_ms_p95_peak` in the hook + card (Task 4) — names align. `honest_peak_concurrency` / `max_concurrent_shards` / `media_errors` consistent across Tasks 3→4. `rangeCapBytes` default 262144 ↔ Range `bytes=0-262143` consistent between impl and test.
