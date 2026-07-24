-- ============================================================
-- Synthetic Weight Engine — matrix aggregation RPC (runner matrix, Slice 1, Task 5.1).
--
-- get_sim_load_matrix_summary(p_run_label) rolls a multi-shard matrix run's per-shard snapshots up
-- into ONE summed row for the /internal Synthetic Weight dashboard. The runner matrix drives N shards
-- from N IPs, each stamping notes.shard on every capture_sim_load_snapshot; the summed offered
-- concurrency vs the DB-side connection/latency peaks is the whole point (single-runner capped at the
-- ~312 egress wall; the DB stayed 91% idle — see [[project_synthetic_weight_phase_a_load_run]]).
--
-- GRAIN (verified against prod sim_load_snapshots, 2026-07-24 — do NOT re-fabricate):
--   * Per shard, take that shard's row with the LATEST captured_at — NOT max concurrency: in fixed-C
--     soak mode every sample of a shard shares one `concurrency`, and notes.count/ok/throttled/
--     breakage/media_* are CUMULATIVE within the step (driver.ts `seen = latencies.length`), so the
--     latest captured_at row holds that shard's fullest running total.
--   * SUM those shards' concurrency/count/ok/breakage/throttled + media_requests + media_bytes; MAX
--     their p95_ms. DB-side peaks (active_connections, avg_query_ms, max_connections) are MAX across
--     ALL rows of the label. storage_bytes = the latest platform_weight point reading (§5: ~0 growth
--     by design under asset reuse — a point reading, not a delta).
--
-- Columns confirmed on prod: sim_load_snapshots(captured_at,run_label,active_connections,
-- max_connections,avg_query_ms,error_rate,notes jsonb); platform_weight(captured_at,storage_bytes).
-- Driver notes keys: concurrency,count,ok,throttled,breakage,media_requests,media_bytes,p50_ms,
-- p95_ms,shard (matrix mode stamps shard).
--
-- EXPOSURE: SECURITY DEFINER bypasses the sim_load_snapshots `is_internal_user` SELECT RLS, so this
-- RE-ASSERTS is_internal_user() in-body — the /internal dashboard's authenticated caller passes; a
-- non-internal authenticated user and anon do NOT. (The plan's "revoked authenticated" is reconciled
-- here: the dashboard MUST call it, so it is granted to authenticated and gated internally instead —
-- the security posture is preserved by the guard + the anon/public revoke. Run get_advisors after.)
-- Read-only over synthetic telemetry — writes nothing. Apply is founder-gated (careful, Phase 7).
-- ============================================================

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
    -- one row per shard: its fullest (latest captured_at) cumulative sample
    select distinct on (notes->>'shard')
      notes->>'shard'                                  as shard,
      coalesce((notes->>'concurrency')::bigint, 0)     as concurrency,
      coalesce((notes->>'count')::bigint, 0)           as requests,
      coalesce((notes->>'ok')::bigint, 0)              as ok,
      coalesce((notes->>'breakage')::bigint, 0)        as breakage,
      coalesce((notes->>'throttled')::bigint, 0)       as throttled,
      coalesce((notes->>'media_requests')::bigint, 0)  as media_requests,
      coalesce((notes->>'media_bytes')::bigint, 0)     as media_bytes,
      coalesce((notes->>'p95_ms')::numeric, 0)         as p95_ms
    from snap
    where notes ? 'shard'
    order by notes->>'shard', captured_at desc
  )
  select jsonb_build_object(
    'run_label',            p_run_label,
    'shards',               (select count(*) from per_shard),
    'offered_concurrency',  coalesce((select sum(concurrency) from per_shard), 0),
    'requests',             coalesce((select sum(requests) from per_shard), 0),
    'ok',                   coalesce((select sum(ok) from per_shard), 0),
    'breakage',             coalesce((select sum(breakage) from per_shard), 0),
    'throttled',            coalesce((select sum(throttled) from per_shard), 0),
    'media_requests',       coalesce((select sum(media_requests) from per_shard), 0),
    'media_bytes',          coalesce((select sum(media_bytes) from per_shard), 0),
    'p95_ms',               coalesce((select max(p95_ms) from per_shard), 0),
    'db_active_conn_peak',  coalesce((select max(active_connections) from snap), 0),
    'db_avg_query_ms_peak', coalesce((select max(avg_query_ms) from snap), 0),
    'max_connections',      coalesce((select max(max_connections) from snap), 0),
    'storage_bytes',        (select storage_bytes from public.platform_weight order by captured_at desc limit 1)
  )
  into v_result;

  return v_result;
end;
$$;

-- Authenticated-guarded (is_internal_user in-body): revoke anon/public, grant authenticated ONLY —
-- authenticated's DIRECT grant is what the dashboard uses; do NOT revoke it. (Per the definer-revoke
-- rule: SERVICE-ROLE-ONLY fns revoke authenticated too; this one keeps it.)
revoke execute on function public.get_sim_load_matrix_summary(text) from anon, public;
grant  execute on function public.get_sim_load_matrix_summary(text) to authenticated;

-- ============================================================
-- ===== VERIFICATION (coordinator runs at the careful gate — NOT applied by this migration) =====
-- Rollback-wrapped, ONE statement per MCP execute_sql call (last-result-only). Seed two shard rows,
-- fake an internal caller, assert the summed row, then roll back:
--   begin;
--     insert into sim_load_snapshots (run_label, active_connections, max_connections, avg_query_ms, error_rate, notes)
--     values ('matrix-verify', 40, 90, 1.2, 0, '{"shard":0,"concurrency":200,"count":100,"ok":100,"throttled":0,"breakage":0,"media_requests":10,"media_bytes":5000,"p95_ms":80}'),
--            ('matrix-verify', 55, 90, 1.9, 0, '{"shard":1,"concurrency":200,"count":120,"ok":118,"throttled":2,"breakage":0,"media_requests":12,"media_bytes":6000,"p95_ms":95}');
--     select set_config('request.jwt.claim.sub', (select user_id::text from internal_users limit 1), true);  -- fake an internal caller
--     set local role authenticated;
--     select public.get_sim_load_matrix_summary('matrix-verify');
--       -- expect: shards=2, offered_concurrency=400, requests=220, ok=218, throttled=2, media_requests=22,
--       --         media_bytes=11000, p95_ms=95, db_active_conn_peak=55, max_connections=90.
--   rollback;
-- (The exact internal-user source table / claim shape is confirmed at the gate; is_internal_user()
-- reads auth.uid() from the JWT claim, which the set_config above fakes — see [[reference_testing_authuid_rpc_rls]].)
-- ============================================================
