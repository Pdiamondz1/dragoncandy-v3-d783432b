-- ============================================================
-- Synthetic Weight Engine — scoped load-cohort teardown (runner matrix).
--
-- The matrix seeds a LARGE botla…/botseed_… cohort + content (public-free campaigns, DragonShare
-- video posts, file_uploads, ONE synthetic org, avatars/geo). purge_synthetic_data() would ALSO
-- delete the live bot0## daily-tick cohort, so the matrix needs a teardown scoped to the LOAD
-- cohort ONLY (email LIKE 'botla%' OR 'botseed\_%'), sparing bot0##. This replaces the fragile raw
-- prefix DELETE the runbook used to hand-maintain, centralizing teardown-safety in one residue-
-- reported RPC. Mirrors purge_synthetic_data's leaf-first ordering, extended for the content seed's
-- residue (verified against prod 2026-07-24):
--   * NO-ACTION FKs (block the auth.users→profiles cascade) leaf-deleted FIRST:
--       push_notifications.actor_id, crew_activity.actor_id/participant_id,
--       creator_group_members.creator_id/invited_by  (confdeltype='a').
--   * trigger/telemetry residue by actor: dragonshare_events (trg_ds_post_submitted writes one per
--       post), payment_events, analytics_events, pricing_funnel_events, donny_cost_ledger.
--   * campaigns / dragonshare_posts / file_uploads / donny_* / messages cascade via the user delete.
--   * the synthetic org does NOT cascade (organizations has no user FK) → org_units + organizations
--       deleted explicitly (children first), like purge_synthetic_data.
-- Fail-loud: sim/run.ts (cmdPurge-style) asserts every residual_* is 0.
-- ============================================================

create or replace function public.purge_synthetic_load_cohort()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_org_ids uuid[]; v_report jsonb;
begin
  -- The LOAD cohort only: matrix active (botla…) + depth (botseed_…). NEVER bot0## (live daily).
  select array_agg(id order by id) into v_ids
    from auth.users
   where email like 'botla%@synthetic.dragoncandy.test'
      or email like 'botseed\_%@synthetic.dragoncandy.test';
  if v_ids is null then return jsonb_build_object('purged', 0, 'note', 'no load cohort'); end if;

  -- Synthetic org(s) owned by the load cohort (org_members owner) — captured BEFORE the users delete.
  select array_agg(distinct m.org_id) into v_org_ids
    from public.org_members m where m.user_id = any(v_ids) and m.role = 'owner';

  -- Leaf-delete the NO-ACTION FK rows (block the cascade) + trigger/telemetry residue, by load actor.
  delete from public.push_notifications   where actor_id = any(v_ids);
  delete from public.crew_activity         where actor_id = any(v_ids) or participant_id = any(v_ids);
  delete from public.creator_group_members where creator_id = any(v_ids) or invited_by = any(v_ids);
  delete from public.dragonshare_events    where actor_user_id = any(v_ids);
  delete from public.payment_events        where actor_id = any(v_ids);
  delete from public.analytics_events      where user_id = any(v_ids);
  delete from public.pricing_funnel_events where user_id = any(v_ids);
  delete from public.donny_cost_ledger     where user_id = any(v_ids);

  -- Users cascade: profiles → campaigns / dragonshare_posts / file_uploads / creator|business_profiles
  -- / donny_conversations|messages / messages / conversations / creator_group_members(creator_id).
  delete from auth.users where id = any(v_ids);

  -- The synthetic org(s) do NOT cascade (organizations has no user FK) — delete explicitly, kids first.
  if v_org_ids is not null then
    delete from public.org_units     where org_id = any(v_org_ids);
    delete from public.organizations where id     = any(v_org_ids);
  end if;

  v_report := jsonb_build_object(
    'purged_users', array_length(v_ids, 1),
    'residual_load_users',          (select count(*) from auth.users where email like 'botla%@synthetic.dragoncandy.test' or email like 'botseed\_%@synthetic.dragoncandy.test'),
    'residual_push_notifications',  (select count(*) from public.push_notifications where actor_id = any(v_ids)),
    'residual_crew_activity',       (select count(*) from public.crew_activity where actor_id = any(v_ids) or participant_id = any(v_ids)),
    'residual_dragonshare_events',  (select count(*) from public.dragonshare_events where actor_user_id = any(v_ids)),
    'residual_orgs',                (select count(*) from public.organizations where id = any(coalesce(v_org_ids, '{}'))),
    'residual_org_units',           (select count(*) from public.org_units where org_id = any(coalesce(v_org_ids, '{}')))
  );
  return v_report;
end; $$;
revoke execute on function public.purge_synthetic_load_cohort() from public, anon, authenticated;
grant  execute on function public.purge_synthetic_load_cohort() to service_role;

-- ------------------------------------------------------------
-- Also patch the FULL purge_synthetic_data() (used by the `purge` subcommand, which resets ALL
-- synthetic incl. the live 25): the behavior-mix notification leg creates push_notifications with a
-- synthetic actor_id (NO-ACTION FK to profiles), which would block its auth.users→profiles cascade
-- exactly like the crew tables did (20260724011000). Leaf-delete it first. (Reproduced from
-- 20260724011000 with the one added delete + residual.)
-- ------------------------------------------------------------
create or replace function public.purge_synthetic_data()
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_ids uuid[]; v_email_ids uuid[]; v_org_ids uuid[]; v_report jsonb;
begin
  select array_agg(user_id order by user_id) into v_ids from public.synthetic_users;
  select array_agg(id order by id) into v_email_ids from auth.users where email like '%@synthetic.dragoncandy.test';
  if coalesce(v_ids,'{}') is distinct from coalesce(v_email_ids,'{}') then
    raise warning 'purge_synthetic_data: registry/email drift; unioning both sets';
    v_ids := (select array_agg(distinct u) from unnest(coalesce(v_ids,'{}') || coalesce(v_email_ids,'{}')) u);
  end if;
  if v_ids is null then return jsonb_build_object('purged',0,'note','no synthetic users'); end if;
  select array_agg(distinct m.org_id) into v_org_ids from public.org_members m where m.user_id = any(v_ids) and m.role='owner';
  delete from public.payment_events where is_synthetic;
  delete from public.analytics_events where is_synthetic;
  delete from public.dragonshare_events where is_synthetic;
  delete from public.pricing_funnel_events where is_synthetic;
  delete from public.donny_cost_ledger where is_synthetic;
  -- NO-ACTION FKs to profiles that block the auth.users -> profiles cascade (leaf-first):
  delete from public.push_notifications where actor_id = any(v_ids);
  delete from public.crew_activity where actor_id = any(v_ids) or participant_id = any(v_ids);
  delete from public.creator_group_members where creator_id = any(v_ids) or invited_by = any(v_ids);
  delete from auth.users where id = any(v_ids);
  if v_org_ids is not null then
    delete from public.org_units where org_id = any(v_org_ids);
    delete from public.organizations where id = any(v_org_ids);
  end if;
  v_report := jsonb_build_object('purged_users',array_length(v_ids,1),
    'residual_synthetic_users',(select count(*) from public.synthetic_users),
    'residual_email_users',(select count(*) from auth.users where email like '%@synthetic.dragoncandy.test'),
    'residual_payment_events',(select count(*) from public.payment_events where is_synthetic),
    'residual_analytics_events',(select count(*) from public.analytics_events where is_synthetic),
    'residual_dragonshare_events',(select count(*) from public.dragonshare_events where is_synthetic),
    'residual_pricing_funnel_events',(select count(*) from public.pricing_funnel_events where is_synthetic),
    'residual_cost_ledger',(select count(*) from public.donny_cost_ledger where is_synthetic),
    'residual_push_notifications',(select count(*) from public.push_notifications where actor_id = any(v_ids)),
    'residual_crew_members',(select count(*) from public.creator_group_members where creator_id = any(v_ids) or invited_by = any(v_ids)),
    'residual_crew_activity',(select count(*) from public.crew_activity where actor_id = any(v_ids) or participant_id = any(v_ids)),
    'residual_orgs',(select count(*) from public.organizations where id = any(coalesce(v_org_ids,'{}'))),
    'residual_org_units',(select count(*) from public.org_units where org_id = any(coalesce(v_org_ids,'{}'))));
  return v_report;
end; $function$;
