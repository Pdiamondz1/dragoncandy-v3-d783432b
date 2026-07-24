-- Fix purge_synthetic_data() teardown: leaf-delete the Phase 1 crew tables before the cascade.
--
-- Discovered by the Phase 1 live smoke (2026-07-24): purge_synthetic_data() relied on
-- `delete from auth.users -> profiles CASCADE -> everything`, but two Phase 1 crew tables have
-- NO ACTION foreign keys to profiles that BLOCK that cascade:
--   * creator_group_members.invited_by  -> profiles  (NO ACTION)
--   * crew_activity.actor_id            -> profiles  (NO ACTION)
--   * crew_activity.participant_id      -> profiles  (NO ACTION)
-- (creator_group_members.creator_id/group_id and every other bot-touched table -- campaigns,
-- campaign_applications, campaign_collaborations, file_uploads, project_reviews, creator_groups --
-- are ON DELETE CASCADE and clear automatically.) Phase 0's purge predates the crew lane, so it
-- never deleted these rows; the first real prod purge failed with
-- "creator_group_members_invited_by_fkey" and rolled back.
--
-- Fix: remove synthetic rows from crew_activity + creator_group_members leaf-first, and add both
-- to the residual report so the fail-loud purge (sim/run.ts) still proves zero residue.

CREATE OR REPLACE FUNCTION public.purge_synthetic_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Phase 1 crew lane: NO ACTION FKs to profiles (invited_by / actor_id / participant_id) block the
  -- auth.users -> profiles cascade below unless these synthetic rows are removed leaf-first.
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
    'residual_crew_members',(select count(*) from public.creator_group_members where creator_id = any(v_ids) or invited_by = any(v_ids)),
    'residual_crew_activity',(select count(*) from public.crew_activity where actor_id = any(v_ids) or participant_id = any(v_ids)),
    'residual_orgs',(select count(*) from public.organizations where id = any(coalesce(v_org_ids,'{}'))),
    'residual_org_units',(select count(*) from public.org_units where org_id = any(coalesce(v_org_ids,'{}'))));
  return v_report;
end; $function$;
