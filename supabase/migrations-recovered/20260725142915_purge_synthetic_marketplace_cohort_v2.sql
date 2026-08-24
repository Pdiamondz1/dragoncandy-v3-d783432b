-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260725142915 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

create or replace function public.purge_synthetic_marketplace_cohort()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_org_ids uuid[];
  v_promo_ids uuid[];
  v_conv_ids uuid[];
  v_report jsonb;
begin
  select array_agg(p.id) into v_ids
  from profiles p
  where p.email like 'botmk\_%@synthetic.dragoncandy.test';

  if v_ids is null then
    return jsonb_build_object('deleted_users', 0, 'note', 'no botmk cohort present');
  end if;

  select array_agg(distinct m.org_id) into v_org_ids
  from org_members m
  where m.user_id = any(v_ids) and m.role = 'owner';

  select array_agg(pr.id) into v_promo_ids
  from promotions pr
  join business_profiles bp on bp.id = pr.business_id
  where bp.user_id = any(v_ids);

  select array_agg(distinct cp.conversation_id) into v_conv_ids
  from conversation_participants cp
  where cp.user_id = any(v_ids)
    and not exists (
      select 1 from conversation_participants cp2
      where cp2.conversation_id = cp.conversation_id and cp2.user_id <> all(v_ids)
    );

  delete from storage.objects
  where (bucket_id in ('campaign-deliverables', 'dragonshare-content', 'profile-assets')
         and (storage.foldername(name))[1] = any (v_ids::text[]))
     or (bucket_id = 'promotion-videos' and v_promo_ids is not null
         and (storage.foldername(name))[1] = any (v_promo_ids::text[]));

  delete from push_notifications where actor_id = any(v_ids) or user_id = any(v_ids);
  delete from crew_activity where actor_id = any(v_ids) or participant_id = any(v_ids);

  delete from auth.users where id = any(v_ids);

  if v_conv_ids is not null then
    delete from conversations where id = any(v_conv_ids);
  end if;
  if v_org_ids is not null then
    delete from organizations where id = any(v_org_ids);
  end if;

  select jsonb_build_object(
    'deleted_users', array_length(v_ids, 1),
    'residual_profiles', (select count(*) from profiles where email like 'botmk\_%@synthetic.dragoncandy.test'),
    'residual_organizations', (select count(*) from organizations where id = any(coalesce(v_org_ids, array[]::uuid[]))),
    'residual_org_units', (select count(*) from org_units where org_id = any(coalesce(v_org_ids, array[]::uuid[]))),
    'residual_promotions', (select count(*) from promotions where id = any(coalesce(v_promo_ids, array[]::uuid[]))),
    'residual_conversations', (select count(*) from conversations where id = any(coalesce(v_conv_ids, array[]::uuid[]))),
    'residual_storage', (select count(*) from storage.objects
        where (bucket_id in ('campaign-deliverables','dragonshare-content','profile-assets')
               and (storage.foldername(name))[1] = any (v_ids::text[]))
           or (bucket_id='promotion-videos' and v_promo_ids is not null
               and (storage.foldername(name))[1] = any (v_promo_ids::text[])))
  ) into v_report;
  return v_report;
end;
$$;

revoke all on function public.purge_synthetic_marketplace_cohort() from public, anon, authenticated;
grant execute on function public.purge_synthetic_marketplace_cohort() to service_role;
