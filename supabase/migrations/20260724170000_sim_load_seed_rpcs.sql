-- ============================================================
-- Synthetic Weight Engine — Phase A seed + load-snapshot RPCs
--
-- Two service_role-only SECURITY DEFINER functions:
--   1. seed_synthetic_cohort(p_n, p_cohort, p_creator_split) — bulk-seeds a large "depth"
--      population of synthetic users that NEVER authenticate (they exist only to make
--      listings look populated). Deterministic id per email so re-runs are idempotent.
--   2. capture_sim_load_snapshot(p_run_label, p_error_rate, p_notes) — writes one
--      sim_load_snapshots row (defined in 20260723131000_synthetic_weight_safety_spine.sql)
--      and returns its id.
--
-- Deploy ordering: this migration is applied to prod BEFORE the harness code (sim/seed.ts,
-- the bulk-seed subcommand) that calls these RPCs.
--
-- Dependencies (coordinator: confirm against prod zocahiffooqdybdhguqv before/at apply):
--   * extensions.uuid_generate_v5 — uuid-ossp; on Supabase this lives in the `extensions`
--     schema. This function sets search_path=public, so the call is SCHEMA-QUALIFIED
--     (`extensions.uuid_generate_v5`); an unqualified call would fail "function does not exist".
--   * auth.users AFTER-INSERT trigger `on_auth_user_created` → handle_new_user: on an insert
--     whose email LIKE '%@synthetic.dragoncandy.test' it auto-creates profiles + the role
--     profile (creator_profiles/business_profiles) + the synthetic_users registry row, all
--     ON CONFLICT DO NOTHING. seed_synthetic_cohort therefore inserts ONLY auth.users and
--     lets the trigger own the downstream rows (re-inserting them would risk a unique
--     violation — flagged in spec-review).
--   * profiles.email_verified (boolean, default false) — added 20251014150439.
--   * pg_stat_statements is OPTIONAL — capture_sim_load_snapshot degrades avg_query_ms to
--     NULL (never errors) if the extension is absent or unreachable.
-- ============================================================

-- ------------------------------------------------------------
-- 1. seed_synthetic_cohort — depth-population bulk seeder (service_role only).
-- ------------------------------------------------------------
create or replace function public.seed_synthetic_cohort(
  p_n int,
  p_cohort text,
  p_creator_split numeric default 0.65
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Fixed namespace so uuid_generate_v5(namespace, email) is stable across re-runs → the
  -- deterministic id makes `on conflict (id) do nothing` actually fire on a re-run (a random
  -- uuid would instead violate the auth.users email-unique index → a hard error, not a skip).
  v_namespace constant uuid := 'a3f1c9e2-6b74-4d58-9e1a-7c0b2d4f6a80';
  v_creator_cutoff int := floor(p_n * p_creator_split);
  v_email text;
  v_id uuid;
  v_role text;
  v_name text;
  v_first text;
  v_last text;
  v_rc int;
  v_seeded int := 0;
  v_skipped int := 0;
begin
  for i in 0 .. p_n - 1 loop
    v_email := 'botseed_' || p_cohort || '_' || i || '@synthetic.dragoncandy.test';
    -- uuid-ossp lives in the extensions schema; schema-qualify (search_path=public here).
    v_id := extensions.uuid_generate_v5(v_namespace, v_email);
    -- Role by split: the first floor(p_n * split) are creators, the rest are businesses.
    v_role := case when i < v_creator_cutoff then 'content_creator' else 'business_client' end;
    -- Deterministic, plausible full_name (dupes are fine — full_name is not unique).
    v_first := (array['Alex','Sam','Jordan','Taylor','Casey','Morgan','Riley','Jamie','Avery','Quinn'])[(i % 10) + 1];
    v_last  := (array['Rivera','Chen','Patel','Kim','Nguyen','Garcia','Silva','Haddad','Rossi','Okafor'])[((i / 10) % 10) + 1];
    v_name  := v_first || ' ' || v_last;

    -- Insert ONLY auth.users. The AFTER-INSERT handle_new_user trigger creates profiles +
    -- the role profile + the synthetic_users row (email matches the synthetic domain). Do NOT
    -- re-insert those here. on conflict (id) — the deterministic id is the PK — makes a re-run
    -- a clean skip rather than an email-unique violation.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      v_email,
      '',                                -- depth bots never log in; empty hash is fine
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', v_role, 'full_name', v_name)
    )
    on conflict (id) do nothing;

    get diagnostics v_rc = row_count;
    if v_rc = 1 then
      v_seeded := v_seeded + 1;
      -- The AFTER-INSERT trigger already created the profiles row (fires within the INSERT
      -- statement, before this UPDATE). Bots need email_verified; harmless for depth bots.
      -- Skipped (pre-existing) rows already had it set on their first seed.
      update profiles set email_verified = true where id = v_id;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('seeded', v_seeded, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.seed_synthetic_cohort(int, text, numeric) from public, anon, authenticated;
grant  execute on function public.seed_synthetic_cohort(int, text, numeric) to service_role;

-- ------------------------------------------------------------
-- 2. capture_sim_load_snapshot — one sim_load_snapshots row (service_role only).
-- ------------------------------------------------------------
create or replace function public.capture_sim_load_snapshot(
  p_run_label text,
  p_error_rate numeric default null,
  p_notes jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_avg numeric := null;
  v_reg regclass;
begin
  -- Call-weighted system average query time. pg_stat_statements is OPTIONAL and, on Supabase,
  -- installed in the `extensions` schema (off this function's public search_path). Resolve it
  -- via to_regclass wherever it lives, then read it with a dynamic query, wrapped so a missing
  -- or unreachable extension yields NULL — it must NEVER break the snapshot insert. (regclass
  -- is not user input, so the dynamic query carries no injection surface.)
  v_reg := coalesce(
    to_regclass('extensions.pg_stat_statements'),
    to_regclass('public.pg_stat_statements')
  );
  if v_reg is not null then
    begin
      execute format(
        'select round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 2) from %s',
        v_reg::text
      ) into v_avg;
    exception when others then
      v_avg := null;
    end;
  end if;

  insert into public.sim_load_snapshots (
    run_label, active_connections, max_connections, reserved_headroom,
    avg_query_ms, error_rate, notes
  )
  values (
    p_run_label,
    (select count(*) from pg_stat_activity where state = 'active'),
    current_setting('max_connections')::int,
    current_setting('superuser_reserved_connections')::int,
    v_avg,
    p_error_rate,
    coalesce(p_notes, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.capture_sim_load_snapshot(text, numeric, jsonb) from public, anon, authenticated;
grant  execute on function public.capture_sim_load_snapshot(text, numeric, jsonb) to service_role;

-- ============================================================
-- ===== VERIFICATION (coordinator runs — NOT applied by this migration) =====
--
-- Run each block as ONE execute_sql call (MCP returns only the LAST statement's result, so a
-- multi-statement call would silently drop earlier SELECTs). Rollback-wrap the seed probe so
-- prod gains no residue.
--
-- ---- A. seed_synthetic_cohort idempotency + FK-valid downstream rows (rollback-wrapped) ----
--   begin;
--     select public.seed_synthetic_cohort(2, 'probe', 0.5);   -- expect {"seeded":2,"skipped":0}
--     -- Proves the AFTER-INSERT trigger fired: 2 registry rows for the 2 probe emails.
--     select count(*) as synthetic_users_rows
--       from synthetic_users s
--       join auth.users u on u.id = s.user_id
--      where u.email like 'botseed_probe_%@synthetic.dragoncandy.test';   -- expect 2
--     -- Proves profiles (FK auth.users) + BOTH role profiles exist and email_verified was set.
--     select u.email, p.role, p.email_verified,
--            (cp.user_id is not null) as has_creator_profile,
--            (bp.user_id is not null) as has_business_profile
--       from auth.users u
--       join profiles p on p.id = u.id
--       left join creator_profiles  cp on cp.user_id = u.id
--       left join business_profiles bp on bp.user_id = u.id
--      where u.email like 'botseed_probe_%@synthetic.dragoncandy.test'
--      order by u.email;
--      -- expect: 2 rows; email_verified = true for both; with split 0.5 → floor(2*0.5)=1
--      --   creator (i=0, has_creator_profile=t) + 1 business (i=1, has_business_profile=t).
--     -- Proves re-run is a clean skip (deterministic id → on conflict (id) fires, no error).
--     select public.seed_synthetic_cohort(2, 'probe', 0.5);   -- expect {"seeded":0,"skipped":2}
--   rollback;   -- discards the 2 probe users + all trigger-created downstream rows.
--
-- ---- B. capture_sim_load_snapshot inserts exactly one row + returns its id ----
--   -- (Not rollback-wrapped only if you want to eyeball the row; otherwise wrap + rollback.)
--   select public.capture_sim_load_snapshot('probe');   -- returns a uuid
--   select id, run_label, active_connections, max_connections, reserved_headroom,
--          avg_query_ms, error_rate, notes
--     from sim_load_snapshots where run_label = 'probe';
--     -- expect: 1 row; active_connections >= 1; max_connections > 0; reserved_headroom >= 0;
--     --   avg_query_ms is numeric if pg_stat_statements is installed, else NULL (both OK).
--   delete from sim_load_snapshots where run_label = 'probe';   -- clean up the probe row.
--
-- What each assertion proves:
--   A1 ({"seeded":2}) — the seeder inserted 2 auth.users; A2 (=2) — the AFTER-INSERT trigger
--   auto-registered them as synthetic (registry populated); A3 — FK-valid profiles exist, the
--   role split routed one creator + one business profile, and email_verified was stamped;
--   A4 ({"seeded":0,"skipped":2}) — the deterministic id makes re-runs idempotent (no
--   email-unique violation, no duplicate users). B — the snapshot RPC writes one well-formed
--   row with live connection/GUC readings and degrades avg_query_ms to NULL rather than failing
--   when pg_stat_statements is unavailable.
-- ============================================================
