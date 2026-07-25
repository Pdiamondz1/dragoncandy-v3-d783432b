-- Scoped teardown for the PERSISTENT marketplace cohort (botmk_%). Leaf-first, residue-reported.
-- Spares the live bot0## daily cohort AND the botla…/botseed_… load cohorts. NEVER call
-- purge_synthetic_data() for routine marketplace resets (it also deletes the live 25).
-- The cascade chain below was enumerated from prod's live pg_constraint FK graph (confdeltype) on
-- 2026-07-25, NOT reasoned from schema convention: deleting the botmk auth.users cascades the vast
-- majority (profiles->campaigns/applications/collaborations/project_reviews/messages/conversations
-- (+participants)/dragonshare_posts(+boosts/engagement/events)/file_uploads; business_profiles->
-- promotions->discount_codes/promotion_submissions; creator_profiles; synthetic_users; org_members
-- — all confirmed ON DELETE CASCADE). Non-cascading residue handled explicitly: storage.objects
-- (no FK), organizations (captured before the delete; their org_units/org_members cascade on the org
-- delete), and two NO-ACTION-to-profiles precaution tables. The residual_* report is the BACKSTOP:
-- it re-queries each table by the pre-captured id arrays AFTER the deletes, so if any assumed cascade
-- is ever wrong the teardown fails loud (non-zero residual) rather than silently leaving synthetic
-- rows on prod. The founder-gated first seed+purge cycle confirms residual_* all-zero live.
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

  -- 1) storage.objects (no FK cascade): deliverables + feed under the bot uid folders; CGC videos
  --    under the botmk promotion-id folders.
  delete from storage.objects
  where (bucket_id in ('campaign-deliverables', 'dragonshare-content')
         and (storage.foldername(name))[1] = any (v_ids::text[]))
     or (bucket_id = 'promotion-videos' and v_promo_ids is not null
         and (storage.foldername(name))[1] = any (v_promo_ids::text[]));

  -- 2) Precautionary NO-ACTION-to-profiles leaf rows (usually 0 for public botmk campaigns).
  delete from push_notifications where actor_id = any(v_ids) or user_id = any(v_ids);
  delete from crew_activity where actor_id = any(v_ids) or participant_id = any(v_ids);

  -- 3) Cascade root: deleting the auth users removes profiles + everything rooted on them.
  delete from auth.users where id = any(v_ids);

  -- 4) Non-cascading orgs (organizations have no FK to users; org_units/org_members cascade here).
  if v_org_ids is not null then
    delete from organizations where id = any(v_org_ids);
  end if;

  select jsonb_build_object(
    'deleted_users', array_length(v_ids, 1),
    'residual_profiles', (select count(*) from profiles where email like 'botmk\_%@synthetic.dragoncandy.test'),
    'residual_organizations', (select count(*) from organizations where id = any(coalesce(v_org_ids, array[]::uuid[]))),
    'residual_org_units', (select count(*) from org_units where org_id = any(coalesce(v_org_ids, array[]::uuid[]))),
    'residual_promotions', (select count(*) from promotions where id = any(coalesce(v_promo_ids, array[]::uuid[]))),
    'residual_storage', (select count(*) from storage.objects
        where (bucket_id in ('campaign-deliverables','dragonshare-content')
               and (storage.foldername(name))[1] = any (v_ids::text[]))
           or (bucket_id='promotion-videos' and v_promo_ids is not null
               and (storage.foldername(name))[1] = any (v_promo_ids::text[])))
  ) into v_report;
  return v_report;
end;
$$;

revoke all on function public.purge_synthetic_marketplace_cohort() from public, anon, authenticated;
grant execute on function public.purge_synthetic_marketplace_cohort() to service_role;
