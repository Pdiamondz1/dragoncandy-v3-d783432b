-- Live database-health read for /internal (AIOS). SECURITY DEFINER + is_internal_user() gate, same as
-- aios_platform_stats. Reuses the pg_stat pattern proven by capture_sim_load_snapshot (pg_stat_statements
-- OPTIONAL → latency degrades to NULL, never errors). Returns ONLY aggregate ops counts — never
-- pg_stat_activity.query / usename (no per-session/user data). No new table or secret. Idempotent.
create or replace function public.aios_db_health()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_max int := current_setting('max_connections')::int;
  v_reserved int := current_setting('superuser_reserved_connections')::int;
  v_total int; v_active int; v_idle int; v_idle_tx int;
  v_mean numeric; v_slowest numeric;
  v_pgss regclass := coalesce(
    to_regclass('extensions.pg_stat_statements'),
    to_regclass('public.pg_stat_statements'));
  v_cache numeric; v_commit bigint; v_rollback bigint; v_dbbytes bigint;
begin
  if auth.uid() is null or not public.is_internal_user() then
    raise exception 'forbidden: internal users only';
  end if;

  select count(*),
         count(*) filter (where state = 'active'),
         count(*) filter (where state = 'idle'),
         count(*) filter (where state = 'idle in transaction')
    into v_total, v_active, v_idle, v_idle_tx
    from pg_stat_activity;

  -- pg_stat_statements is optional; degrade latency to NULL (never error) if absent/unreadable.
  if v_pgss is not null then
    begin
      execute format(
        'select sum(total_exec_time)/nullif(sum(calls),0), max(mean_exec_time) from %s', v_pgss)
        into v_mean, v_slowest;
    exception when others then
      v_mean := null; v_slowest := null;
    end;
  end if;

  select sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0),
         sum(xact_commit), sum(xact_rollback)
    into v_cache, v_commit, v_rollback
    from pg_stat_database
   where datname = current_database();

  v_dbbytes := pg_database_size(current_database());

  return jsonb_build_object(
    'connections', jsonb_build_object(
      'total', v_total, 'active', v_active, 'idle', v_idle,
      'idle_in_transaction', v_idle_tx, 'max', v_max, 'reserved', v_reserved),
    'latency', jsonb_build_object('mean_query_ms', v_mean, 'slowest_statement_ms', v_slowest),
    'cache_hit_ratio', v_cache,
    'xact_commit', v_commit, 'xact_rollback', v_rollback,
    'db_bytes', v_dbbytes,
    'generated_at', now()
  );
end;
$$;

revoke execute on function public.aios_db_health() from public, anon;
grant  execute on function public.aios_db_health() to authenticated, service_role;
