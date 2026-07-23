-- ============================================================
-- Synthetic Weight Engine — safety spine (Phase 0)
--
-- Confirmed column names (Task 0, verified read-only against prod zocahiffooqdybdhguqv):
--   feature_flags(name, is_enabled, description)  — UNIQUE(name) = feature_flags_name_key
--   analytics_events.user_id, pricing_funnel_events.user_id, donny_cost_ledger.user_id  (all nullable)
--   payment_events.actor_id, payment_events.campaign_id
--   dragonshare_events.actor_user_id, dragonshare_events.actor_org_id, dragonshare_events.post_id
--   dragonshare_boosts.boosting_user_id, .boosting_org_id, .post_id, .status, .boosted_at,
--     .amount_cents, .platform_fee_cents, .creator_payout_cents
--   Org-owner path: organizations(id, name) has NO owner column — ownership is only an
--     org_members row with role = 'owner'; org_members(org_id, user_id, role); org_units(org_id).
--     is_synthetic_org(org_id) resolves ownership via that org_members owner row.
--   Single-owner columns used by the aios_* exclusions + platform_weight.row_counts_real:
--     profiles.id, business_profiles.user_id, campaigns.user_id, dragonshare_posts.creator_id,
--     promotions.user_id, social_post_log.user_id, content_performance.user_id,
--     business_outstand_accounts.user_id, messages.sender_id, file_uploads.uploaded_by.
--   donny_knowledge has NO user FK → row_counts_real copies its total (real == total by definition).
--   on_auth_user_created is AFTER INSERT on auth.users → CREATE OR REPLACE handle_new_user is correct.
-- ============================================================

-- ------------------------------------------------------------
-- Step 1: Registry + helpers + kill switch + load table
-- ------------------------------------------------------------

create table if not exists public.synthetic_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cohort     text,
  persona    text,
  created_at timestamptz not null default now()
);
alter table public.synthetic_users enable row level security;
drop policy if exists synthetic_users_internal_select on public.synthetic_users;
create policy synthetic_users_internal_select on public.synthetic_users
  for select to authenticated using (public.is_internal_user());
-- No insert/update/delete policy: only service_role + SECURITY DEFINER functions write.

-- is_synthetic(user) — single-party membership check.
create or replace function public.is_synthetic(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.synthetic_users s where s.user_id = p_user_id);
$$;
revoke execute on function public.is_synthetic(uuid) from public, anon, authenticated;
grant execute on function public.is_synthetic(uuid) to service_role;

-- is_synthetic_campaign(campaign) — parent-owner check via campaigns.user_id.
create or replace function public.is_synthetic_campaign(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c
    join public.synthetic_users s on s.user_id = c.user_id
    where c.id = p_campaign_id
  );
$$;
revoke execute on function public.is_synthetic_campaign(uuid) from public, anon, authenticated;
grant execute on function public.is_synthetic_campaign(uuid) to service_role;

-- is_synthetic_org(org) — org-owner check. organizations has no owner column, so ownership
-- is resolved through the org_members row with role = 'owner'. Used by the dragonshare
-- actor-OR-parent paths, the dragonshare_boosts exclusion, and the org_units exclusion.
create or replace function public.is_synthetic_org(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members m
    join public.synthetic_users s on s.user_id = m.user_id
    where m.org_id = p_org_id and m.role = 'owner'
  );
$$;
revoke execute on function public.is_synthetic_org(uuid) from public, anon, authenticated;
grant execute on function public.is_synthetic_org(uuid) to service_role;

create table if not exists public.sim_load_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  run_label text,
  active_connections integer,
  max_connections integer,
  reserved_headroom integer,
  avg_query_ms numeric,
  error_rate numeric,
  notes jsonb not null default '{}'
);
alter table public.sim_load_snapshots enable row level security;
drop policy if exists sim_load_snapshots_internal_select on public.sim_load_snapshots;
create policy sim_load_snapshots_internal_select on public.sim_load_snapshots
  for select to authenticated using (public.is_internal_user());

-- Kill switch — feature_flags(name, is_enabled, description), UNIQUE(name). Defaults OFF.
insert into public.feature_flags (name, is_enabled, description)
values ('SYNTHETIC_BOTS_ENABLED', false, 'Master kill switch for the Synthetic Weight Engine bot harness')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Step 2: Extend handle_new_user (reproduced verbatim from
-- 20260427220001_handle_new_user_create_role_profile.sql, adding ONE block before RETURN NEW)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_name text;
  v_account_type text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'content_creator');
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (NEW.id, NEW.email, v_role::user_role, v_name)
  ON CONFLICT (id) DO NOTHING;

  IF v_role IN ('business_client', 'brand') THEN
    v_account_type := CASE WHEN v_role = 'brand' THEN 'brand' ELSE 'restaurant' END;
    INSERT INTO public.business_profiles (user_id, business_name, account_type)
    VALUES (NEW.id, v_name, v_account_type)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF v_role = 'content_creator' THEN
    INSERT INTO public.creator_profiles (user_id, creator_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Synthetic Weight Engine: auto-register bot accounts (email is the source of truth).
  IF NEW.email LIKE '%@synthetic.dragoncandy.test' THEN
    INSERT INTO public.synthetic_users (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Step 3: Denormalized flag + BEFORE INSERT triggers on the five rootless/telemetry tables.
-- Nullable per CLAUDE.md (default false, never NOT NULL).
-- ------------------------------------------------------------

alter table public.payment_events        add column if not exists is_synthetic boolean default false;
alter table public.analytics_events      add column if not exists is_synthetic boolean default false;
alter table public.dragonshare_events    add column if not exists is_synthetic boolean default false;
alter table public.pricing_funnel_events add column if not exists is_synthetic boolean default false;
alter table public.donny_cost_ledger     add column if not exists is_synthetic boolean default false;

-- payment_events: actor OR parent campaign (two-sided).
create or replace function public.stamp_payment_event_synthetic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_synthetic := public.is_synthetic(new.actor_id)
    or (new.campaign_id is not null and public.is_synthetic_campaign(new.campaign_id));
  return new;
end; $$;
revoke execute on function public.stamp_payment_event_synthetic() from public, anon, authenticated;
drop trigger if exists trg_stamp_payment_event_synthetic on public.payment_events;
create trigger trg_stamp_payment_event_synthetic
  before insert on public.payment_events
  for each row execute function public.stamp_payment_event_synthetic();

-- analytics_events / pricing_funnel_events / donny_cost_ledger: single-party by user_id (nullable).
create or replace function public.stamp_user_row_synthetic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_synthetic := new.user_id is not null and public.is_synthetic(new.user_id);
  return new;
end; $$;
revoke execute on function public.stamp_user_row_synthetic() from public, anon, authenticated;
drop trigger if exists trg_stamp_analytics_synthetic on public.analytics_events;
create trigger trg_stamp_analytics_synthetic before insert on public.analytics_events
  for each row execute function public.stamp_user_row_synthetic();
drop trigger if exists trg_stamp_pricing_funnel_synthetic on public.pricing_funnel_events;
create trigger trg_stamp_pricing_funnel_synthetic before insert on public.pricing_funnel_events
  for each row execute function public.stamp_user_row_synthetic();
drop trigger if exists trg_stamp_cost_ledger_synthetic on public.donny_cost_ledger;
create trigger trg_stamp_cost_ledger_synthetic before insert on public.donny_cost_ledger
  for each row execute function public.stamp_user_row_synthetic();

-- dragonshare_events: actor user OR actor org owner OR the underlying post's creator.
create or replace function public.stamp_dragonshare_event_synthetic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_synthetic := public.is_synthetic(new.actor_user_id)
    or (new.actor_org_id is not null and public.is_synthetic_org(new.actor_org_id))
    or (new.post_id is not null and public.is_synthetic(
          (select dp.creator_id from public.dragonshare_posts dp where dp.id = new.post_id)));
  return new;
end; $$;
revoke execute on function public.stamp_dragonshare_event_synthetic() from public, anon, authenticated;
drop trigger if exists trg_stamp_dragonshare_event_synthetic on public.dragonshare_events;
create trigger trg_stamp_dragonshare_event_synthetic before insert on public.dragonshare_events
  for each row execute function public.stamp_dragonshare_event_synthetic();

-- ------------------------------------------------------------
-- Step 4: platform_weight.*_real + capture rewrite (reproduced from
-- 20260611170000_platform_weight.sql, adding the *_real computation). row_counts_real
-- mirrors ALL 10 keys of row_counts so that at zero synthetic data row_counts_real == row_counts.
-- ------------------------------------------------------------

alter table public.platform_weight add column if not exists users_total_real integer;
alter table public.platform_weight add column if not exists row_counts_real jsonb;

CREATE OR REPLACE FUNCTION public.capture_platform_weight()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_weight (
    db_bytes, storage_bytes, users_total, row_counts, users_total_real, row_counts_real
  )
  VALUES (
    pg_database_size(current_database()),
    (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects),
    (SELECT count(*) FROM profiles),
    jsonb_build_object(
      'profiles', (SELECT count(*) FROM profiles),
      'campaigns', (SELECT count(*) FROM campaigns),
      'dragonshare_posts', (SELECT count(*) FROM dragonshare_posts),
      'dragonshare_boosts', (SELECT count(*) FROM dragonshare_boosts),
      'promotions', (SELECT count(*) FROM promotions),
      'messages', (SELECT count(*) FROM messages),
      'analytics_events', (SELECT count(*) FROM analytics_events),
      'content_performance', (SELECT count(*) FROM content_performance),
      'donny_knowledge', (SELECT count(*) FROM donny_knowledge),
      'file_uploads', (SELECT count(*) FROM file_uploads)
    ),
    (SELECT count(*) FROM profiles WHERE NOT public.is_synthetic(id)),
    -- row_counts_real MUST mirror ALL 10 keys of row_counts so that at zero synthetic data
    -- row_counts_real == row_counts holds (the teardown assertion). Each key excludes synthetic;
    -- keys with no user FK (donny_knowledge) equal the total by definition.
    jsonb_build_object(
      'profiles', (SELECT count(*) FROM profiles WHERE NOT public.is_synthetic(id)),
      'campaigns', (SELECT count(*) FROM campaigns WHERE NOT public.is_synthetic(user_id)),
      'dragonshare_posts', (SELECT count(*) FROM dragonshare_posts WHERE NOT public.is_synthetic(creator_id)),
      'dragonshare_boosts', (SELECT count(*) FROM dragonshare_boosts b
         WHERE NOT (public.is_synthetic(b.boosting_user_id)
                    OR public.is_synthetic_org(b.boosting_org_id)
                    OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))),
      'promotions', (SELECT count(*) FROM promotions WHERE NOT public.is_synthetic(user_id)),
      'messages', (SELECT count(*) FROM messages WHERE NOT public.is_synthetic(sender_id)),
      'analytics_events', (SELECT count(*) FROM analytics_events WHERE is_synthetic IS NOT TRUE),
      'content_performance', (SELECT count(*) FROM content_performance WHERE NOT public.is_synthetic(user_id)),
      'donny_knowledge', (SELECT count(*) FROM donny_knowledge),  -- no user FK; never synthetic → real == total
      'file_uploads', (SELECT count(*) FROM file_uploads WHERE NOT public.is_synthetic(uploaded_by))
    )
  );
END;
$$;

-- Cron/service only — not callable by app users (unchanged from source grants).
REVOKE EXECUTE ON FUNCTION public.capture_platform_weight() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_platform_weight() TO service_role;

-- ------------------------------------------------------------
-- Step 5: aios_* exclusions (reproduced from 20260611150000_aios_stats_rpcs.sql, adding the
-- actor-OR-parent predicates per the plan table; role gates + grants unchanged).
-- ------------------------------------------------------------

-- 1. Platform stats — exclude synthetic actors/parents from every count.
CREATE OR REPLACE FUNCTION public.aios_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'forbidden: internal access required';
  END IF;

  RETURN jsonb_build_object(
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM profiles WHERE NOT public.is_synthetic(id)),
      'by_role', (
        SELECT coalesce(jsonb_object_agg(role, cnt), '{}'::jsonb)
        FROM (SELECT role::text AS role, count(*) AS cnt FROM profiles WHERE NOT public.is_synthetic(id) GROUP BY role) r
      )
    ),
    'businesses', jsonb_build_object(
      'restaurants', (SELECT count(*) FROM business_profiles WHERE account_type = 'restaurant' AND NOT public.is_synthetic(user_id)),
      'brands', (SELECT count(*) FROM business_profiles WHERE account_type = 'brand' AND NOT public.is_synthetic(user_id)),
      'locations', (SELECT count(*) FROM org_units WHERE NOT public.is_synthetic_org(org_id))
    ),
    'campaigns', jsonb_build_object(
      'total', (SELECT count(*) FROM campaigns WHERE NOT public.is_synthetic(user_id)),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        FROM (SELECT status::text AS status, count(*) AS cnt FROM campaigns WHERE NOT public.is_synthetic(user_id) GROUP BY status) c
      )
    ),
    'dragonshare', jsonb_build_object(
      'posts_total', (SELECT count(*) FROM dragonshare_posts WHERE NOT public.is_synthetic(creator_id)),
      'posts_by_status', (
        SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        FROM (SELECT status, count(*) AS cnt FROM dragonshare_posts WHERE NOT public.is_synthetic(creator_id) GROUP BY status) p
      ),
      'boosts_total', (SELECT count(*) FROM dragonshare_boosts b
        WHERE NOT (public.is_synthetic(b.boosting_user_id)
                   OR public.is_synthetic_org(b.boosting_org_id)
                   OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id))))
    ),
    'promotions', jsonb_build_object(
      'total', (SELECT count(*) FROM promotions WHERE NOT public.is_synthetic(user_id)),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        FROM (SELECT status, count(*) AS cnt FROM promotions WHERE NOT public.is_synthetic(user_id) GROUP BY status) pr
      )
    ),
    'content', jsonb_build_object(
      'social_posts_logged', (SELECT count(*) FROM social_post_log WHERE NOT public.is_synthetic(user_id)),
      'performance_tracked_posts', (SELECT count(DISTINCT outstand_post_id) FROM content_performance WHERE NOT public.is_synthetic(user_id))
    ),
    'social_connections', jsonb_build_object(
      'total', (SELECT count(*) FROM business_outstand_accounts WHERE NOT public.is_synthetic(user_id)),
      'by_platform', (
        SELECT coalesce(jsonb_object_agg(platform, cnt), '{}'::jsonb)
        FROM (SELECT platform, count(*) AS cnt FROM business_outstand_accounts WHERE NOT public.is_synthetic(user_id) GROUP BY platform) bp
      )
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aios_platform_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aios_platform_stats() TO authenticated, service_role;

-- 2. Revenue stats — exclude synthetic payment events and synthetic boosts.
CREATE OR REPLACE FUNCTION public.aios_revenue_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'forbidden: internal access required';
  END IF;

  RETURN jsonb_build_object(
    'payments', jsonb_build_object(
      'by_event_type', (
        SELECT coalesce(jsonb_object_agg(event_type, total_cents), '{}'::jsonb)
        FROM (
          SELECT event_type, sum(amount_cents) AS total_cents
          FROM payment_events
          WHERE amount_cents IS NOT NULL AND is_synthetic IS NOT TRUE
          GROUP BY event_type
        ) pe
      ),
      'events_total', (SELECT count(*) FROM payment_events WHERE is_synthetic IS NOT TRUE)
    ),
    'dragonshare', jsonb_build_object(
      'gross_cents', (
        SELECT coalesce(sum(amount_cents), 0) FROM dragonshare_boosts b
        WHERE status IN ('captured', 'transferred')
          AND NOT (public.is_synthetic(b.boosting_user_id)
                   OR public.is_synthetic_org(b.boosting_org_id)
                   OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))
      ),
      'platform_fee_cents', (
        SELECT coalesce(sum(platform_fee_cents), 0) FROM dragonshare_boosts b
        WHERE status IN ('captured', 'transferred')
          AND NOT (public.is_synthetic(b.boosting_user_id)
                   OR public.is_synthetic_org(b.boosting_org_id)
                   OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))
      ),
      'creator_payout_cents', (
        SELECT coalesce(sum(creator_payout_cents), 0) FROM dragonshare_boosts b
        WHERE status IN ('captured', 'transferred')
          AND NOT (public.is_synthetic(b.boosting_user_id)
                   OR public.is_synthetic_org(b.boosting_org_id)
                   OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))
      )
    ),
    'dragonshare_mtd', jsonb_build_object(
      'gross_cents', (
        SELECT coalesce(sum(amount_cents), 0) FROM dragonshare_boosts b
        WHERE status IN ('captured', 'transferred') AND boosted_at >= month_start
          AND NOT (public.is_synthetic(b.boosting_user_id)
                   OR public.is_synthetic_org(b.boosting_org_id)
                   OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))
      ),
      'platform_fee_cents', (
        SELECT coalesce(sum(platform_fee_cents), 0) FROM dragonshare_boosts b
        WHERE status IN ('captured', 'transferred') AND boosted_at >= month_start
          AND NOT (public.is_synthetic(b.boosting_user_id)
                   OR public.is_synthetic_org(b.boosting_org_id)
                   OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))
      )
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aios_revenue_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aios_revenue_stats() TO authenticated, service_role;

-- 3. Cost stats — exclude synthetic spend from every donny_cost_ledger aggregate.
CREATE OR REPLACE FUNCTION public.aios_cost_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: platform admin role required';
  END IF;

  RETURN jsonb_build_object(
    'mtd_spend_usd', (
      SELECT round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4)
      FROM donny_cost_ledger WHERE created_at >= month_start AND is_synthetic IS NOT TRUE
    ),
    'mtd_by_function', (
      SELECT coalesce(jsonb_object_agg(edge_function, usd), '{}'::jsonb)
      FROM (
        SELECT edge_function, round(sum(estimated_cost_usd)::numeric, 4) AS usd
        FROM donny_cost_ledger WHERE created_at >= month_start AND is_synthetic IS NOT TRUE
        GROUP BY edge_function
      ) f
    ),
    'mtd_by_model', (
      SELECT coalesce(jsonb_object_agg(model, usd), '{}'::jsonb)
      FROM (
        SELECT model, round(sum(estimated_cost_usd)::numeric, 4) AS usd
        FROM donny_cost_ledger WHERE created_at >= month_start AND is_synthetic IS NOT TRUE
        GROUP BY model
      ) m
    ),
    'daily_last_30', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'usd', usd) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               round(sum(estimated_cost_usd)::numeric, 4) AS usd
        FROM donny_cost_ledger
        WHERE created_at >= now() - interval '30 days' AND is_synthetic IS NOT TRUE
        GROUP BY 1
      ) d
    ),
    'latest_alert', (
      SELECT event_data FROM analytics_events
      WHERE event_type = 'donny_cost_alert'
      ORDER BY created_at DESC LIMIT 1
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aios_cost_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aios_cost_stats() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Step 6: get_simulation_stats() — the one surface that SHOWS synthetic (internal-gated).
-- ------------------------------------------------------------

create or replace function public.get_simulation_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_internal_user() then raise exception 'forbidden: internal access required'; end if;
  return jsonb_build_object(
    'bots_total', (select count(*) from synthetic_users),
    'bots_by_persona', (select coalesce(jsonb_object_agg(persona, cnt), '{}'::jsonb)
       from (select coalesce(persona, 'unknown') persona, count(*) cnt from synthetic_users group by 1) x),
    'synthetic_campaigns', (select count(*) from campaigns where public.is_synthetic(user_id)),
    'synthetic_messages', (select count(*) from messages where public.is_synthetic(sender_id)),
    'synthetic_ai_spend_mtd_usd', (select round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4)
       from donny_cost_ledger where is_synthetic and created_at >= date_trunc('month', now())),
    'kill_switch_enabled', (select coalesce(is_enabled, false) from feature_flags where name = 'SYNTHETIC_BOTS_ENABLED'),
    'generated_at', now()
  );
end; $$;
revoke execute on function public.get_simulation_stats() from public, anon;
grant execute on function public.get_simulation_stats() to authenticated, service_role;

-- ------------------------------------------------------------
-- Step 7: purge_synthetic_data() — leaf-first, rootless-before-users, explicit org rows, residue-safe.
-- ------------------------------------------------------------

create or replace function public.purge_synthetic_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_email_ids uuid[]; v_org_ids uuid[]; v_report jsonb;
begin
  select array_agg(user_id order by user_id) into v_ids from public.synthetic_users;
  select array_agg(id order by id) into v_email_ids
    from auth.users where email like '%@synthetic.dragoncandy.test';
  if coalesce(v_ids, '{}') is distinct from coalesce(v_email_ids, '{}') then
    raise warning 'purge_synthetic_data: registry/email drift; unioning both sets';
    v_ids := (select array_agg(distinct u) from unnest(coalesce(v_ids, '{}') || coalesce(v_email_ids, '{}')) u);
  end if;
  if v_ids is null then return jsonb_build_object('purged', 0, 'note', 'no synthetic users'); end if;

  -- Capture synthetic org ids BEFORE deleting auth.users. organizations/org_units have NO FK to
  -- auth.users (ownership is only via org_members.role='owner'), so they do NOT cascade — they
  -- must be deleted explicitly or they survive as residue.
  select array_agg(distinct m.org_id) into v_org_ids
    from public.org_members m where m.user_id = any(v_ids) and m.role = 'owner';

  -- Rootless/telemetry ledgers first (before the auth.users delete nulls analytics_events.user_id).
  delete from public.payment_events        where is_synthetic;
  delete from public.analytics_events      where is_synthetic;
  delete from public.dragonshare_events    where is_synthetic;
  delete from public.pricing_funnel_events where is_synthetic;
  delete from public.donny_cost_ledger     where is_synthetic;

  -- Users cascade: profiles → creator/business_profiles, org_members, campaigns
  -- (+ applications/collaborations/matches/invitations/file_uploads), messages/conversations,
  -- dragonshare_posts/boosts/payouts, donny_conversations/messages.
  delete from auth.users where id = any(v_ids);

  -- Org rows do NOT cascade — delete explicitly, children first.
  if v_org_ids is not null then
    delete from public.org_units    where org_id = any(v_org_ids);
    delete from public.organizations where id     = any(v_org_ids);
  end if;

  v_report := jsonb_build_object(
    'purged_users', array_length(v_ids, 1),
    'residual_synthetic_users',       (select count(*) from public.synthetic_users),
    'residual_email_users',           (select count(*) from auth.users where email like '%@synthetic.dragoncandy.test'),
    'residual_payment_events',        (select count(*) from public.payment_events        where is_synthetic),
    'residual_analytics_events',      (select count(*) from public.analytics_events      where is_synthetic),
    'residual_dragonshare_events',    (select count(*) from public.dragonshare_events    where is_synthetic),
    'residual_pricing_funnel_events', (select count(*) from public.pricing_funnel_events where is_synthetic),
    'residual_cost_ledger',           (select count(*) from public.donny_cost_ledger     where is_synthetic),
    'residual_orgs',                  (select count(*) from public.organizations where id     = any(coalesce(v_org_ids, '{}'))),
    'residual_org_units',             (select count(*) from public.org_units    where org_id = any(coalesce(v_org_ids, '{}')))
  );
  return v_report;
end; $$;
revoke execute on function public.purge_synthetic_data() from public, anon, authenticated;
grant execute on function public.purge_synthetic_data() to service_role;
