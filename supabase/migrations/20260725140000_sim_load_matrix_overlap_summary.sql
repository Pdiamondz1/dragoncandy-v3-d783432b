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
      coalesce((notes->>'p95_ms')::numeric, 0)         as p95_ms
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
    'media_ms_p95_peak',       coalesce((select max(coalesce((notes->>'media_ms_p95')::numeric, 0)) from snap where notes ? 'shard'), 0),
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

-- ===== VERIFICATION (coordinator runs at the careful gate — NOT applied by this migration) =====
-- One statement per MCP execute_sql call. OVERLAP case (honest == naive):
--   begin;
--     insert into sim_load_snapshots (run_label, captured_at, active_connections, max_connections, avg_query_ms, error_rate, notes) values
--       ('m-ovl','2026-07-25 10:00:00+00',40,90,1.0,0,'{"shard":0,"concurrency":200,"count":50,"ok":50,"throttled":0,"breakage":0,"media_requests":5,"media_bytes":2000,"media_errors":0,"media_ms_p95":120,"p95_ms":100}'),
--       ('m-ovl','2026-07-25 10:00:05+00',45,90,1.1,0,'{"shard":0,"concurrency":200,"count":100,"ok":100,"throttled":0,"breakage":0,"media_requests":10,"media_bytes":4000,"media_errors":1,"media_ms_p95":90,"p95_ms":110}'),
--       ('m-ovl','2026-07-25 10:00:00+00',50,90,1.2,0,'{"shard":1,"concurrency":200,"count":60,"ok":60,"throttled":0,"breakage":0,"media_requests":6,"media_bytes":2500,"media_errors":0,"media_ms_p95":85,"p95_ms":120}'),
--       ('m-ovl','2026-07-25 10:00:05+00',55,90,1.3,0,'{"shard":1,"concurrency":200,"count":120,"ok":118,"throttled":2,"breakage":0,"media_requests":12,"media_bytes":5000,"media_errors":2,"media_ms_p95":95,"p95_ms":130}');
--     select set_config('request.jwt.claim.sub', (select user_id::text from internal_users limit 1), true);
--     set local role authenticated;
--     select public.get_sim_load_matrix_summary('m-ovl');
--       -- expect offered_concurrency=400, honest_peak_concurrency=400, max_concurrent_shards=2,
--       --        requests=220, media_requests=22, media_errors=3, media_ms_p95_peak=120.
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
